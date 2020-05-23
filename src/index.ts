import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import batch from './batch'
import {
    doAction3,
    Bindings, Dynamics, Persisted,
    IntegrationInputs, Mutations, Integrated, Scrambles, ROOT_ACTION_ID, getDPLInfos, getDerived, // Derived
} from './collections'
import GetConfig from './config'
import { DBHelper2, Database } from './framework/db'
import { getSchema, Op, Processor, Source, Diffs } from './framework/graph'
import { Action1_1, AnyAction, Action1_0, Game1_0, TaggedGame1_0, TaggedGame1_1, SavedAction } from './model'
import { validate as validateModel } from './model/index.validator'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import * as rev0 from './rev0'
import { InitialRevision, Changes } from './framework/revision'
import { mapValues } from './util'
import * as read from './flow/read';
import { ReadWrite, Change, Diff } from './framework/base'
import deepEqual from 'deep-equal'
import { DBs } from './framework/graph_builder'
import { Graph, load, CollectionBuilder, Readables, Readables2, Readable2, Readable, getDiffs, diffToChange, Key, Collection, unscrambledSpace, Mutation, newDiff } from './flow/base'
import { multiIndexBy, transpose } from './flow/ops'
import timestamp from 'timestamp-nano';

import { interval, from, of, toArray, first, single, concat } from "ix/asynciterable"
import { map, filter, flatMap, tap, take, skip, skipWhile } from "ix/asynciterable/operators"
import { sha256 } from 'js-sha256';
import _ from 'lodash';
import * as ix from "ix/iterable"
import { narrow, drop_null } from './flow/util'


admin.initializeApp({
    credential: admin.credential.applicationDefault()
})

const storage = new Storage()
const db = admin.firestore()

// Create a new express application instance
const app: express.Application = express()
app.set('json spaces', 2)
app.use(express.json())

const port = process.env.PORT || 3000
app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`)
})


// export type ActionType = Action1_1

// function upgradeAction(a: AnyAction): ActionType {
//     switch (a.version) {
//         case "1.0":
//             return {
//                 version: '1.1',
//                 kind: 'join_game',
//                 gameId: a.gameId,
//                 playerId: a.playerId,
//                 createIfNecessary: true,
//             }
//     }
// }

// export function integrate(
//     game: InputType | null,
//     shortCodeInUse: {} | null,
//     a: ActionType): InputType | null {
//     switch (a.kind) {
//         case 'create_game':
//             if (game !== null) {
//                 // Don't create already created game.
//                 return game
//             }
//             if (shortCodeInUse !== null) {
//                 return null
//             }
//             return {
//                 players: [],
//                 shortCode: a.shortCode,
//             }
//         case 'join_game':
//             if (game === null) {
//                 if (a.createIfNecessary) {
//                     return {
//                         players: [a.playerId],
//                         shortCode: ''
//                     }
//                 } else {
//                     return null
//                 }
//             }

//             if (game.players.indexOf(a.playerId) !== -1) {
//                 return game
//             }
//             return {
//                 ...game,
//                 players: [...game.players, a.playerId],
//             }
//     }
// }

// async function reactTo(
//     p: Processor,
//     action: ActionType,
//     input: Op<InputType, InputType>,
//     shortCodes: Op<InputType, {}>): Promise<Diff<InputType>[]> {
//     const gameKey = [action.gameId]
//     const maybeGame = await p.get(input, gameKey)
//     let maybeShortCodeInUse: {} | null = null

//     if (action.kind === 'create_game') {
//         maybeShortCodeInUse = await p.get(shortCodes, [action.shortCode])
//     }
//     const newGame = integrate(maybeGame, maybeShortCodeInUse, action)

//     if (maybeGame === null) {
//         return newGame === null
//             ? []
//             : [{ kind: 'add', key: gameKey, value: newGame }]
//     } else {
//         return newGame === null
//             ? [{ kind: 'delete', key: gameKey, value: maybeGame }]
//             : [{ kind: 'replace', key: gameKey, oldValue: maybeGame, newValue: newGame }]
//     }
// }

type Keys<Spec> = {
    [K in keyof Spec]: Key[]
}
type Values<Spec> = {
    [K in keyof Spec]: (Spec[K] | null)[]
}


interface ActionResponse { }

type IntegrateResponse<R, ChangeSpec> = {
    response: R
    actionId: string
    savedAction: SavedAction,
    changes: Changes<ChangeSpec>
}

class IntegrateContinue {

}

// interface Integrator<Action, StateSpec, SideSpec> {
//     (action: Action, state: StateSpec)
// }


export async function integrateGame(a: Action1_0, input: Readable2<TaggedGame1_0>): Promise<Diff<Game1_0>[]> {
    const oldGame = await read.getOrDefault2(input, [a.gameId], null);
    const newGame = integrateHelper(a, oldGame || defaultGame());
    if (newGame === null) {
        // Null game response means don't change the DB.
        return [];
    }
    const diff = newDiff([a.gameId], oldGame, newGame);
    return Array.from(ix.of(diff).pipe(drop_null()))
}

class Dynamics1_0 implements Dynamics {
    // transformInputs(input : Readables<Persisted>): Scrambles<IntegrationInputs> {
    //     return {
    //         games1_0: unscrambledSpace(input.games1_0)
    //     }
    // }
    // getInterest(a : Action1_0): Keys<IntegrationInputs> {
    //     return {
    //         games1_0: [[a.gameId]]
    //     }
    // }
    async integrate(a: Action1_0, input: Readables<Persisted>): Promise<Diffs<Integrated>> {
        return {
            state1_0_0_games: await (async (): Promise<Diff<Game1_0>[]> => {
                const oldGame = await read.getOrDefault(input.state1_0_0_games, [a.gameId], null);
                const newGame = integrateHelper(a, oldGame || defaultGame());
                if (newGame === null) {
                    // Null game response means don't change the DB.
                    return [];
                }
                const diff = newDiff([a.gameId], oldGame, newGame);
                return Array.from(ix.of(diff).pipe(drop_null()))
            })(),
        }
    }

    // async deriveDiffs(input: Readables<Persisted>,
    //     integratedDiffs: Diffs<Persisted>): Promise<Diffs<Derived>> {
    //         return {}
    //     // return getDiffs(getDerived(), input, integratedDiffs)
    // }

}



function defaultGame(): Game1_0 {
    return {
        players: [],
    }
}

// function interest1_0(a: Action1_0): Keys<StateSpec> {
//     return {
//         games: [[a.gameId]]
//     }
// }

function integrateHelper(a: Action1_0, game: Game1_0): (Game1_0 | null) {
    switch (a.kind) {
        case 'join_game':
            if (game.players.indexOf(a.playerId) !== -1) {
                return null
            }
            return {
                ...game,
                players: [...game.players, a.playerId],
            }
    }
}


// async function doAction2(action: Action1_0, readables: Readables<Persisted>): Promise<
//     IntegrateResponse<ActionResponse, StateSpec>> {
// doAction(dynamics: Dynamics, action: Action1_0, 
//     db: Dataspaces<Persisted>, bindings: Bindings)

//     // const values :Values<StateSpec> = {
//     //     games: [await read.get(readables.games, interest1_0(action).games[0])],
//     // };
//     // // const game = await read.getOrDefault(readables.games, [action.gameId], defaultGame())
//     // const newGame = integrateHelper(action, values);

//     // const savedAction: SavedAction = {
//     //     parents: [(values.games[0] || defaultGame()).actionId],
//     //     action,
//     // }
//     // const id = actionId(savedAction)

//     // if (newGame === null) {
//     //     return {
//     //         response: {},
//     //         actionId: id,
//     //         savedAction,
//     //         changes: { games: [] }
//     //     }
//     // } else {
//     //     return {
//     //         response: {},
//     //         actionId: id,
//     //         savedAction,
//     //         changes: {
//     //             games: [{
//     //                 kind: 'set', key: [action.gameId], value: {
//     //                     ...newGame, actionId: id
//     //                 }
//     //             }]
//     //         }
//     //     }
//     // }
// }

// Derived Collections
// - Source(s)
// - Op.
// Integrated Collections.
// - Source(s)
// - Action -> Source -> Keys of interest.
// - Action -> Values of interest -> Changes.
//   - Changes must be to records with matching action IDs (or must be commutative... or something)

// interface IntegratedCollection 

// interface IntegrationOp<Inputs, Action, T> {
//     interest(a : Action): Keys<Inputs>
//     integrate(a : Action, values: Values<Inputs>): Change<T>[]
// } 

// export type DynamicCollection<Sources, Action, T> =
//     DynamicLoadNode<Sources, T>
//     | IntegrationOpNode<Sources, Action, T>
//     | CollectionOpNode<Sources, Action, T>;


// interface DynamicLoadNode<Sources, T> {
//     kind: 'load'
//     // schema: string[]
//     visit<R>(go: <K extends keyof Sources>(k: K, cast: (t: Sources[K]) => T) => R): R
// }

// interface IntegrationOpNode<Sources, Action, T> {
//     kind: 'op'
//     visit<R>(go: <InputSpec>(inputs: {
//         [I in keyof InputSpec]: DynamicCollection<Sources, Action, Intermediates, InputSpec[I]>,

//     ops: {
//         [O in keyof Outputs]: IntegrationOp<InputSpec, Action, O>
//     }) => R): R
// }

// interface  CollectionsNode<Sources, Intermediates, Outputs> {
//     kind: 'collections'
//     collections: {
//         [K in keyof Outputs]: Collection<Sources, Intermediates, Outputs[K]>
//     }
// }

// type CollectionRegistry = {
//     games1_0Integrated: TaggedGame1_0
//     games1_0Downgraded: TaggedGame1_0
//     games1_1Upgraded: TaggedGame1_1
//     games1_1Integrated: TaggedGame1_1
//     games1_0byPlayer: TaggedGame1_1
// }




export const BINDINGS: Bindings = {
    state1_0_0_games: [{ kind: 'integration', collection: 'state1_0_0_games' }],
    state1_0_1_replay_games: [
        // { kind: 'integration', collection: 'games1_0_1' }
    ],
    state1_0_1_replay_gamesByPlayer: [],
//    gamesByPlayer1_0: [{ kind: 'derivation', collection: 'gamesByPlayer1_0' }],
}


// const BINDINGS: Bindings = {
//     games1_0: {
//         integrationPrimary: 'games1_0',
//         integrationSecondary: [],
//         derivationPrimary: null,
//         derivationSecondary: [],
//     },
//     gamesByPlayer1_0: {
//         integrationPrimary: 'gamesByPlayer1_0',
//         integrationSecondary: [],
//         derivationPrimary: 'gamesByPlayer1_0',
//         derivationSecondary: [],
//     }
// }
// SortedCollection<Inputs, Intermediates, T> | 


// Ultimate sources must be integrated collections.
// Other collections must be derived, but can also be integrated.

function doAction(db: FirebaseFirestore.Firestore, body: unknown): Promise<ActionResponse> {
    const anyAction = validateModel('Action1_0')(body)
    // // const action = upgradeAction(anyAction)

    return db.runTransaction(async (tx: Transaction): Promise<ActionResponse> => {
        const database = new Database(db, tx, new Set());
        const dpl = getDPLInfos();
        await doAction3(new Dynamics1_0(), anyAction, database, dpl, BINDINGS)
        return {}
        // const response = await doAction2(anyAction, stateReadables);
        // const stateDiffs = await changesToDiffs(stateReadables, response.changes);

        // const exportzReadables = getExportsReadables(db, tx);
        // const exportz = getExports();
        // const [, exportDiffs] = await getDiffs(exportz, stateReadables, {}, stateDiffs);

        // tx.set(db.collection('actions').doc(response.actionId), response.savedAction);

        // for (const untypedCollectionId in response.changes) {
        //     const collectionId = untypedCollectionId as keyof typeof response.changes;
        //     stateReadables[collectionId].commit(response.changes[collectionId]);
        // }
        // for (const untypedCollectionId in exportDiffs) {
        //     const collectionId = untypedCollectionId as keyof typeof exportDiffs;
        //     (exportzReadables[collectionId] as any).commit((exportDiffs[collectionId] as any).map(diffToChange));
        // }

        // return response.response;

        //     const stateConfig: Source<rev0.StateSpec> = {
        //         game: {
        //             collectionId: 'state-2.0',
        //             schema: ['game'],
        //             validator: validateModel('Game1_0')
        //         }
        //     };        
        //     const intermediateConfig: Source<rev0.IntermediateSpec> = {};
        //     const derivedConfig: Source<rev0.DerivedSpec> = {
        //         gamesByPlayer: {
        //             collectionId: 'derived-2.0',
        //             schema: ['player', 'game'],
        //             validator: validateModel('Game1_0')
        //         }
        //     };
        //     const p = new Processor(db, tx, stateConfig, intermediateConfig);

        //     const stateDbs = mapValues(stateConfig, (_, i) => helper2.open(i)) as DBs<rev0.StateSpec>;
        //     const derivedDbs = mapValues(derivedConfig, (_, i) => helper2.open(i)) as DBs<rev0.DerivedSpec>;


        //     const rev00 : InitialRevision<Action1_0, {}, rev0.StateSpec,rev0.IntermediateSpec, rev0.DerivedSpec>  = rev0;
        //     const sourceChanges = await rev00.integrate(anyAction, stateDbs, {});
        //     const sourceDiffsP : Partial<Diffs<rev0.StateSpec>> = {};
        //     for (const untypedCollectionId in sourceChanges) {
        //         const collectionId = untypedCollectionId as keyof typeof sourceChanges;
        //         const diffs :Diff<rev0.StateSpec[typeof collectionId]>[] = [];
        //         for (const change of sourceChanges[collectionId]) {
        //             const maybeDiff = await changeToDiff(stateDbs[collectionId], change);
        //             if (maybeDiff !== null) {
        //                 diffs.push(maybeDiff);
        //             }
        //         }
        //         sourceDiffsP[collectionId] = diffs;
        //     }
        // const sourceDiffs = sourceDiffsP as Diffs<rev0.StateSpec>;

        //     const deriveOps = rev00.derive();
        //     const derivedDiffsP : Partial<Diffs<rev0.DerivedSpec>> = {};
        //     for (const untypedCollectionId in deriveOps) {
        //         const collectionId = untypedCollectionId as keyof rev0.DerivedSpec;
        //         derivedDiffsP[collectionId] = await p.reactTo(deriveOps[collectionId], sourceDiffs);
        //     }
        //     const derivedDiffs = derivedDiffsP as Diffs<rev0.DerivedSpec>;


        //     // const outputDiffs: [string, string[], Diff<DocumentData>[]][] = [
        //     //     [INPUT_ID, getSchema(INPUT_OP), state1_0Diffs]]
        //     // const output = getCollections()

        //     // for (const collectionId in output) {
        //     //     const op = output[collectionId]
        //     //     outputDiffs.push([collectionId, getSchema(op), await p.reactTo(op, state1_0Diffs)])
        //     // }

        //     for (const untypedCollectionId in sourceDiffs) {
        //         const collectionId = untypedCollectionId as keyof rev0.StateSpec;
        //         stateDbs[collectionId].commit(sourceDiffs[collectionId]);
        //     }        

        //     for (const untypedCollectionId in derivedDiffs) {
        //         const collectionId = untypedCollectionId as keyof rev0.DerivedSpec;
        //         derivedDbs[collectionId].commit(derivedDiffs[collectionId]);
        //     }
    })
}

async function changesToDiffs<Spec>(dbs: Readables<Spec>, changes: Changes<Spec>): Promise<Diffs<Spec>> {
    const diffsP: Partial<Diffs<Spec>> = {};
    for (const untypedCollectionId in changes) {
        const collectionId = untypedCollectionId as keyof typeof changes;
        const diffs: Diff<Spec[typeof collectionId]>[] = [];
        for (const change of changes[collectionId]) {
            const maybeDiff = await changeToDiff(dbs[collectionId], change);
            if (maybeDiff !== null) {
                diffs.push(maybeDiff);
            }
        }
        diffsP[collectionId] = diffs;
    }
    return diffsP as Diffs<Spec>;
}

async function changeToDiff<T>(db: Readable<T>, change: Change<T>): Promise<Diff<T> | null> {
    const current = await read.get(db, change.key);
    if (current === null) {
        if (change.kind == 'set') {
            return {
                key: change.key,
                kind: 'add',
                value: change.value,
            }
        } else {
            return null
        }
    } else {
        if (change.kind == 'set') {
            if (!deepEqual(current, change.value)) {
                return {
                    key: change.key,
                    kind: 'replace',
                    oldValue: current,
                    newValue: change.value,
                }
            } else {
                return null
            }
        } else {
            return {
                key: change.key,
                kind: 'delete',
                value: current,
            }
        }
    }
}

const MAX_POINTS = 50_000

async function doUpload(body: unknown): Promise<UploadResponse> {
    const upload = validateRpc('Upload')(body)

    if (MAX_POINTS < numPoints(upload)) {
        throw new Error('too many points in drawing')
    }

    const id = `uuid/${uuid()}`
    await storage.bucket(GetConfig().gcsBucket).file(id).save(JSON.stringify(upload))

    return { id }
}

function numPoints(drawing: Drawing): number {
    let res = 0
    for (const path of drawing.paths) {
        res += path.length / 2
    }
    return res
}

app.options('/action', cors())
app.post('/action', cors(), function(req: Request<Dictionary<string>>, res, next) {
    doAction(db, req.body).then((resp) => {
        res.status(200)
        res.json(resp)
    }).catch(next)
})

app.options('/upload', cors())
app.post('/upload', cors(), function(req: Request<Dictionary<string>>, res, next) {
    doUpload(req.body).then(resp => {
        res.status(200)
        res.json(resp)
    }).catch(next)
})

app.use('/batch', batch(db))
