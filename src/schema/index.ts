
import deepEqual from 'deep-equal';
import * as ixa from "ix/asynciterable";
import * as ixaop from "ix/asynciterable/operators";
import { getActionId } from '../base';
import * as db from '../db';
import { Diff, ItemIterable, Range, Readable, Live } from '../interfaces';
import * as model from '../model';
import { AnyAction, AnyError, SavedAction } from '../model';
import { validate as validateModel } from '../model/index.validator';
import * as ranges from '../ranges';
import * as readables from '../readables';
import * as util from '../util';
import {
    openAll, readAll, replayAll, COLLECTION_IDS, PRIMARY_COLLECTION_ID, SECONDARY_COLLECTION_IDS, SPEC,
    liveReplaySecondaries

} from './auto';
import { Metadata, IOSpec, Outputs } from './interfaces';
import { CollectionId } from './interfaces.validator';

export * from './auto';
export * from './interfaces';

export type Tables = {
    [C in CollectionId]: {
        meta: db.Table<Metadata[C]>
        live: {
            [T in keyof IOSpec[C]['live']]: db.Table<Live<IOSpec[C]['live'][T]>>
        }
        exports: {
            [T in keyof IOSpec[C]['exports']]: db.Table<Live<IOSpec[C]['exports'][T]>>
        }
    }
}

export type SideInputs = {
    [C in CollectionId]: {
        [T in keyof IOSpec[C]['live']]: Readable<IOSpec[C]['live'][T]>
    }
}

type ToSchemaType<Live, Exports> = {
    live: { [K in keyof Live]: string[] }
    exports: { [K in keyof Exports]: string[] }
}

export type SpecType = {
    [C in CollectionId]: SpecEntry<C, ToSchemaType<IOSpec[C]['live'], IOSpec[C]['exports']>, Metadata[C], SideInputs[C], Outputs[C]>
}

export interface SpecEntry<C extends CollectionId, SchemaType, MetadataType, SideInputsType, OutputsType> {
    collectionId: C
    schemata: SchemaType
    selectMetadata(ts: Tables): db.Table<MetadataType>
    selectSideInputs(rs: SideInputs): SideInputsType
    selectIntegrator(integrators: Integrators): (action: model.AnyAction, inputs: SideInputsType) =>
        Promise<util.Result<OutputsType, model.AnyError>>
    replaySideInputs(metas: AsyncIterable<MetadataType>): SideInputsType
    emptyOutputs(): OutputsType
    outputToMetadata(outputs: OutputsType): MetadataType
    applyOutputs(ts: Tables, actionId: string, outputs: OutputsType): void
}

export type Integrators = {
    [K in CollectionId]: (action: model.AnyAction, inputs: SideInputs[K]) =>
        Promise<util.Result<Outputs[K], model.AnyError>>
}

export function sortedDiffs<T>(diffs: Iterable<Diff<T>>): Diff<T>[] {
    return util.sorted(diffs, (d1, d2) => util.lexCompare(d1.key, d2.key));
}

async function livePrimary<C extends CollectionId, SchemaType, MetadataType, SideInputsType, OutputsType>(
    specEntry: SpecEntry<C, SchemaType, MetadataType, SideInputsType, OutputsType>,
    ts: Tables,
    integrators: Integrators, action: model.AnyAction): Promise<[string, SavedAction, model.AnyError | null]> {
    const [parents, rs] = readAll(ts);

    const outsOrError = await specEntry.selectIntegrator(integrators)(action, specEntry.selectSideInputs(rs));
    const outs = util.or_else(outsOrError, specEntry.emptyOutputs);

    // Save the action and metadata.
    const savedAction: SavedAction = { parents: util.sorted(parents), action }
    const actionId = getActionId(savedAction)
    specEntry.applyOutputs(ts, actionId, outs);

    return [actionId, savedAction, util.err_or_else(outsOrError, () => null)];
}

export async function liveReplay<C extends CollectionId, SchemaType, MetadataType, SideInputsType, OutputsType>(
    specEntry: SpecEntry<C, SchemaType, MetadataType, SideInputsType, OutputsType>,
    ts: Tables,
    integrators: Integrators,
    actionId: string, savedAction: SavedAction): Promise<void> {
    try {

        const [parents, rs] = readAll(ts);

        const parentMetas = ixa.from(savedAction.parents).pipe(
            ixaop.map(p => readables.get(specEntry.selectMetadata(ts), [p], null)),
        )

        if (await ixa.some(parentMetas, meta => meta === null)) {
            console.log(`- ${specEntry.collectionId}: NOT READY TO LIVE-REPLAY`)
            return;
        }

        const res = await specEntry.selectIntegrator(integrators)(savedAction.action, specEntry.selectSideInputs(rs));
        specEntry.applyOutputs(ts, actionId, util.or_else(res, specEntry.emptyOutputs));
    } catch (e) {
        console.log(`error while live replaying secondary collection ${specEntry.collectionId}:`, e)
    }
}

export async function replayOrCheck<C extends CollectionId, SchemaType, MetadataType, SideInputsType, OutputsType>(
    specEntry: SpecEntry<C, SchemaType, MetadataType, SideInputsType, OutputsType>,
    tx: db.TxRunner,
    integrators: Integrators,
    actionId: string, savedAction: SavedAction): Promise<void> {
    try {
        await tx(async (db: db.Database): Promise<void> => {
            const ts = openAll(db);
            const parentMetas = ixa.from(savedAction.parents).pipe(
                ixaop.map(p => readables.get(specEntry.selectMetadata(ts), [p], null)),
            )

            if (await ixa.some(parentMetas, meta => meta === null)) {
                console.log(`- ${specEntry.collectionId}: NOT READY TO REPLAY`)
                return;
            }
            const inputs: SideInputsType = specEntry.replaySideInputs(parentMetas as AsyncIterable<MetadataType>);
            const outputs = util.or_else((await specEntry.selectIntegrator(integrators)(
                savedAction.action, inputs)), specEntry.emptyOutputs);

            const meta = await readables.get(specEntry.selectMetadata(ts), [actionId], null);
            if (meta === null) {
                // Have to backfill.
                specEntry.applyOutputs(ts, actionId, outputs);
                console.log(`- ${specEntry.collectionId}: REPLAYED`)
            } else {
                if (!deepEqual(specEntry.outputToMetadata(outputs), meta)) {
                    throw new Error(`- ${specEntry.collectionId}: INCONSISTENT`)
                }
                console.log(`- ${specEntry.collectionId}: CHECKED`)
            }
        });
    } catch (e) {
        console.log(`error replaying collection ${specEntry.collectionId}:`, e)
    }
}

export class Framework {
    constructor(private tx: db.TxRunner, private integrators: Integrators) { }

    handleAction(action: AnyAction): Promise<AnyError | null> {
        return this.tx(async (db: db.Database): Promise<AnyError | null> => {
            const actionTable = openActions(db);
            const ts = openAll(db);

            const [actionId, savedAction, maybeError] =
                await livePrimary(SPEC[PRIMARY_COLLECTION_ID], ts, this.integrators, action);
            actionTable.set([actionId], savedAction);

            await liveReplaySecondaries(ts, this.integrators, actionId, savedAction);

            return maybeError;
        });
    }

    async handleReplay(): Promise<void> {
        let cursor: string = '';
        console.log('REPLAY')
        while (true) {
            const nextActionOrNull = await getNextAction(this.tx, cursor);
            if (nextActionOrNull === null) {
                break;
            }
            const [actionId, savedAction] = nextActionOrNull;
            console.log(`REPLAY ${actionId}`)

            await replayAll(this.tx, this.integrators, actionId, savedAction)
            cursor = actionId;
        }
        console.log('DONE')
    }

    async handleReexport(): Promise<void> {
        await copyTable(this.tx,
            (db) => openAll(db)['1.0.2'].live.gamesByPlayer,
            (db) => openAll(db)['1.0.2'].exports.gamesByPlayer)
    }
}

export async function copyTable<T>(tx: db.TxRunner,
    srcTableGetter: (db: db.Database) => db.Table<T>,
    dstTableGetter: (db: db.Database) => db.Table<T>): Promise<void> {
    // TODO: Single TX = no bueno. Can also be a lot more efficient by taking
    // advantage of the fact that both collections are sorted (i.e. do merge
    // and diff).
    await tx(async (db: db.Database): Promise<void> => {
        const srcTable = srcTableGetter(db);
        const dstTable = dstTableGetter(db);

        for await (const [key, value] of readables.readAll(srcTable)) {
            dstTable.set(key, value);
        }
    })
    await tx(async (db: db.Database): Promise<void> => {
        const srcTable = srcTableGetter(db);
        const dstTable = dstTableGetter(db);

        for await (const [key,] of readables.readAll(dstTable)) {
            if ((await readables.getOrDefault(srcTable, key, null)).is_default) {
                dstTable.delete(key);
            }
        }
    })
}

export async function deleteCollection(runner: db.TxRunner, collectionId: CollectionId): Promise<void> {
    await runner(async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        if (!(collectionId in ts)) {
            throw new Error(`no such collection: '${collectionId}'`)
        }
        const metaTable: db.Table<unknown> = ts[collectionId].meta;
        for await (const [k,] of readables.readAll(metaTable)) {
            metaTable.delete(k)
        }
        for (const tableId in ts[collectionId].live) {
            const table: db.Table<unknown> = ts[collectionId].live[
                tableId as keyof Tables[CollectionId]['live']];
            for await (const [k,] of readables.readAll(table)) {
                table.delete(k)
            }
        }
    })
}

export function getNextAction(tx: db.TxRunner, startAfter: string): Promise<([string, SavedAction] | null)> {
    return tx(async (db: db.Database): Promise<([string, SavedAction] | null)> => {
        const actions = openActions(db);
        const first = await ixa.first(ixa.from(readables.readAllAfter(actions, [startAfter])));
        if (first === undefined) {
            return null;
        }
        const [[actionId], savedAction] = first;
        return [actionId, savedAction];
    });
}

export function readableFromDiffs<S, T>(source: AsyncIterable<S>,
    selector: (s: S) => Diff<T>[],
    schema: string[]): Readable<T> {
    const sortedItems = ixa.from(source).pipe(
        ixaop.flatMap(src => ixa.from(selector(src))),
        ixaop.flatMap((diff): ItemIterable<T> => {
            switch (diff.kind) {
                case 'add':
                    return ixa.of([diff.key, diff.value])
                case 'delete':
                    return ixa.empty()
                case 'replace':
                    return ixa.of([diff.key, diff.newValue])
            }
        }),
        ixaop.orderBy(([key,]) => key, util.lexCompare),
    );
    return {
        schema,
        read(range: Range): ItemIterable<T> {
            return sortedItems.pipe(
                ixaop.skipWhile(([key,]) => !ranges.contains(range, key)),
                ixaop.takeWhile(([key,]) => ranges.contains(range, key)),
            )
        }
    };
}

export function openActions(db: db.Database): db.Table<model.SavedAction> {
    return db.open({
        schema: ['actions'],
        validator: validateModel('SavedAction')
    })
}
