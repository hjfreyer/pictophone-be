
import * as db from '../db'
import { Live, Diff, Change } from '../interfaces'
import { validate as validateModel } from '../model/index.validator'
import { AnyAction, AnyError, SavedAction } from '../model';
import { sha256 } from 'js-sha256';
import _ from 'lodash';
import { Tables, openAll } from './auto';
import * as util from '../util'
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import * as readables from '../readables'
import { getActionId } from '../base';

export * from './auto';
export * from './manual'

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
