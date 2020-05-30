
import * as db from '../db'
import { Live, Diff, Change } from '../interfaces'
import { validate as validateModel } from '../model/index.validator'
import { AnyAction, AnyError, SavedAction } from '../model';
import { sha256 } from 'js-sha256';
import _ from 'lodash';
import { Tables } from './auto';
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

    if (outputsOrError.status === 'ok') {
        outputSaver(ts, actionId, outputsOrError.value)
    }

    return [actionId, savedAction, outputsOrError.status === 'ok' ? null : outputsOrError.error];
}

export async function integrateReplay<Inputs, Outputs>(
    collectionId: string,
    inputGetter: (ts: Tables) => [Set<string>, Inputs],
    integrator: (a: AnyAction, inputs: Inputs) => Promise<util.Result<Outputs, AnyError>>,
    outputSaver: (ts: Tables, actionId: string, outputs: Outputs) => void,
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

    if (outputs.status === 'ok') {
        outputSaver(ts, actionId, outputs.value)
    }
}
