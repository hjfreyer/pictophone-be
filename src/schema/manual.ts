
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
    Inputs1_1_0, Inputs1_1_1, Outputs1_1_0, Outputs1_1_1, Tables, openAll, getTrackedInputs1_1_0
    , applyOutputs1_1_0, getTrackedInputs1_1_1
    , applyOutputs1_1_1
} from './auto'

export interface Integrators {
    integrate1_1_0(action: model.AnyAction, inputs: Inputs1_1_0): Promise<util.Result<Outputs1_1_0, model.AnyError>>
    integrate1_1_1(action: model.AnyAction, inputs: Inputs1_1_1): Promise<util.Result<Outputs1_1_1, model.AnyError>>
}

export function emptyOutputs1_1_0(): Outputs1_1_0 {
    return {
        games: [],
        shortCodeUsageCount: []
    }
}

export function emptyOutputs1_1_1(): Outputs1_1_1 {
    return {
        games: [],
        shortCodeUsageCount: [],
        gamesByPlayer: [],
    }
}

export class Framework {
    constructor(private tx: db.TxRunner, private integrators: Integrators) { }

    handleAction(action: model.AnyAction): Promise<model.AnyError | null> {
        return this.tx(async (db: db.Database): Promise<model.AnyError | null> => {
            const ts = openAll(db);
            const [actionId, savedAction, maybeError] = await integrateLive(
                getTrackedInputs1_1_1, this.integrators.integrate1_1_1,
                applyOutputs1_1_1, emptyOutputs1_1_1, ts, action);

            await integrateReplay('state-1.1.0', getTrackedInputs1_1_0,
                this.integrators.integrate1_1_0, applyOutputs1_1_0, emptyOutputs1_1_0, ts, actionId, savedAction);

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
            cursor = actionId;
            const replayers = [
                (ts: Tables) =>
                    integrateReplay('state-1.1.0', getTrackedInputs1_1_0,
                        this.integrators.integrate1_1_0, applyOutputs1_1_0, emptyOutputs1_1_0, ts, actionId, savedAction),
                (ts: Tables) =>
                    integrateReplay('state-1.1.1', getTrackedInputs1_1_1,
                        this.integrators.integrate1_1_1, applyOutputs1_1_1, emptyOutputs1_1_1, ts, actionId, savedAction),
            ]
            console.log(`REPLAY ${actionId}`)

            for (const replayer of replayers) {
                await this.tx((db: db.Database): Promise<void> => {
                    const ts = openAll(db);
                    return replayer(ts);
                });
            }
        }
        console.log('DONE')
    }
}

