import { CollectionReference } from '@google-cloud/firestore'
import { strict as assert } from 'assert'
import cors from 'cors'
import deepEqual from 'deep-equal'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import produce from 'immer'
import * as ixa from "ix/asynciterable"
import * as ix from "ix/iterable"
import * as ixop from "ix/iterable/operators"
import { applyChangesSimple, diffToChange, getActionId } from './base'
import * as db from './db'
import * as diffs from './diffs'
import { Change, Diff, Item, item, Key } from './interfaces'
import * as model1_0 from './model/1.0'
import { validate as validate1_0 } from './model/1.0.validator'
import * as model1_1 from './model/1.1'
import * as state1_1_1 from './model/1.1.1'
import { validate as validate1_1_1 } from './model/1.1.1.validator'
import { validate as validate1_1 } from './model/1.1.validator'
import * as readables from './readables'
import {
    AnyAction, AnyError, CollectionId,
    deleteTable, Reference, SavedAction
} from './schema'
import { validate as validateSchema } from './schema/interfaces.validator'
import * as util from './util'
import { Defaultable, defaultable, Option, option, Result, result } from './util'

admin.initializeApp({
    credential: admin.credential.applicationDefault()
})

const fsDb = admin.firestore()

// Create a new express application instance
const app: express.Application = express()
app.set('json spaces', 2)
app.use(express.json())

const port = process.env.PORT || 3000
app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`)
})

interface Inputs2 {
    fetchByLabel(label: string[]): Promise<Option<[string, state1_1_1.Game]>>
}


export const VALIDATORS = {
    '1.0': validate1_0,
    '1.1': validate1_1,
    '1.1.1': validate1_1_1,
}

export type Tables = {
    "ACTIONS": db.Table<SavedAction>
    "ANNOTATIONS,1.1.1": db.Table<state1_1_1.Annotations>
    "LABELS,1.1.1,games": db.Table<Reference>
    // "IMPLEXP,1.1.1,1.0,gamesByPlayer": db.Table<import('../model/1.0').PlayerGame>
    // "IMPLEXP,1.1.1,1.1,gamesByPlayer": db.Table<import('../model/1.1').PlayerGame>
    "EXP,1.0,gamesByPlayer": db.Table<import('./model/1.0').PlayerGame>
    "EXP,1.1,gamesByPlayer": db.Table<import('./model/1.1').PlayerGame>
}

export interface CollectionImpl {

}

export function openAll(db: db.Database): Tables {
    return {
        "ACTIONS": db.open({
            schema: ['actions'],
            validator: validateSchema('SavedAction')
        }),
        "ANNOTATIONS,1.1.1": db.open({
            schema: ['annotations-1.1.1'],
            validator: VALIDATORS['1.1.1']('Annotations')
        }),
        "LABELS,1.1.1,games": db.open({
            schema: ['games-games-1.1.1'],
            validator: validateSchema('Reference')
        }),

        "EXP,1.0,gamesByPlayer": db.open({
            schema: ['players', 'games-gamesByPlayer-1.0'],
            validator: VALIDATORS['1.0']('PlayerGame'),
        }),
        "EXP,1.1,gamesByPlayer": db.open({
            schema: ['players', 'games-gamesByPlayer-1.1'],
            validator: VALIDATORS['1.1']('PlayerGame'),
        }),
    }
}

interface IntegrationResult {
    annotations: state1_1_1.Annotations
    result: Result<SideEffects, state1_1_1.Error>
}

interface SideEffects {
    gamesByPlayer1_0: Change<model1_0.PlayerGame>[]
    gamesByPlayer1_1: Change<model1_1.PlayerGame>[]
}


async function integrator(action: AnyAction, inputs: Inputs2): Promise<IntegrationResult> {
    const maybePrevAnnotation = option.from(await inputs.fetchByLabel([action.gameId]));
    const parents: Item<Reference>[] = maybePrevAnnotation.split({
        onSome: ([actionId,]) => [item([action.gameId], { actionId })],
        onNone: () => [],
    })

    const oldGameOrDefault = maybePrevAnnotation
        .map(([, oldGame]) => oldGame)
        .with_default(defaultGame1_1);

    const maybeNewGameOrError = integrate1_1_1Helper(convertAction(action), oldGameOrDefault);
    return result.from(maybeNewGameOrError).split({
        onErr: (err): IntegrationResult => ({
            annotations: { parents, games: [] },
            result: result.err(err)
        }),
        onOk: (maybeNewGame): IntegrationResult => {
            return option.from(maybeNewGame).split({
                onNone: (): IntegrationResult => ({
                    annotations: { parents, games: [] },
                    result: result.ok({
                        gamesByPlayer1_0: [],
                        gamesByPlayer1_1: []
                    })
                }),
                onSome(newGame): IntegrationResult {
                    const gameDiff = newDiff([action.gameId], oldGameOrDefault, defaultable.of(newGame, defaultGame1_1()));

                    const gamesByPlayer1_0Diffs = diffs.from(gameDiff).map(gameToPlayerGames1_1to1_0).diffs;
                    const gamesByPlayer1_1Diffs = diffs.from(gameDiff).map(gameToPlayerGames1_1).diffs;

                    return {
                        annotations: {
                            parents,
                            games: [{ key: [action.gameId], value: newGame }]
                        },
                        result: result.ok({
                            gamesByPlayer1_0: gamesByPlayer1_0Diffs.map(diffToChange),
                            gamesByPlayer1_1: gamesByPlayer1_1Diffs.map(diffToChange),
                        })
                    }
                }
            })
        }
    })
}

// function sideEffects(label: string[], res: Result<state1_1_1.State, state1_1_1.Error>): 

function doAction(action: AnyAction): Promise<Result<{}, AnyError>> {
    return db.runTransaction(fsDb)(async (db: db.Database): Promise<Result<{}, AnyError>> => {
        const ts = openAll(db);
        const inputs: Inputs2 = {
            async fetchByLabel(label: string[]): Promise<Option<[string, state1_1_1.Game]>> {
                const maybeRef = await readables.getOption(ts["LABELS,1.1.1,games"], label);
                return await option.from(maybeRef).mapAsync(async ref => {
                    const annos = option.from(await readables.getOption(ts["ANNOTATIONS,1.1.1"], [ref.actionId])).unwrap();
                    const game = option.from(findByKey(annos.games, label)).unwrap();
                    return [ref.actionId, game]
                })
            }
        }

        const intResult = await integrator(action, inputs);
        const parents = ix.toArray(ix.from(intResult.annotations.parents).pipe(
            ixop.map(({ value }) => value.actionId),
            ixop.distinct(),
            ixop.orderBy(x => x),
        ));
        const savedAction: SavedAction = { parents, action };
        const actionId = getActionId(savedAction);
        const ref: Reference = { actionId }

        ts["ACTIONS"].set([actionId], savedAction)
        ts["ANNOTATIONS,1.1.1"].set([actionId], intResult.annotations)
        for (const { key } of intResult.annotations.games) {
            ts["LABELS,1.1.1,games"].set(key, ref)
        }

        return result.from(intResult.result).map((sideEffects) => {
            applyChangesSimple(ts["EXP,1.0,gamesByPlayer"], sideEffects.gamesByPlayer1_0)
            applyChangesSimple(ts["EXP,1.1,gamesByPlayer"], sideEffects.gamesByPlayer1_1)

            return {}
        })
    })
}

function replayAction(actionId: string, action: SavedAction): Promise<void> {
    return db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        const inputs: Inputs2 = {
            async fetchByLabel(label: string[]): Promise<Option<[string, state1_1_1.Game]>> {
                const maybeRef = await readables.getOption(ts["LABELS,1.1.1,games"], label);
                return await option.from(maybeRef).mapAsync(async ref => {
                    if (action.parents.indexOf(ref.actionId) === -1) {
                        throw new Error(`Illegal parent fetch`)
                    }
                    const annos = option.from(await readables.getOption(ts["ANNOTATIONS,1.1.1"], [ref.actionId])).unwrap();

                    const game = option.from(findByKey(annos.games, label)).unwrap();
                    return [ref.actionId, game]
                })
            }
        }

        const intResult = await integrator(action.action, inputs);
        const ref: Reference = { actionId }

        ts["ANNOTATIONS,1.1.1"].set([actionId], intResult.annotations)
        for (const { key } of intResult.annotations.games) {
            ts["LABELS,1.1.1,games"].set(key, ref)
        }

        result.from(intResult.result).map((sideEffects) => {
            applyChangesSimple(ts["EXP,1.0,gamesByPlayer"], sideEffects.gamesByPlayer1_0)
            applyChangesSimple(ts["EXP,1.1,gamesByPlayer"], sideEffects.gamesByPlayer1_1)
        })
    })
}

function findByKey<T>(items: Iterable<Item<T>>, target_key: Key): Option<T> {
    const first = ix.first(ix.from(items).pipe(
        ixop.filter(({ key }) => util.lexCompare(target_key, key) === 0),
        ixop.map(({ value }) => value)
    ))

    if (first === undefined) {
        return option.none();
    } else {
        return option.some(first)
    }
}

function checkAction(actionId: string, action: SavedAction, annotations: state1_1_1.Annotations): Promise<void> {
    return db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        const inputs: Inputs2 = {
            async fetchByLabel(label: string[]): Promise<Option<[string, state1_1_1.Game]>> {
                const maybeParent = option.from(findByKey(annotations.parents, label));
                return await maybeParent.mapAsync(async ref => {
                    const annos = option.from(await readables.getOption(ts["ANNOTATIONS,1.1.1"], [ref.actionId])).unwrap();
                    const game = option.from(findByKey(annos.games, label)).unwrap();
                    return [ref.actionId, game]
                })
            }
        }

        const intResult = await integrator(action.action, inputs);
        const parents = ix.toArray(ix.from(intResult.annotations.parents).pipe(
            ixop.map(({ value }) => value.actionId),
            ixop.distinct(),
            ixop.orderBy(x => x),
        ));

        assert.deepEqual(parents, action.parents);
        assert.deepEqual(intResult.annotations, annotations);
    })
}

async function handleReplay(): Promise<void> {
    let cursor: string = '';
    console.log('REPLAY')
    while (true) {
        const nextActionOrNull = await getNextAction(db.runTransaction(fsDb), cursor);
        if (nextActionOrNull === null) {
            break;
        }
        const [actionId, savedAction] = nextActionOrNull;
        const annos = await db.runTransaction(fsDb)(db => readables.getOption(openAll(db)["ANNOTATIONS,1.1.1"], [actionId]));
        await option.from(annos).split({
            async onSome(annos): Promise<void> {
                console.log(`CHECK ${actionId}`)

                await checkAction(actionId, savedAction, annos)
            },
            async onNone(): Promise<void> {
                console.log(`REPLAY ${actionId}`)

                await replayAction(actionId, savedAction)
            }
        })

        cursor = actionId;
    }
    console.log('DONE')
}

export function getNextAction(tx: db.TxRunner, startAfter: string): Promise<([string, SavedAction] | null)> {
    return tx(async (db: db.Database): Promise<([string, SavedAction] | null)> => {
        const actions = openAll(db)["ACTIONS"];
        const first = await ixa.first(ixa.from(readables.readAllAfter(actions, [startAfter])));
        if (first === undefined) {
            return null;
        }
        const { key: [actionId], value: savedAction } = first;
        return [actionId, savedAction];
    });
}

export function newDiff<T>(key: Key, oldValue: util.Defaultable<T>, newValue: util.Defaultable<T>): Diff<T>[] {
    if (oldValue.is_default && newValue.is_default) {
        return [];
    }
    if (oldValue.is_default && !newValue.is_default) {
        return [{
            key,
            kind: 'add',
            value: newValue.value,
        }]
    }
    if (!oldValue.is_default && newValue.is_default) {
        return [{
            key,
            kind: 'delete',
            value: oldValue.value,
        }]
    }
    if (!oldValue.is_default && !newValue.is_default) {
        if (deepEqual(oldValue, newValue, { strict: true })) {
            return []
        } else {
            return [{
                key,
                kind: 'replace',
                oldValue: oldValue.value,
                newValue: newValue.value,
            }]
        }
    }
    throw new Error("unreachable")
}

// async function integrate1_1_0(action: AnyAction, games: Readable<state1_1_1.Game>): Promise<util.Result<Diff<state1_1_1.Game>[], AnyError>> {
//     const gameOrDefault = await readables.getOrDefault(games, [action.gameId], defaultGame1_1());

//     const gameResult = integrate1_1_0Helper(upgradeAction(action), gameOrDefault);
//     if (gameResult.status !== 'ok') {
//         return gameResult
//     }
//     return result.ok(newDiff([action.gameId], gameOrDefault, gameResult.value));
// }

function gameToPlayerGames1_1([gameId]: Key, game: state1_1_1.Game): Iterable<Item<model1_1.PlayerGame>> {
    return ix.from(game.players).pipe(
        ixop.map(({ id }): Item<model1_1.PlayerGame> =>
            item([id, gameId], getPlayerGameExport1_1(game, id)))
    )
}

function getPlayerGameExport1_1(game: state1_1_1.Game, playerId: string): model1_1.PlayerGame {
    if (game.state === 'UNSTARTED') {
        const sanitizedPlayers: model1_1.ExportedPlayer[] = game.players.map(p => ({
            id: p.id,
            displayName: p.displayName,
        }))
        return {
            state: 'UNSTARTED',
            players: sanitizedPlayers,
        }
    }

    // Repeated because TS isn't smart enough to understand this code works whether 
    // the game is started or not.
    const sanitizedPlayers: model1_1.ExportedPlayer[] = game.players.map(p => ({
        id: p.id,
        displayName: p.displayName,
    }))

    const numPlayers = game.players.length
    const roundNum = Math.min(...game.players.map(p => p.submissions.length))

    // Game is over.
    if (roundNum === numPlayers) {
        const series: model1_0.ExportedSeries[] = game.players.map(() => ({ entries: [] }))
        for (let rIdx = 0; rIdx < numPlayers; rIdx++) {
            for (let pIdx = 0; pIdx < numPlayers; pIdx++) {
                series[(pIdx + rIdx) % numPlayers].entries.push({
                    playerId: game.players[pIdx].id,
                    submission: game.players[pIdx].submissions[rIdx]
                })
            }
        }

        return {
            state: 'GAME_OVER',
            players: sanitizedPlayers,
            series,
        }
    }

    const player = findById(game.players, playerId)!;
    if (player.submissions.length === 0) {
        return {
            state: 'FIRST_PROMPT',
            players: sanitizedPlayers,
        }
    }

    if (player.submissions.length === roundNum) {
        const playerIdx = game.players.findIndex(p => p.id === playerId)
        if (playerIdx === -1) {
            throw new Error('baad')
        }
        const nextPlayerIdx = (playerIdx + 1) % game.players.length
        return {
            state: 'RESPOND_TO_PROMPT',
            players: sanitizedPlayers,
            prompt: game.players[nextPlayerIdx].submissions[roundNum - 1]
        }
    }

    return {
        state: 'WAITING_FOR_PROMPT',
        players: sanitizedPlayers,
    }
}


function gameToPlayerGames1_1to1_0(key: Key, value: state1_1_1.Game): Iterable<Item<model1_0.PlayerGame>> {
    return ix.from(gameToPlayerGames1_1(key, value)).pipe(
        ixop.map(({ key, value: pg }: Item<model1_1.PlayerGame>): Item<model1_0.PlayerGame> => {
            return item(key, {
                ...pg,
                players: pg.players.map(p => p.id)
            })
        }),
    );
}


// const FRAMEWORK = new Framework(db.runTransaction(fsDb), {
//     '1.1.1': async (action: AnyAction, inputs: SideInputs['1.1.1']): Promise<Outputs['1.1.1']> => {
//         const gamesResult = await integrate1_1_0(action, inputs.games);
//         if (gamesResult.status !== 'ok') {
//             return {
//                 private: {
//                     games: [],
//                 },
//                 '1.0': {
//                     error: gamesResult.error,
//                     tables: {
//                     gamesByPlayer: [],
//                     }
//                 },
//                 '1.1': {
//                     error: gamesResult.error,
// tables:{                    gamesByPlayer: [],
//        }         }
//             }
//         }

//         const gamesByPlayer1_1 = collections.map(collections.fromDiffs(gamesResult.value), gameToPlayerGames1_1);
//         const gamesByPlayer1_0 = collections.map(collections.fromDiffs(gamesResult.value), gameToPlayerGames1_1to1_0);

//         return {
//             private:{
//                 games: gamesResult.value,
//             },
//             '1.0': {
//                 error: null,
// tables:{                 gamesByPlayer: await collections.toDiffs(gamesByPlayer1_0),
//                }   },
//             '1.1': {
//                 error: null,
//                 tables:{ gamesByPlayer: await collections.toDiffs(gamesByPlayer1_1),
//                         }            }
//         }
//     },
// });

app.options('/action', cors())
app.post('/action', cors(), function(req: Request<Dictionary<string>>, res, next) {
    doAction(validateSchema('AnyAction')(req.body)).then((resp) => {
        if (resp.data.status === 'err') {
            res.status(resp.data.error.status_code)
            res.json(resp)
        } else {
            res.status(200)
            res.json()
        }
    }).catch(next)
})

app.use('/batch', batch())

function defaultGame1_1(): state1_1_1.Game {
    return {
        state: 'UNSTARTED',
        players: [],
    }
}

function convertAction1_0(a: model1_0.Action): state1_1_1.Action {
    switch (a.kind) {
        case 'join_game':
            return {
                kind: 'join_game',
                gameId: a.gameId,
                playerId: a.playerId,
                playerDisplayName: a.playerId,
            }
        case 'start_game':
        case 'make_move':
            return {
                ...a,
            }
    }
}

// function upgradeAction1_0(a: model1_0.Action): state1_1_1.Action {
//     switch (a.kind) {
//         case 'join_game':
//             return {
//                 version: '1.1',
//                 kind: 'join_game',
//                 gameId: a.gameId,
//                 playerId: a.playerId,
//                 playerDisplayName: a.playerId,
//             }
//         case 'start_game':
//         case 'make_move':
//             return {
//                 ...a,
//                 version: '1.1'
//             }
//     }
// }
function convertAction(a: AnyAction): state1_1_1.Action {
    switch (a.version) {
        case '1.0':
            return convertAction1_0(a)
        case '1.1':
            return a
    }
}


function integrate1_1_1Helper(a: state1_1_1.Action, gameOrDefault: Defaultable<state1_1_1.Game>):
    util.Result<Option<state1_1_1.Game>, state1_1_1.Error> {
    const game = gameOrDefault.value;
    switch (a.kind) {
        case 'join_game':
            if (game.state !== 'UNSTARTED') {
                return result.err({
                    version: '1.0',
                    status: 'GAME_ALREADY_STARTED',
                    status_code: 400,
                    gameId: a.gameId,
                })
            }

            if (game.players.some(p => p.id === a.playerId)) {
                return result.ok(option.none())
            }
            return result.ok(option.some({
                ...game,
                players: [...game.players, {
                    id: a.playerId,
                    displayName: a.playerDisplayName,
                }]
            }));

        case 'start_game':
            if (game.state !== 'UNSTARTED') {
                return result.ok(option.none())
            }
            return result.ok(option.some({
                state: 'STARTED',
                players: game.players.map(p => ({
                    ...p,
                    submissions: [],
                })),
            }))
        case 'make_move':
            return makeMove1_1(gameOrDefault, a)
    }
}

function findById<T extends { id: string }>(ts: T[], id: string): T | null {
    return ts.find(t => t.id === id) || null
}

function makeMove1_1(gameOrDefault: util.Defaultable<state1_1_1.Game>, action: state1_1_1.MakeMoveAction): util.Result<
    Option<state1_1_1.Game>, state1_1_1.Error> {
    const game = gameOrDefault.value;
    const playerId = action.playerId

    if (game.state !== 'STARTED') {
        return result.err({
            version: '1.0',
            status: 'GAME_NOT_STARTED',
            status_code: 400,
            gameId: action.gameId,
        })
    }

    const player = findById(game.players, playerId)

    if (player === null) {
        return result.err({
            version: '1.0',
            status: 'PLAYER_NOT_IN_GAME',
            status_code: 403,
            gameId: action.gameId,
            playerId: action.playerId,
        })
    }

    const roundNum = Math.min(...game.players.map(p => p.submissions.length))
    if (player.submissions.length !== roundNum) {
        return result.err({
            version: '1.0',
            status: 'MOVE_PLAYED_OUT_OF_TURN',
            status_code: 400,
            gameId: action.gameId,
            playerId: action.playerId,
        })
    }

    if (roundNum === game.players.length) {
        return result.err({
            version: '1.0',
            status: 'GAME_IS_OVER',
            status_code: 400,
            gameId: action.gameId,
        })
    }

    if (roundNum % 2 === 0 && action.submission.kind === 'drawing') {
        return result.err({
            version: '1.0',
            status: 'INCORRECT_SUBMISSION_KIND',
            status_code: 400,
            wanted: 'word',
            got: 'drawing',
        })
    }
    if (roundNum % 2 === 1 && action.submission.kind === 'word') {
        return result.err({
            version: '1.0',
            status: 'INCORRECT_SUBMISSION_KIND',
            status_code: 400,
            wanted: 'word',
            got: 'drawing',
        })
    }

    return result.ok(option.some(produce(game, game => {
        findById(game.players, playerId)!.submissions.push(action.submission)
    })))
}

type DeleteCollectionRequest = {
    collectionId: string
}

async function handlePurge(): Promise<void> {
    for (const collection of await fsDb.listCollections()) {
        // Never purge the "actions" collection.
        if (collection.id !== 'actions') {
            await purgeCollection(collection)
        }
    }
}

async function purgeCollection(cref: CollectionReference): Promise<void> {
    // Never purge the "actions" collection.
    if (cref.id === 'actions') {
        throw new Error("unexpected 'actions' collection.")
    }
    for (const doc of await cref.listDocuments()) {
        console.log("Deleting:", doc.path)
        doc.delete()
        for (const subC of await doc.listCollections()) {
            await purgeCollection(subC)
        }
    }
}

function batch(): Router {
    const res = Router()

    res.post('/replay', function(_req: Request<{}>, res, next) {
        handleReplay().then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    // res.post('/reexport', function(req: Request<{}>, res, next) {
    //     FRAMEWORK.handleReexport().then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })
    // res.post('/check', function(req: Request<{}>, res, next) {
    //     FRAMEWORK.handleCheck().then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })
    res.post('/purge', function(req: Request<{}>, res, next) {
        handlePurge().then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    res.post('/delete/:collectionId', function(req: Request<DeleteCollectionRequest>, res, next) {
        deleteCollection(db.runTransaction(fsDb), req.params.collectionId as CollectionId).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    return res
}
export async function deleteCollection(runner: db.TxRunner, collectionId: CollectionId): Promise<void> {
    await runner(async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        switch (collectionId) {
            case '1.1.1':
                await deleteTable(ts['ANNOTATIONS,1.1.1'])
                await deleteTable(ts["LABELS,1.1.1,games"]);
        }
    })
}
