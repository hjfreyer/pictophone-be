import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import batch from './batch'
import { getStateReadables, getExportsReadables } from './collections'
import GetConfig from './config'
import { DBHelper2 } from './framework/db'
import { getSchema, Op, Processor, Source, Diffs } from './framework/graph'
import { Action1_1, AnyAction, Action1_0, Game1_0, TaggedGame1_0, SavedAction } from './model'
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
import { Graph, load, CollectionBuilder, Readables, Readable, getDiffs, diffToChange } from './flow/base'
import { multiIndexBy, transpose } from './flow/ops'
import timestamp from 'timestamp-nano';

import { interval, from, of, toArray, first, single, concat } from "ix/asynciterable"
import { map, filter, flatMap, tap, take, skip, skipWhile } from "ix/asynciterable/operators"
import { sha256 } from 'js-sha256';
import _ from 'lodash';

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


const HASH_HEX_CHARS_LEN = (32 / 8) * 2;  // 32 bits of hash
function serializeActionId(date: Date, hashHex: string): string {
    return `0${date.toISOString()}${hashHex.slice(0, HASH_HEX_CHARS_LEN)}`
}

function parseActionId(serialized: string): [Date, string] {
    if (serialized[0] !== '0') {
        throw new Error('unknown action ID format');
    }

    const dateStr = serialized.slice(1, serialized.length - HASH_HEX_CHARS_LEN);
    const hashStr = serialized.slice(serialized.length - HASH_HEX_CHARS_LEN);

    return [new Date(dateStr), hashStr]
}

function actionId(action: SavedAction): string {
    // TODO: JSON.stringify isn't deterministic, so what's saved in the DB
    // should really be a particular serialization, but I'm not worrying
    // about that at the moment.
    const hashHex = sha256.hex(JSON.stringify(action));
    const maxDate = _.max(action.parents.map(id => parseActionId(id)[0]));

    let now = new Date();

    // TODO: just fake the date rather than waiting.
    while (maxDate !== undefined && now < maxDate) {
        now = new Date();
    }
    return serializeActionId(now, hashHex);
}

const ROOT_ACTION_ID = serializeActionId(new Date(0), sha256.hex(''));

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

export type StateSpec = {
    games: TaggedGame1_0
}

type SideSpec = {}

export type ExportSpec = {
    gamesByPlayer: TaggedGame1_0
}

type Keys<Spec> = {
    [K in keyof Spec]: string[][]
}
type Values<Spec> = {
    [K in keyof Spec]: Spec[K][]
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


interface Database {

}



function placeholders(): Graph<StateSpec, {}, StateSpec> {
    return {
        games: load('games', ['game'])
    }
}

export function getExports(): Graph<StateSpec, {}, ExportSpec> {
    const ph = placeholders();
    const gamesByPlayer = new CollectionBuilder(ph.games)
        .pipe(multiIndexBy('player', (_, g) => g.players))
        .pipe(transpose([1, 0])).collection;

    return { gamesByPlayer }
}

function defaultGame(): TaggedGame1_0 {
    return {
        actionId: ROOT_ACTION_ID,
        players: [],
    }
}

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


async function doAction2(action: Action1_0, readables: Readables<StateSpec>): Promise<
    IntegrateResponse<ActionResponse, StateSpec>> {
    const game = await read.getOrDefault(readables.games, [action.gameId], defaultGame())
    const newGame = integrateHelper(action, game);

    const savedAction: SavedAction = {
        parents: [game.actionId],
        action,
    }
    const id = actionId(savedAction)

    if (newGame === null) {
        return {
            response: {},
            actionId: id,
            savedAction,
            changes: { games: [] }
        }
    } else {
        return {
            response: {},
            actionId: id,
            savedAction,
            changes: {
                games: [{
                    kind: 'set', key: [action.gameId], value: {
                        ...newGame, actionId: id
                    }
                }]
            }
        }
    }
}

function doAction(db: FirebaseFirestore.Firestore, body: unknown): Promise<ActionResponse> {
    const anyAction = validateModel('Action1_0')(body)
    // // const action = upgradeAction(anyAction)

    return db.runTransaction(async (tx: Transaction): Promise<ActionResponse> => {
        //        const helper2 = new DBHelper2(db, tx);
        const stateReadables = getStateReadables(db, tx);
        const response = await doAction2(anyAction, stateReadables);
        const stateDiffs = await changesToDiffs(stateReadables, response.changes);

        const exportzReadables = getExportsReadables(db, tx);
        const exportz = getExports();
        const [, exportDiffs] = await getDiffs(exportz, stateReadables, {}, stateDiffs);

        tx.set(db.collection('actions').doc(response.actionId), response.savedAction);

        for (const untypedCollectionId in response.changes) {
            const collectionId = untypedCollectionId as keyof typeof response.changes;
            stateReadables[collectionId].commit(response.changes[collectionId]);
        }
        for (const untypedCollectionId in exportDiffs) {
            const collectionId = untypedCollectionId as keyof typeof exportDiffs;
            exportzReadables[collectionId].commit(exportDiffs[collectionId].map(diffToChange));
        }

        return response.response;

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
