// DON'T EDIT THIS FILE, IT IS AUTO GENERATED

import * as db from '../db'
import * as util from '../util'
import { Live, Diff, Change, Readable } from '../interfaces'
import * as model from '../model'
import { validate as validateModel } from '../model/index.validator'
import { validateLive, applyChanges, diffToChange } from '../base'
import * as readables from '../readables'
import { deleteTable, deleteMeta, integrateLive, integrateReplay } from '.'

export type Tables = {
    actions: db.Table<model.SavedAction>
    actionTableMetadata: db.Table<model.ActionTableMetadata>
    games_1_0_0: db.Table<Live<model.Game1_0>>
    games_1_0_1: db.Table<Live<model.Game1_0>>
    gamesByPlayer_1_0_1: db.Table<Live<model.PlayerGame1_0>>
}

export function openAll(db: db.Database): Tables {
    return {
        actions: db.open({
            schema: ['actions'],
            validator: validateModel('SavedAction')
        }),
        actionTableMetadata: db.open({
            schema: ['actions', '_META_'],
            validator: validateModel('ActionTableMetadata')
        }),
        games_1_0_0: db.open({
            schema: ["games-games-1.0.0"],
            validator: validateLive(validateModel('Game1_0'))
        }),
        games_1_0_1: db.open({
            schema: ["games-games-1.0.1"],
            validator: validateLive(validateModel('Game1_0'))
        }),
        gamesByPlayer_1_0_1: db.open({
            schema: ["player", "games-gamesByPlayer-1.0.1"],
            validator: validateLive(validateModel('PlayerGame1_0'))
        }),
    }
}

export interface Integrators {
    integrate1_0_0(action: model.AnyAction, inputs: Inputs1_0_0): Promise<util.Result<Outputs1_0_0, model.AnyError>>
    integrate1_0_1(action: model.AnyAction, inputs: Inputs1_0_1): Promise<util.Result<Outputs1_0_1, model.AnyError>>
}

export function getSecondaryLiveIntegrators(integrators: Integrators):
    ((ts: Tables, actionId: string, savedAction: model.SavedAction) => Promise<void>)[] {
    return [

        (ts: Tables, actionId: string, savedAction: model.SavedAction) =>
            integrateReplay(
                '1.0.1',
                getTrackedInputs1_0_1,
                integrators.integrate1_0_1,
                applyOutputs1_0_1,
                emptyOutputs1_0_1,
                ts, actionId, savedAction),
    ]
}

export function getAllReplayers(integrators: Integrators, actionId: string, savedAction: model.SavedAction):
    ((ts: Tables) => Promise<void>)[] {
    return [
        (ts: Tables) =>
            integrateReplay(
                '1.0.0',
                getTrackedInputs1_0_0,
                integrators.integrate1_0_0,
                applyOutputs1_0_0,
                emptyOutputs1_0_0,
                ts, actionId, savedAction),
        (ts: Tables) =>
            integrateReplay(
                '1.0.1',
                getTrackedInputs1_0_1,
                integrators.integrate1_0_1,
                applyOutputs1_0_1,
                emptyOutputs1_0_1,
                ts, actionId, savedAction),
    ]
}


// BEGIN 1.0.0

export function getPrimaryLiveIntegrator(integrators: Integrators):
    (ts: Tables, action: model.AnyAction) => Promise<[string, model.SavedAction, model.AnyError | null]> {
    return (ts, action) => integrateLive(
        getTrackedInputs1_0_0,
        integrators.integrate1_0_0,
        applyOutputs1_0_0,
        emptyOutputs1_0_0,
        ts, action);
} export type Inputs1_0_0 = {
    games: Readable<model.Game1_0>
}

export function getTrackedInputs1_0_0(ts: Tables): [Set<string>, Inputs1_0_0] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const inputs: Inputs1_0_0 = {
        games: readables.tracked(ts.games_1_0_0, track),
    }
    return [parentSet, inputs]
}

export type Outputs1_0_0 = {
    games: Diff<model.Game1_0>[]
}

export function emptyOutputs1_0_0(): Outputs1_0_0 {
    return {
        games: [],
    }
}

export function applyOutputs1_0_0(ts: Tables, actionId: string, outputs: Outputs1_0_0): void {
    ts.actionTableMetadata.set([actionId, '1.0.0'], getChangelog1_0_0(outputs));
    applyChanges(ts.games_1_0_0, actionId, outputs.games.map(diffToChange))
}

function getChangelog1_0_0(outputs: Outputs1_0_0): model.ActionTableMetadata {
    return {
        tables: [
            {
                schema: ["games-games-1.0.0"],
                diffs: outputs.games,
            },
        ]
    }
}

// END 1.0.0

// BEGIN 1.0.1

export type Inputs1_0_1 = {
    games: Readable<model.Game1_0>
}

export function getTrackedInputs1_0_1(ts: Tables): [Set<string>, Inputs1_0_1] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const inputs: Inputs1_0_1 = {
        games: readables.tracked(ts.games_1_0_1, track),
    }
    return [parentSet, inputs]
}

export type Outputs1_0_1 = {
    games: Diff<model.Game1_0>[]
    gamesByPlayer: Diff<model.PlayerGame1_0>[]
}

export function emptyOutputs1_0_1(): Outputs1_0_1 {
    return {
        games: [],
        gamesByPlayer: [],
    }
}

export function applyOutputs1_0_1(ts: Tables, actionId: string, outputs: Outputs1_0_1): void {
    ts.actionTableMetadata.set([actionId, '1.0.1'], getChangelog1_0_1(outputs));
    applyChanges(ts.games_1_0_1, actionId, outputs.games.map(diffToChange))
    applyChanges(ts.gamesByPlayer_1_0_1, actionId, outputs.gamesByPlayer.map(diffToChange))
}

function getChangelog1_0_1(outputs: Outputs1_0_1): model.ActionTableMetadata {
    return {
        tables: [
            {
                schema: ["games-games-1.0.1"],
                diffs: outputs.games,
            },
            {
                schema: ["player", "games-gamesByPlayer-1.0.1"],
                diffs: outputs.gamesByPlayer,
            },
        ]
    }
}

// END 1.0.1


export async function deleteCollection(runner: db.TxRunner, collectionId: string): Promise<void> {
    switch (collectionId) {

        case '1.0.0':
            await deleteMeta(runner, '1.0.0')

            await deleteTable(runner, 'games_1_0_0')
            break;
        case '1.0.1':
            await deleteMeta(runner, '1.0.1')

            await deleteTable(runner, 'games_1_0_1')
            await deleteTable(runner, 'gamesByPlayer_1_0_1')
            break;
        default:
            throw new Error('invalid option')
    }
}
