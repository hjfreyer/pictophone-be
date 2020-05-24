import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import GetConfig from './config'
import { Action1_1, AnyAction, Action1_0, Game1_0, Game1_1, TaggedGame1_0, TaggedGame1_1, SavedAction, Symlink, ActionTableMetadata, NumberValue } from './model'
import { validate as validateModel } from './model/index.validator'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import * as util from './util'
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
import { Readable, Diff, ItemIterable, Range, Key } from './interfaces'
import { strict as assert } from 'assert';


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

function upgradeAction(action: AnyAction): Action1_1 {
    switch (action.version) {
        case '1.0':
            action = upgradeAction1_0(action);
        case '1.1':
            return action;
    }
}



function doAction(fsDb: FirebaseFirestore.Firestore, body: unknown): Promise<void> {
    const anyAction = validateModel('AnyAction')(body)
    // // const action = upgradeAction(anyAction)

    return db.runTransaction(fsDb, async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        const [actionId, savedAction] = await doLiveIntegration1_1_0(upgradeAction(anyAction), ts);
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
    actionTableMetadata: db.Table<ActionTableMetadata>
    state1_0_0_games: db.Table<Game1_0>
    state1_0_0_games_symlinks: db.Table<Symlink>
    state1_1_0_games: db.Table<Game1_1>
    state1_1_0_games_symlinks: db.Table<Symlink>
    state1_1_0_shortCodeUsageCount: db.Table<NumberValue>
    state1_1_0_shortCodeUsageCount_symlinks: db.Table<Symlink>
}

function openAll(db: db.Database): Tables {
    return {
        actions: db.open({
            schema: ['actions'],
            validator: validateModel('SavedAction')
        }),
        actionTableMetadata: db.open({
            schema: ['actions', '_META_'],
            validator: validateModel('ActionTableMetadata')
        }),
        state1_0_0_games: db.open({
            schema: ['actions', 'state-1.0.0-games'],
            validator: validateModel('Game1_0')
        }),
        state1_0_0_games_symlinks: db.open({
            schema: ['state-1.0.0-games-symlinks'],
            validator: validateModel('Symlink')
        }),
        state1_1_0_games: db.open({
            schema: ['actions', 'state-1.1.0-games'],
            validator: validateModel('Game1_1')
        }),
        state1_1_0_games_symlinks: db.open({
            schema: ['state-1.1.0-games-symlinks'],
            validator: validateModel('Symlink')
        }),
        state1_1_0_shortCodeUsageCount: db.open({
            schema: ['actions', 'state-1.1.0-scuc'],
            validator: validateModel('NumberValue')
        }),
        state1_1_0_shortCodeUsageCount_symlinks: db.open({
            schema: ['state-1.1.0-scuc-symlinks'],
            validator: validateModel('Symlink')
        }),
    }
}

function nestedActionTable<T>(table: db.Table<T>, actionId: string): db.Table<T> {
    return {
        schema: table.schema.slice(1),
        read(innerRange: Range): ItemIterable<T> {
            const outerRange = ((): Range => {
                if (innerRange.kind == 'bounded') {
                    return ranges.bounded([actionId, ...innerRange.start], [actionId, ...innerRange.end])
                } else {
                    return ranges.bounded([actionId, ...innerRange.start],
                        [...ranges.keySuccessor([actionId]), ...table.schema.slice(1).map(() => '')])
                }
            })();

            return ixa.from(table.read(outerRange))
                .pipe(ixaop.map(([k, v]) => [k.slice(1), v]))
        },

        set(key: Key, value: T): void {
            throw "unimpl"
        },

        delete(key: Key): void {
            throw "unimpl"
        }
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


function defaultGame1_0(): Game1_0 {
    return {
        players: [],
    }
}

function defaultGame1_1(): Game1_1 {
    return {
        state: 'UNCREATED'
    }
}
function defaultMetadata(): ActionTableMetadata {
    return { valid: false }
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


function upgradeAction1_0(a: Action1_0): Action1_1 {
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

type Inputs1_1 = {
    games: Readable<Game1_1>
    shortCodeUsageCount: Readable<NumberValue>
}

async function integrate1_1Helper(a: Action1_1, inputs: Inputs1_1): Promise<[Key, Game1_1, Game1_1] | null> {
    const game = await readables.get(inputs.games, [a.gameId], defaultGame1_1());
    switch (a.kind) {
        case 'join_game':
            if (game.state === 'UNCREATED') {
                if (a.createIfNecessary) {
                    return [[a.gameId], game, {
                        state: 'CREATED',
                        players: [a.playerId],
                        shortCode: '',
                    }]
                } else {
                    return null
                }
            }
            if (game.players.indexOf(a.playerId) !== -1) {
                return null
            }
            return [[a.gameId], game, {
                ...game,
                players: [...game.players, a.playerId],
            }]
        case 'create_game':
            if (game.state !== 'UNCREATED') {
                return null
            }
            if (a.shortCode === '') {
                return null
            }
            const scCount = await readables.get(inputs.shortCodeUsageCount, [a.shortCode], { value: 0 });
            if (scCount.value !== 0) {
                return null
            }
            return [[a.gameId], game, {
                state: 'CREATED',
                players: [],
                shortCode: a.shortCode
            }]
    }
}

// Not general.
function shortCodeDiff(oldGame: Game1_1, newGame: Game1_1): ([string, number] | null) {
    if (oldGame.state === 'CREATED') {
        return null
    }
    if (newGame.state === 'UNCREATED' || newGame.shortCode === '') {
        return null
    }
    return [newGame.shortCode, 1]
}

async function doLiveIntegration1_1_0(action: Action1_1, ts: Tables): Promise<[string, SavedAction]> {
    const parentSet = new Set<string>();
    const inputs: Inputs1_1 = {
        games: {
            schema: ['state-1.1.0-games'],
            read(range: Range): ItemIterable<Game1_1> {
                const links = ixa.from(ts.state1_1_0_games_symlinks.read(range))
                return links.pipe(
                    ixaop.tap(([, link]) => { parentSet.add(link.actionId) }),
                    ixaop.flatMap(([key, link]) =>
                        ts.state1_1_0_games.read(ranges.singleValue([link.actionId, ...key])))
                )
            }
        },
        shortCodeUsageCount: {
            schema: ['state-1.1.0-scuc'],
            read(range: Range): ItemIterable<NumberValue> {
                const links = ixa.from(ts.state1_1_0_shortCodeUsageCount_symlinks.read(range))
                return links.pipe(
                    ixaop.tap(([, link]) => { parentSet.add(link.actionId) }),
                    ixaop.flatMap(([key, link]) =>
                        ts.state1_1_0_shortCodeUsageCount.read(ranges.singleValue([link.actionId, ...key])))
                )
            }
        }
    }

    // Integrate the action.
    const result = await integrate1_1Helper(action, inputs);
    const scUpdate = await (async (): Promise<[Key, NumberValue] | null> => {
        if (result === null) {
            return null
        }
        const [key, oldGame, newGame] = result;
        const scDiff = shortCodeDiff(oldGame, newGame)
        if (scDiff === null) {
            return null
        }
        const [scKey, scDelta] = scDiff;
        const scCount = await readables.get(inputs.shortCodeUsageCount, [scKey], { value: 0 });
        return [[scKey], { value: scCount.value + scDelta }];
    })()

    // Save the action and metadata.
    const savedAction: SavedAction = { parents: util.sorted(parentSet), action }
    const actionId = getActionId(savedAction)

    ts.actions.set([actionId], savedAction);
    ts.actionTableMetadata.set([actionId, 'state-1.1.0'], { valid: true });
    if (result !== null) {
        const [key, , newGame] = result;
        ts.state1_1_0_games.set([actionId, ...key], newGame);
        ts.state1_1_0_games_symlinks.set(key, { actionId, value: newGame });
    }
    if (scUpdate !== null) {
        const [scKey, newCount] = scUpdate;
        ts.state1_1_0_shortCodeUsageCount.set([actionId, ...scKey], newCount);
        ts.state1_1_0_shortCodeUsageCount_symlinks.set(scKey, { actionId, value: newCount });
    }
    return [actionId, savedAction]
}


// TODO: these replays need to delete any errant orphans.

async function replayIntegration1_1_0(actionId: string, savedAction: SavedAction, ts: Tables): Promise<void> {
    const meta = await readables.get(ts.actionTableMetadata, [actionId, 'state-1.1.0'], defaultMetadata());
    if (meta.valid) {
        // Already done.
        return;
    }

    const parentMetas = ixa.from(savedAction.parents).pipe(
        ixaop.map(p => readables.get(ts.actionTableMetadata, [p, 'state-1.1.0'], defaultMetadata())),
    )

    if (await ixa.some(parentMetas, meta => !meta.valid)) {
        return;
    }

    const parentsGames = savedAction.parents.map(p => nestedActionTable(ts.state1_1_0_games, p))
    const parentsScuc = savedAction.parents.map(p => nestedActionTable(ts.state1_1_0_shortCodeUsageCount, p))

    const inputs: Inputs1_1 = {
        games: readables.merge(['state-1.1.0-games'], parentsGames),
        shortCodeUsageCount: readables.merge(['state-1.1.0-scuc'], parentsScuc),
    }

    // Integrate the action.
    const result = await integrate1_1Helper(upgradeAction(savedAction.action), inputs);
    const scUpdate = await (async (): Promise<[Key, NumberValue] | null> => {
        if (result === null) {
            return null
        }
        const [key, oldGame, newGame] = result;
        const scDiff = shortCodeDiff(oldGame, newGame)
        if (scDiff === null) {
            return null
        }
        const [scKey, scDelta] = scDiff;
        const scCount = await readables.get(inputs.shortCodeUsageCount, [scKey], { value: 0 });
        return [[scKey], { value: scCount.value + scDelta }];
    })()

    // Save the metadata.
    ts.actionTableMetadata.set([actionId, 'state-1.1.0'], { valid: true });

    // ... and the data.
    if (result !== null) {
        const [key, , newGame] = result;
        ts.state1_1_0_games.set([actionId, ...key], newGame);
        ts.state1_1_0_games_symlinks.set(key, { actionId, value: newGame });
    }
    if (scUpdate !== null) {
        const [scKey, newCount] = scUpdate;
        ts.state1_1_0_shortCodeUsageCount.set([actionId, ...scKey], newCount);
        ts.state1_1_0_shortCodeUsageCount_symlinks.set(scKey, { actionId, value: newCount });
    }
}

async function replay(): Promise<{}> {
    let cursor: Key = [''];
    console.log('REPLAY')
    while (true) {
        console.log('  cursor:', cursor)
        const nextAction = await db.runTransaction(fsDb,
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

        for (const integrator of [replayIntegration1_1_0]) {
            await db.runTransaction(fsDb, async (db: db.Database): Promise<void> => {
                const tables = openAll(db);
                const savedAction = (await readables.get(tables.actions, [nextAction], null));
                if (savedAction === null) {
                    throw new Error('wut');
                }

                await integrator(nextAction, savedAction, tables);
            });
        }
        cursor = [nextAction];
    }
    console.log('DONE')
    return {}
}

type DeleteRequest = {
    tableId: string
}

async function deleteTable({ tableId }: DeleteRequest): Promise<void> {
    if (tableId === 'actions') {
        throw new Error('nope')
    }
    await db.runTransaction(fsDb, async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        if (!(tableId in ts)) {
            throw new Error(`no such table: "${tableId}"`)
        }
        const table: db.Table<unknown> = ts[tableId as keyof typeof ts];
        for await (const [k,] of readables.readAll(table)) {
            table.delete(k)
        }
    })
}
type DeleteMetaRequest = {
    collectionId: string
}

async function deleteMeta({ collectionId }: DeleteMetaRequest): Promise<void> {
    await db.runTransaction(fsDb, async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        for await (const [k,] of readables.readAll(ts.actionTableMetadata)) {
            if (k[k.length - 1] === collectionId) {
                ts.actionTableMetadata.delete(k)
            }
        }
    })
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

    res.post('/delete/:tableId', function(req: Request<DeleteRequest>, res, next) {
        deleteTable(req.params).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })
    res.post('/delete-meta/:collectionId', function(req: Request<DeleteMetaRequest>, res, next) {
        deleteMeta(req.params).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    return res
}
