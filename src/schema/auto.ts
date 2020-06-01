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
    state1_1_0_games: db.Table<Live<model.Game1_1>>
    state1_1_0_shortCodeUsageCount: db.Table<Live<model.NumberValue>>
    state1_1_1_games: db.Table<Live<model.Game1_1>>
    state1_1_1_shortCodeUsageCount: db.Table<Live<model.NumberValue>>
    state1_1_1_gamesByPlayer: db.Table<Live<model.Game1_1>>
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
        state1_1_0_games: db.open({
            schema: ["games-games-1.1.0"],
            validator: validateLive(validateModel('Game1_1'))
        }),
        state1_1_0_shortCodeUsageCount: db.open({
            schema: ["shortCodes-shortCodeUsageCount-1.1.0"],
            validator: validateLive(validateModel('NumberValue'))
        }),
        state1_1_1_games: db.open({
            schema: ["games-games-1.1.1"],
            validator: validateLive(validateModel('Game1_1'))
        }),
        state1_1_1_shortCodeUsageCount: db.open({
            schema: ["shortCodes-shortCodeUsageCount-1.1.1"],
            validator: validateLive(validateModel('NumberValue'))
        }),
        state1_1_1_gamesByPlayer: db.open({
            schema: ["players", "games-gamesByPlayer-1.1.1"],
            validator: validateLive(validateModel('Game1_1'))
        }),
    }
}

export interface Integrators {
    integrate1_1_0(action: model.AnyAction, inputs: Inputs1_1_0): Promise<util.Result<Outputs1_1_0, model.AnyError>>
    integrate1_1_1(action: model.AnyAction, inputs: Inputs1_1_1): Promise<util.Result<Outputs1_1_1, model.AnyError>>
}

export function getSecondaryLiveIntegrators(integrators: Integrators):
    ((ts: Tables, actionId: string, savedAction: model.SavedAction) => Promise<void>)[] {
    return [
        (ts: Tables, actionId: string, savedAction: model.SavedAction) =>
            integrateReplay(
                'state-1.1.0',
                getTrackedInputs1_1_0,
                integrators.integrate1_1_0,
                applyOutputs1_1_0,
                emptyOutputs1_1_0,
                ts, actionId, savedAction),

    ]
}

export function getAllReplayers(integrators: Integrators, actionId: string, savedAction: model.SavedAction):
    ((ts: Tables) => Promise<void>)[] {
    return [
        (ts: Tables) =>
            integrateReplay(
                'state-1.1.0',
                getTrackedInputs1_1_0,
                integrators.integrate1_1_0,
                applyOutputs1_1_0,
                emptyOutputs1_1_0,
                ts, actionId, savedAction),
        (ts: Tables) =>
            integrateReplay(
                'state-1.1.1',
                getTrackedInputs1_1_1,
                integrators.integrate1_1_1,
                applyOutputs1_1_1,
                emptyOutputs1_1_1,
                ts, actionId, savedAction),
    ]
}


// BEGIN 1.1.0

export type Inputs1_1_0 = {
    games: Readable<model.Game1_1>
    shortCodeUsageCount: Readable<model.NumberValue>
}

export function getTrackedInputs1_1_0(ts: Tables): [Set<string>, Inputs1_1_0] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const inputs: Inputs1_1_0 = {
        games: readables.tracked(ts.state1_1_0_games, track),
        shortCodeUsageCount: readables.tracked(ts.state1_1_0_shortCodeUsageCount, track),
    }
    return [parentSet, inputs]
}

export type Outputs1_1_0 = {
    games: Diff<model.Game1_1>[]
    shortCodeUsageCount: Diff<model.NumberValue>[]
}

export function emptyOutputs1_1_0(): Outputs1_1_0 {
    return {
        games: [],
        shortCodeUsageCount: [],
    }
}

export function applyOutputs1_1_0(ts: Tables, actionId: string, outputs: Outputs1_1_0): void {
    ts.actionTableMetadata.set([actionId, 'state-1.1.0'], getChangelog1_1_0(outputs));
    applyChanges(ts.state1_1_0_games, actionId, outputs.games.map(diffToChange))
    applyChanges(ts.state1_1_0_shortCodeUsageCount, actionId, outputs.shortCodeUsageCount.map(diffToChange))
}

function getChangelog1_1_0(outputs: Outputs1_1_0): model.ActionTableMetadata {
    return {
        tables: [
            {
                schema: ["games-games-1.1.0"],
                diffs: outputs.games,
            },
            {
                schema: ["shortCodes-shortCodeUsageCount-1.1.0"],
                diffs: outputs.shortCodeUsageCount,
            },
        ]
    }
}

// END 1.1.0

// BEGIN 1.1.1

export function getPrimaryLiveIntegrator(integrators: Integrators):
    (ts: Tables, action: model.AnyAction) => Promise<[string, model.SavedAction, model.AnyError | null]> {
    return (ts, action) => integrateLive(
        getTrackedInputs1_1_1,
        integrators.integrate1_1_1,
        applyOutputs1_1_1,
        emptyOutputs1_1_1,
        ts, action);
} export type Inputs1_1_1 = {
    games: Readable<model.Game1_1>
    shortCodeUsageCount: Readable<model.NumberValue>
}

export function getTrackedInputs1_1_1(ts: Tables): [Set<string>, Inputs1_1_1] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const inputs: Inputs1_1_1 = {
        games: readables.tracked(ts.state1_1_1_games, track),
        shortCodeUsageCount: readables.tracked(ts.state1_1_1_shortCodeUsageCount, track),
    }
    return [parentSet, inputs]
}

export type Outputs1_1_1 = {
    games: Diff<model.Game1_1>[]
    shortCodeUsageCount: Diff<model.NumberValue>[]
    gamesByPlayer: Diff<model.Game1_1>[]
}

export function emptyOutputs1_1_1(): Outputs1_1_1 {
    return {
        games: [],
        shortCodeUsageCount: [],
        gamesByPlayer: [],
    }
}

export function applyOutputs1_1_1(ts: Tables, actionId: string, outputs: Outputs1_1_1): void {
    ts.actionTableMetadata.set([actionId, 'state-1.1.1'], getChangelog1_1_1(outputs));
    applyChanges(ts.state1_1_1_games, actionId, outputs.games.map(diffToChange))
    applyChanges(ts.state1_1_1_shortCodeUsageCount, actionId, outputs.shortCodeUsageCount.map(diffToChange))
    applyChanges(ts.state1_1_1_gamesByPlayer, actionId, outputs.gamesByPlayer.map(diffToChange))
}

function getChangelog1_1_1(outputs: Outputs1_1_1): model.ActionTableMetadata {
    return {
        tables: [
            {
                schema: ["games-games-1.1.1"],
                diffs: outputs.games,
            },
            {
                schema: ["shortCodes-shortCodeUsageCount-1.1.1"],
                diffs: outputs.shortCodeUsageCount,
            },
            {
                schema: ["players", "games-gamesByPlayer-1.1.1"],
                diffs: outputs.gamesByPlayer,
            },
        ]
    }
}

// END 1.1.1


export async function deleteCollection(runner: db.TxRunner, collectionId: string): Promise<void> {
    switch (collectionId) {

        case 'state-1.1.0':
            await deleteMeta(runner, 'state-1.1.0')

            await deleteTable(runner, 'state1_1_0_games')
            await deleteTable(runner, 'state1_1_0_shortCodeUsageCount')
            break;
        case 'state-1.1.1':
            await deleteMeta(runner, 'state-1.1.1')

            await deleteTable(runner, 'state1_1_1_games')
            await deleteTable(runner, 'state1_1_1_shortCodeUsageCount')
            await deleteTable(runner, 'state1_1_1_gamesByPlayer')
            break;
        default:
            throw new Error('invalid option')
    }
}
