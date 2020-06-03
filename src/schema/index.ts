
import * as db from '../db'
import { Live, Diff, Change, Readable } from '../interfaces'
import { validate as validateModel } from '../model/index.validator'
import { AnyAction, AnyError, SavedAction } from '../model';
import * as model from '../model';
import { sha256 } from 'js-sha256';
import _ from 'lodash';
import {
    Tables, openAll, readAll,
    //getSecondaryLiveIntegrators,
    Integrators, //getAllReplayers
} from './auto';
import * as util from '../util'
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import * as readables from '../readables'
import { getActionId } from '../base';
import { getInputs1_0_0, getInputs1_0_1, Outputs1_0_0, Outputs1_0_1, applyOutputs1_0_0, emptyOutputs1_0_0, emptyOutputs1_0_1, replayInputs1_0_0, getMetadata1_0_0 } from './manual';
import deepEqual from 'deep-equal';

export * from './auto';

export class Framework {
    constructor(private tx: db.TxRunner, private integrators: Integrators) { }

    handleAction(action: AnyAction): Promise<AnyError | null> {
        return this.tx(async (db: db.Database): Promise<AnyError | null> => {
            const ts = openAll(db);
            const [parents, rs] = readAll(ts);

            const outs1_0_0OrError = await this.integrators.integrate1_0_0(action, getInputs1_0_0(rs));
            const outs1_0_0 = util.or_else(outs1_0_0OrError, emptyOutputs1_0_0);

            // Save the action and metadata.
            const savedAction: SavedAction = { parents: util.sorted(parents), action }
            const actionId = getActionId(savedAction)


            ts.actions.set([actionId], savedAction);
            applyOutputs1_0_0(ts, actionId, outs1_0_0);

            // const parentMetas1_0_1 = ixa.from(savedAction.parents).pipe(
            //     ixaop.map(p => readables.get(ts.actionTableMetadata, [p, '1.0.1'], null)),
            // )

            // if (await ixa.every(parentMetas1_0_1, meta => meta !== null)) {
            //     const outs1_0_1OrError = await this.integrators.integrate1_0_1({
            //         games: outs1_0_0.games,
            //     }, getInputs1_0_1(rs));
            //     const outs1_0_1 = util.or_else(outs1_0_1OrError, emptyOutputs1_0_1);
            //     applyOutputs1_0_1(ts, actionId, outs1_0_1);
            // }

            return util.err_or_else(outs1_0_0OrError, () => null);
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

            await this.tx(async (db: db.Database): Promise<void> => {
                const collectionId = '1.0.0';
                const ts = openAll(db);
                const meta = await readables.get(ts.meta_1_0_0, [actionId], null);
                if (meta === null) {
                    // Have to backfill.
                    const parentMetas = ixa.from(savedAction.parents).pipe(
                        ixaop.map(p => readables.get(ts.meta_1_0_0, [p], null)),
                    )

                    if (await ixa.some(parentMetas, meta => meta === null)) {
                        console.log(`- ${collectionId}: NOT READY TO REPLAY`)
                        return;
                    }

                    const inputs = replayInputs1_0_0(
                        parentMetas as AsyncIterable<model.Metadata1_0_0>);
                    const res = await this.integrators.integrate1_0_0(
                        savedAction.action, inputs);
                    applyOutputs1_0_0(ts, actionId, util.or_else(res, emptyOutputs1_0_0))
                    console.log(`- ${collectionId}: REPLAYED`)
                    return;
                } else {
                    // Already done, check we get the same answer.
                    const parentMetas = ixa.from(savedAction.parents).pipe(
                        ixaop.map(p => readables.get(ts.meta_1_0_0, [p], null)),
                    )

                    if (await ixa.some(parentMetas, meta => meta === null)) {
                        console.log(`- ${collectionId}: NOT READY TO CHECK`)
                        return;
                    }

                    const inputs = replayInputs1_0_0(
                        parentMetas as AsyncIterable<model.Metadata1_0_0>);
                    const res = await this.integrators.integrate1_0_0(
                        savedAction.action, inputs);
                    const outputs = util.or_else(res, emptyOutputs1_0_0)
                    if (!deepEqual(getMetadata1_0_0(outputs), meta)) {
                        throw new Error(`- ${collectionId}: INCONSISTENT`)
                    }
                    console.log(`- ${collectionId}: CHECKED`)
                    return;
                }
            });
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

// export async function integrateReplay<Inputs, Outputs>(
//     collectionId: string,
//     inputGetter: (ts: Tables) => [Set<string>, Inputs],
//     integrator: (a: AnyAction, inputs: Inputs) => Promise<util.Result<Outputs, AnyError>>,
//     outputSaver: (ts: Tables, actionId: string, outputs: Outputs) => void,
//     emptyOutputs: () => Outputs,
//     ts: Tables,
//     actionId: string,
//     savedAction: SavedAction): Promise<void> {
//     // Set up inputs.
//     const [parentSet, inputs] = inputGetter(ts);

//     const meta = await readables.get(ts.actionTableMetadata, [actionId, collectionId], null);
//     if (meta !== null) {
//         // Already done.
//         console.log(`- ${collectionId}: PASS`)
//         return;
//     }

//     const parentMetas = ixa.from(savedAction.parents).pipe(
//         ixaop.map(p => readables.get(ts.actionTableMetadata, [p, collectionId], null)),
//     )

//     if (await ixa.some(parentMetas, meta => meta === null)) {
//         console.log(`- ${collectionId}: PASS`)
//         return;
//     }
//     console.log(`- ${collectionId}: REPLAY`)
//     const outputs = await integrator(savedAction.action, inputs);

//     for (const usedParent of parentSet) {
//         if (savedAction.parents.indexOf(usedParent) === -1) {
//             throw new Error("tried to access state not specified by a parent")
//         }
//     }

//     outputSaver(ts, actionId, outputs.status === 'ok' ? outputs.value : emptyOutputs());
// }

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

// export async function deleteMeta(runner: db.TxRunner, collectionId: string): Promise<void> {
//     await runner(async (db: db.Database): Promise<void> => {
//         const ts = openAll(db);
//         for await (const [k,] of readables.readAll(ts.actionTableMetadata)) {
//             if (k[k.length - 1] === collectionId) {
//                 ts.actionTableMetadata.delete(k)
//             }
//         }
//     })
// }

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
