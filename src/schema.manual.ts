
import * as db from './db'
import { Key, Live, Diff, Change, Readable } from './interfaces'
import * as model from './model'
import { validate as validateModel } from './model/index.validator'
import { validateLive, applyChanges, diffToChange, getActionId, integrateLive, integrateReplay } from './schema'
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

            await integrateReplay('state-1.1.1', getTrackedInputs1_1_1,
                this.i1_1_1.integrate, applyOutputs1_1_1, ts, actionId, savedAction);

            return maybeError;
        });
    }

    async handleReplay(): Promise<void> {
        let cursor: Key = [''];
        console.log('REPLAY')
        while (true) {
            const nextAction = await this.tx(
                async (db: db.Database): Promise<string | null> => {
                    const tables = openAll(db);
                    const first = await ixa.first(ixa.from(readables.readAllAfter(tables.actions, cursor!)));
                    if (first === undefined) {
                        return null;
                    }
                    const [[actionId],] = first;
                    return actionId;
                }
            );
            if (nextAction === null) {
                break;
            }
            const replayers = [
                (ts: Tables, actionId: string, savedAction: model.SavedAction) =>
                    integrateReplay('state-1.1.0', getTrackedInputs1_1_0,
                        this.i1_1_0.integrate, applyOutputs1_1_0, ts, actionId, savedAction),
                (ts: Tables, actionId: string, savedAction: model.SavedAction) =>
                    integrateReplay('state-1.1.1', getTrackedInputs1_1_1,
                        this.i1_1_1.integrate, applyOutputs1_1_1, ts, actionId, savedAction),
            ]
            console.log(`REPLAY ${nextAction}`)

            for (const replayer of replayers) {
                await this.tx(async (db: db.Database): Promise<void> => {
                    const ts = openAll(db);

                    const savedAction = (await readables.get(ts.actions, [nextAction], null));
                    if (savedAction === null) {
                        throw new Error('wut');
                    }

                    await replayer(ts, nextAction, savedAction);
                });
            }

            cursor = [nextAction];
        }
        console.log('DONE')
    }
}

