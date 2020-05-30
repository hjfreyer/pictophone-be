
import * as db from '../db'
import { Live, Diff, Change } from '../interfaces'
import { validate as validateModel } from '../model/index.validator'
import { AnyAction, AnyError, SavedAction } from '../model';
import { sha256 } from 'js-sha256';
import _ from 'lodash';
import {
    Tables, openAll, getPrimaryLiveIntegrator,
    getSecondaryLiveIntegrators, Integrators, getAllReplayers
} from './auto';
import * as util from '../util'
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import * as readables from '../readables'
import { getActionId } from '../base';

export * from './auto';

export class Framework {
    constructor(private tx: db.TxRunner, private integrators: Integrators) { }

    handleAction(action: AnyAction): Promise<AnyError | null> {
        return this.tx(async (db: db.Database): Promise<AnyError | null> => {
            const ts = openAll(db);

            const [actionId, savedAction, maybeError] =
                await getPrimaryLiveIntegrator(this.integrators)(ts, action);

            for (const secondary of getSecondaryLiveIntegrators(this.integrators)) {
                await secondary(ts, actionId, savedAction);
            }

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

            for (const replayer of getAllReplayers(this.integrators, actionId, savedAction)) {
                await this.tx((db: db.Database): Promise<void> => {
                    return replayer(openAll(db));
                });
            }
            cursor = actionId;
        }
        console.log('DONE')
    }
}

export async function integrateLive<Inputs, Outputs>(
    inputGetter: (ts: Tables) => [Set<string>, Inputs],
    integrator: (a: AnyAction, inputs: Inputs) => Promise<util.Result<Outputs, AnyError>>,
    outputSaver: (ts: Tables, actionId: string, outputs: Outputs) => void,
    emptyOutputs: () => Outputs,
    ts: Tables,
    action: AnyAction): Promise<[string, SavedAction, AnyError | null]> {
    // Set up inputs.
    const [parentSet, inputs] = inputGetter(ts);

    // Get outputs.
    const outputsOrError = await integrator(action, inputs)

    // Save the action and metadata.
    const savedAction: SavedAction = { parents: util.sorted(parentSet), action }
    const actionId = getActionId(savedAction)

    ts.actions.set([actionId], savedAction);

    outputSaver(ts, actionId, outputsOrError.status === 'ok' ? outputsOrError.value : emptyOutputs());

    return [actionId, savedAction, outputsOrError.status === 'ok' ? null : outputsOrError.error];
}

export async function integrateReplay<Inputs, Outputs>(
    collectionId: string,
    inputGetter: (ts: Tables) => [Set<string>, Inputs],
    integrator: (a: AnyAction, inputs: Inputs) => Promise<util.Result<Outputs, AnyError>>,
    outputSaver: (ts: Tables, actionId: string, outputs: Outputs) => void,
    emptyOutputs: () => Outputs,
    ts: Tables,
    actionId: string,
    savedAction: SavedAction): Promise<void> {
    // Set up inputs.
    const [parentSet, inputs] = inputGetter(ts);

    const meta = await readables.get(ts.actionTableMetadata, [actionId, collectionId], null);
    if (meta !== null) {
        // Already done.
        console.log(`- ${collectionId}: PASS`)
        return;
    }

    const parentMetas = ixa.from(savedAction.parents).pipe(
        ixaop.map(p => readables.get(ts.actionTableMetadata, [p, collectionId], null)),
    )

    if (await ixa.some(parentMetas, meta => meta === null)) {
        console.log(`- ${collectionId}: PASS`)
        return;
    }
    console.log(`- ${collectionId}: REPLAY`)
    const outputs = await integrator(savedAction.action, inputs);

    for (const usedParent of parentSet) {
        if (savedAction.parents.indexOf(usedParent) === -1) {
            throw new Error("tried to access state not specified by a parent")
        }
    }

    outputSaver(ts, actionId, outputs.status === 'ok' ? outputs.value : emptyOutputs());
}

export async function deleteTable(runner: db.TxRunner, tableId: keyof Tables): Promise<void> {
    if (tableId === 'actions') {
        throw new Error('nope')
    }
    await runner(async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        if (!(tableId in ts)) {
            throw new Error(`no such table: '${tableId}'`)
        }
        const table: db.Table<unknown> = ts[tableId as keyof typeof ts];
        for await (const [k,] of readables.readAll(table)) {
            table.delete(k)
        }
    })
}

export async function deleteMeta(runner: db.TxRunner, collectionId: string): Promise<void> {
    await runner(async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        for await (const [k,] of readables.readAll(ts.actionTableMetadata)) {
            if (k[k.length - 1] === collectionId) {
                ts.actionTableMetadata.delete(k)
            }
        }
    })
}

export function getNextAction(tx: db.TxRunner, startAfter: string): Promise<([string, SavedAction] | null)> {
    return tx(async (db: db.Database): Promise<([string, SavedAction] | null)> => {
        const tables = openAll(db);
        const first = await ixa.first(ixa.from(readables.readAllAfter(tables.actions, [startAfter])));
        if (first === undefined) {
            return null;
        }
        const [[actionId], savedAction] = first;
        return [actionId, savedAction];
    });
}
