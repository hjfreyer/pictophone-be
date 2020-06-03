
import deepEqual from 'deep-equal'
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import { deleteTable } from '.'
import { applyChanges, diffToChange, validateDiff, validateLive } from '../base'
import * as db from '../db'
import { Diff, ItemIterable, Live, Range, Readable } from '../interfaces'
import * as model from '../model'
import { validate as validateModel } from '../model/index.validator'
import * as ranges from '../ranges'
import * as readables from '../readables'
import * as util from '../util'


export function getDiffs<T>(meta: model.ActionTableMetadata, 
    schema: string[], validator: (u:unknown)=> T): Diff<T>[] {
    for (const tableDiff of meta.tables) {
        if (deepEqual(tableDiff.schema, schema)) {
            return tableDiff.diffs.map(d=>validateDiff(validator)(d))
        }
    }
    throw new Error("No matching table");
}

export function replayInputs1_0_0(metas: AsyncIterable<model.Metadata1_0_0>): Inputs1_0_0 {
    const gameItems = ixa.from(metas).pipe(
        ixaop.flatMap(meta => ixa.from(meta.outputs.games)),
        ixaop.flatMap((diff): ItemIterable<model.Game1_0> => {
            switch (diff.kind) {
                case 'add':
                return ixa.of([diff.key, diff.value])
                case 'delete':
                return ixa.empty()
                case 'replace':
                return  ixa.of([diff.key, diff.newValue])
            }
        }),
        ixaop.orderBy(([key, ])=>key, util.lexCompare),
    );
    return {
        games: {
            schema: ["games-games-1.0.0"],
            read(range : Range): ItemIterable<model.Game1_0> {
                return gameItems.pipe(
                    ixaop.skipWhile(([key, ]) => !ranges.contains(range, key)),
                    ixaop.takeWhile(([key, ]) => ranges.contains(range, key)),
                )
            }
        }
    }
}

export type Tables = {
    actions: db.Table<model.SavedAction>
    meta_1_0_0: db.Table<model.Metadata1_0_0>

    games_1_0_0: db.Table<Live<model.Game1_0>>
    gamesByPlayer_1_0_1: db.Table<Live<model.PlayerGame1_0>>
}

export type Readables = {
    games_1_0_0: Readable<model.Game1_0>
    gamesByPlayer_1_0_1: Readable<model.PlayerGame1_0>
}


export function openAll(db: db.Database): Tables {
    return {
        actions: db.open({
            schema: ['actions'],
            validator: validateModel('SavedAction')
        }),
        meta_1_0_0: db.open({
            schema: ['metadata-1.0.0'],
            validator: validateModel('Metadata1_0_0')
        }),
        games_1_0_0: db.open({
            schema: ["games-games-1.0.0"],
            validator: validateLive(validateModel('Game1_0'))
        }),
        gamesByPlayer_1_0_1: db.open({
            schema: ["player", "games-gamesByPlayer-1.0.1"],
            validator: validateLive(validateModel('PlayerGame1_0'))
        }),
    }
}

export function readAll(ts: Tables): [Set<string>, Readables] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const res: Readables = {
        games_1_0_0: readables.tracked(ts.games_1_0_0, track),        
        gamesByPlayer_1_0_1: readables.tracked(ts.gamesByPlayer_1_0_1, track),    
    }
    return [parentSet, res]
}

export type Action1_0_0 = model.AnyAction
export type Action1_0_1 = {
    games: Diff<model.Game1_0>[],
}

export interface Integrators {
    integrate1_0_0(action: Action1_0_0, inputs: Inputs1_0_0): Promise<util.Result<Outputs1_0_0, model.AnyError>>
    // integrate1_0_1(action: Action1_0_1, inputs: Inputs1_0_1): Promise<util.Result<Outputs1_0_1, model.AnyError>>
}

// export function getSecondaryLiveIntegrators(integrators: Integrators):
//     ((ts: Tables, actionId: string, savedAction: model.SavedAction) => Promise<void>)[] {
//     return [

//         (ts: Tables, actionId: string, savedAction: model.SavedAction) =>
//             integrateReplay(
//                 '1.0.1',
//                 getTrackedInputs1_0_1,
//                 integrators.integrate1_0_1,
//                 applyOutputs1_0_1,
//                 emptyOutputs1_0_1,
//                 ts, actionId, savedAction),
//     ]
// }

// export function getAllReplayers(integrators: Integrators, actionId: string, savedAction: model.SavedAction):
//     ((ts: Tables) => Promise<void>)[] {
//     return [
//         (ts: Tables) =>
//             integrateReplay(
//                 '1.0.0',
//                 getTrackedInputs1_0_0,
//                 integrators.integrate1_0_0,
//                 applyOutputs1_0_0,
//                 emptyOutputs1_0_0,
//                 ts, actionId, savedAction),
//         (ts: Tables) =>
//             integrateReplay(
//                 '1.0.1',
//                 getTrackedInputs1_0_1,
//                 integrators.integrate1_0_1,
//                 applyOutputs1_0_1,
//                 emptyOutputs1_0_1,
//                 ts, actionId, savedAction),
//     ]
// }


// BEGIN 1.0.0

// export function getPrimaryLiveIntegrator(integrators: Integrators):
//     (ts: Tables, action: model.AnyAction) => Promise<[string, model.SavedAction, model.AnyError | null]> {
//     return (ts, action) => integrateLive(
//         getTrackedInputs1_0_0,
//         integrators.integrate1_0_0,
//         applyOutputs1_0_0,
//         emptyOutputs1_0_0,
//         ts, action);
// } 

export type Inputs1_0_0 = {
    games: Readable<model.Game1_0>
}

export function getInputs1_0_0(ts: Readables): Inputs1_0_0 {
    return {
        games: ts.games_1_0_0
    }
}
export function getInputs1_0_1(ts: Readables): Inputs1_0_1 {
    return {    }
}

export type Outputs1_0_0 = {
    games: Diff<model.Game1_0>[]
}

export function emptyOutputs1_0_0(): Outputs1_0_0 {
    return {
        games: [],
    }
}

export function getMetadata1_0_0(outputs: Outputs1_0_0): model.Metadata1_0_0 {
    return {
        outputs: {  
            games: util.sorted(outputs.games, (d1, d2) => util.lexCompare(d1.key, d2.key))
        }
    }
}

export function applyOutputs1_0_0(ts: Tables, actionId: string, outputs: Outputs1_0_0): void {
    ts.meta_1_0_0.set([actionId], getMetadata1_0_0(outputs));
    applyChanges(ts.games_1_0_0, actionId, outputs.games.map(diffToChange))
}


// END 1.0.0

// BEGIN 1.0.1

export type Inputs1_0_1 = {}

export function getTrackedInputs1_0_1(ts: Tables): [Set<string>, Inputs1_0_1] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const inputs: Inputs1_0_1 = {    }
    return [parentSet, inputs]
}

export type Outputs1_0_1 = {
    gamesByPlayer: Diff<model.PlayerGame1_0>[]
}

export function emptyOutputs1_0_1(): Outputs1_0_1 {
    return {
        gamesByPlayer: [],
    }
}

// export function applyOutputs1_0_1(ts: Tables, actionId: string, outputs: Outputs1_0_1): void {
//     ts.actionTableMetadata.set([actionId, '1.0.1'], getChangelog1_0_1(outputs));
//     applyChanges(ts.gamesByPlayer_1_0_1, actionId, outputs.gamesByPlayer.map(diffToChange))
// }

// function getChangelog1_0_1(outputs: Outputs1_0_1): model.ActionTableMetadata {
//     return {
//         tables: [
//             {
//                 schema: ["player", "games-gamesByPlayer-1.0.1"],
//                 diffs: outputs.gamesByPlayer,
//             },
//         ]
//     }
// }

// END 1.0.1


export async function deleteCollection(runner: db.TxRunner, collectionId: string): Promise<void> {
    switch (collectionId) {

        case '1.0.0':
            await deleteTable(runner, 'meta_1_0_0')

            await deleteTable(runner, 'games_1_0_0')
            break;
        // case '1.0.1':
        //     await deleteMeta(runner, '1.0.1')

        //     await deleteTable(runner, 'gamesByPlayer_1_0_1')
        //     break;
        default:
            throw new Error('invalid option')
    }
}
