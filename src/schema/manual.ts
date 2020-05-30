
import * as db from '../db'
import { Key, Live, Diff, Change, Readable } from '../interfaces'
import * as model from '../model'
import { validate as validateModel } from '../model/index.validator'
import { integrateLive, integrateReplay, getNextAction } from '../schema'
import { validateLive, applyChanges, diffToChange, getActionId } from '../base'
import * as readables from '../readables'
import * as util from '../util'
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"

import {
    emptyOutputs1_1_0, emptyOutputs1_1_1,
    Inputs1_1_0, Inputs1_1_1, Outputs1_1_0, Outputs1_1_1, Tables, openAll, getTrackedInputs1_1_0
    , applyOutputs1_1_0, getTrackedInputs1_1_1
    , applyOutputs1_1_1, Integrators
} from './auto'


export function getPrimaryLiveIntegrator(integrators: Integrators):
    (ts: Tables, action: model.AnyAction) => Promise<[string, model.SavedAction, model.AnyError | null]> {
    return (ts, action) => integrateLive(
        getTrackedInputs1_1_1, integrators.integrate1_1_1,
        applyOutputs1_1_1, emptyOutputs1_1_1, ts, action);
}

export function getSecondaryLiveIntegrators(integrators: Integrators):
    ((ts: Tables, actionId: string, savedAction: model.SavedAction) => Promise<void>)[] {
    return [
        (ts: Tables, actionId: string, savedAction: model.SavedAction) =>
            integrateReplay('state-1.1.0', getTrackedInputs1_1_0,
                integrators.integrate1_1_0, applyOutputs1_1_0, emptyOutputs1_1_0, ts, actionId, savedAction),
    ]
}

export function getAllReplayers(integrators: Integrators, actionId: string, savedAction: model.SavedAction):
    ((ts: Tables) => Promise<void>)[] {
    return [
        (ts: Tables) =>
            integrateReplay('state-1.1.0', getTrackedInputs1_1_0,
                integrators.integrate1_1_0, applyOutputs1_1_0, emptyOutputs1_1_0, ts, actionId, savedAction),
        (ts: Tables) =>
            integrateReplay('state-1.1.1', getTrackedInputs1_1_1,
                integrators.integrate1_1_1, applyOutputs1_1_1, emptyOutputs1_1_1, ts, actionId, savedAction),
    ]
}
