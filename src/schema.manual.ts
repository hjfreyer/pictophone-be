
import * as db from './db'
import { Live, Diff, Change, Readable } from './interfaces'
import * as model from './model'
import { validate as validateModel } from './model/index.validator'
import { validateLive, applyChanges, diffToChange, getActionId } from './schema'
import * as readables from './readables'
import * as util from './util'
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"

import {
    Inputs1_1_0, Inputs1_1_1, Outputs1_1_0, Outputs1_1_1, Tables, openAll, getTrackedInputs1_1_0
    , applyOutputs1_1_0, getTrackedInputs1_1_1
    , applyOutputs1_1_1
} from './schema.auto'

export interface Integrator1_1_0 {
    integrate(action: model.AnyAction, inputs: Inputs1_1_0): Promise<util.Result<Outputs1_1_0, model.AnyError>>
}

export interface Integrator1_1_1 {
    integrate(action: model.AnyAction, inputs: Inputs1_1_1): Promise<util.Result<Outputs1_1_1, model.AnyError>>
}

export class Framework {
    constructor(private tx: db.TxRunner, private i1_1_0: Integrator1_1_0, private i1_1_1: Integrator1_1_1) { }

    handleAction(action: model.AnyAction): Promise<model.AnyError | null> {
        return this.tx(async (db: db.Database): Promise<model.AnyError | null> => {
            const ts = openAll(db);
            const [actionId, savedAction, maybeError] = await integrateLive(
                getTrackedInputs1_1_0, this.i1_1_0.integrate, applyOutputs1_1_0, ts, action);

            await replayCollection('state-1.1.1', getTrackedInputs1_1_1,
                this.i1_1_1.integrate, applyOutputs1_1_1, ts, actionId, savedAction);

            return maybeError;
        });
    }
}

async function integrateLive<Inputs, Outputs>(
    inputGetter: (ts: Tables) => [Set<string>, Inputs],
    integrator: (a: model.AnyAction, inputs: Inputs) => Promise<util.Result<Outputs, model.AnyError>>,
    outputSaver: (ts: Tables, actionId: string, outputs: Outputs) => void,
    ts: Tables,
    action: model.AnyAction): Promise<[string, model.SavedAction, model.AnyError | null]> {
    // Set up inputs.
    const [parentSet, inputs] = inputGetter(ts);

    // Get outputs.
    const outputsOrError = await integrator(action, inputs)

    // Save the action and metadata.
    const savedAction: model.SavedAction = { parents: util.sorted(parentSet), action }
    const actionId = getActionId(savedAction)

    ts.actions.set([actionId], savedAction);

    if (outputsOrError.status === 'ok') {
        outputSaver(ts, actionId, outputsOrError.value)
    }

    return [actionId, savedAction, outputsOrError.status === 'ok' ? null : outputsOrError.error];
}

async function replayCollection<Inputs, Outputs>(
    collectionId: string,
    inputGetter: (ts: Tables) => [Set<string>, Inputs],
    integrator: (a: model.AnyAction, inputs: Inputs) => Promise<util.Result<Outputs, model.AnyError>>,
    outputSaver: (ts: Tables, actionId: string, outputs: Outputs) => void,
    ts: Tables,
    actionId: string,
    savedAction: model.SavedAction): Promise<void> {
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

    if (outputs.status === 'ok') {
        outputSaver(ts, actionId, outputs.value)
    }
}
