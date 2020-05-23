import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import GetConfig from './config'
import { Action1_1, AnyAction, Action1_0, Game1_0, Game1_1, TaggedGame1_0, TaggedGame1_1, SavedAction, Symlink } from './model'
import { validate as validateModel } from './model/index.validator'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import { mapValues } from './util'
import deepEqual from 'deep-equal'
import timestamp from 'timestamp-nano';

import { interval, from, of, toArray, first, single, concat } from "ix/asynciterable"
import { map, filter, flatMap, tap, take, skip, skipWhile } from "ix/asynciterable/operators"
import { sha256 } from 'js-sha256';
import _ from 'lodash';
import * as ix from "ix/iterable"
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import * as db from './db'
import * as readables from './readables'
import * as ranges from './ranges'
import { Readable, Diff, ItemIterable, Key } from './interfaces'


admin.initializeApp({
    credential: admin.credential.applicationDefault()
})

const storage = new Storage()
const fsDb = admin.firestore()

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

export function getActionId(action: SavedAction): string {
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




function doAction(fsDb: FirebaseFirestore.Firestore, body: unknown): Promise<void> {
    const anyAction = validateModel('Action1_0')(body)
    // // const action = upgradeAction(anyAction)

    return fsDb.runTransaction(async (tx: Transaction): Promise<void> => {
        const database = new db.Database(fsDb, tx);
        // const dpl = getDPLInfos();
        // await doAction3(new Dynamics1_0(), anyAction, database, dpl, BINDINGS)
    })
}


app.options('/action', cors())
app.post('/action', cors(), function(req: Request<Dictionary<string>>, res, next) {
    doAction(fsDb, req.body).then((resp) => {
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


app.use('/batch', batch())

type Tables = {
    actions: db.Table<SavedAction>
    state1_0_0_games: db.Table<Game1_0>
    state1_0_0_games_symlinks: db.Table<Symlink>
}

function openAll(db: db.Database): Tables {
    return {
        actions: db.open({
            schema: ['actions'],
            validator: validateModel('SavedAction')
        }),
        state1_0_0_games: db.open({
            schema: ['actions', 'state-1.0.0-games'],
            validator: validateModel('Game1_0')
        }),
        state1_0_0_games_symlinks: db.open({
            schema: ['state-1.0.0-games-symlinks'],
            validator: validateModel('Symlink')
        })
    }
}

// function nestedTableReadable<T>(actionReadable: Readable<T>, actionId: string): Readable<T> {

// }


// function compareIterableAndReadable<T>(listExpected: ItemIterable<T>, 
//     isKeyExpected: (key: Key) => Promise<boolean>, 
//     actual: Readable<T>): AsyncIterable<Diff<T>> {
//     const diffs = ixa.from(listExpected)
//         .pipe(flatMap(async ([key, expectedValue]): Promise<AsyncIterable<Diff<T>>> => {
//             const actualValue = await readables.get(actual, key, null);
//             if (actualValue === null) {
//                 return of({
//                     kind: 'add',
//                     key,
//                     value: expectedValue,
//                 })
//             } else if (!deepEqual(expectedValue, actualValue)) {
//                 return of({
//                     kind: 'replace',
//                     key,
//                     oldValue: actualValue,
//                     newValue: expectedValue,
//                 })
//             } else {
//                 return of();
//             }
//         }));

//     const orphans = ixa.from(readables.readAll(actual))
//         .pipe(flatMap(async ([key, actualValue]): Promise<AsyncIterable<Diff<T>>> => {
//             if (!(await isKeyExpected(key))) {
//                 return of({
//                     kind: 'delete',
//                     key,
//                     value: actualValue,
//                 });
//             } else {
//                 return of();
//             }
//         }));

//     return concat(diffs, orphans);
// }


function defaultGame(): Game1_0 {
    return {
        players: [],
    }
}

function integrate1_0Helper(a: Action1_0, game: Game1_0): (Game1_0 | null) {
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


function action1_0Upgrade(a: Action1_0): Action1_1 {
    switch (a.kind) {
        case 'join_game':
            return {
                version: '1.1',
                kind: 'join_game',
                gameId: a.gameId,
                playerId: a.playerId,
                createIfNecessary: true,
            }
    }
}



// function integrate1_1Helper(a: Action1_1, game: Game1_1): (Game1_1 | null) {
//     switch (a.kind) {
//         case 'join_game':
//             if (game.state === 'UNCREATED') {
//                 if (a.createIfNecessary) {
//                     return {
//                         state: 'CREATED',
//                         players: [a.playerId],
//                     }
//                 } else {
//                     return null
//                 }
//             }
//             if (game.players.indexOf(a.playerId) !== -1) {
//                 return null
//             }
//             return {
//                 ...game,
//                 players: [...game.players, a.playerId],
//             }
//         case 'create_game';

//     }
// }


async function replayIntegration1_0_0(actionId: string, savedAction: SavedAction, ts: Tables): Promise<void> {
    // Get readable union for state1_0_0_games subtable.
    // For now, each should only have one parent, so cheat.
    // Get game from that. If none, use default.
    let oldGame: Game1_0;
    if (savedAction.parents.length === 0) {
        oldGame = defaultGame();
    } else {
        oldGame = await readables.get(ts.state1_0_0_games,
            [savedAction.parents[0], savedAction.action.gameId], defaultGame());
    }
    // Insert player into game.
    const newGame = integrate1_0Helper(savedAction.action, oldGame);
    if (newGame === null) {
        return
    }

    // Persist under "actionId".
    ts.state1_0_0_games.set([actionId, savedAction.action.gameId], newGame);
}

async function replay(): Promise<{}> {
    let cursor: Key | null = [''];
    console.log('REPLAY')
    while (cursor !== null) {
        console.log('  cursor:', cursor)
        cursor = await db.runTransaction(fsDb,
            async (db: db.Database): Promise<Key | null> => {
                const tables = openAll(db);
                const first = await ixa.first(ixa.from(readables.readAllAfter(tables.actions, cursor!)));
                if (first === undefined) {
                    return null;
                }
                const [[actionId], savedAction] = first;
                await replayIntegration1_0_0(actionId, savedAction, tables);
                return [actionId];
            }
        );
    }
    console.log('DONE')
    return {}
}

function batch(): Router {
    const res = Router()

    // res.post('/check', function(_req: Request<{}>, res, next) {
    //     const cursor = _req.body as BackwardsCheckCursor
    //     check(db, cursor).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    res.post('/replay', function(req: Request<{}>, res, next) {
        replay().then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    // res.post('/backfill', function(_req: Request<{}>, res, next) {
    //     const cursor = _req.body as BackwardsCheckCursor
    //     backfill(db, cursor).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    // res.post('/delete-collection/:collectionId', function(req: Request<DeleteRequest>, res, next) {
    //     deleteCollection(db, req.params).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    return res
}
