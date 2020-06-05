import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import GetConfig from './config'
import { AnyAction, Action1_0, Game1_0, Game1_1, Error1_0, Error1_1, AnyError, NumberValue } from './model'
import * as model from './model'
import { validate as validateModel } from './model/index.validator'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import * as util from './util'
import deepEqual from 'deep-equal'
import timestamp from 'timestamp-nano';

import { sha256 } from 'js-sha256';
import _ from 'lodash';
import * as collections from './collections';
import * as ix from "ix/iterable"
import * as ixop from "ix/iterable/operators"
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import * as db from './db'
import * as readables from './readables'
import * as ranges from './ranges'
import { Readable, Diff, ItemIterable, Range, Key, Item, Live, Change } from './interfaces'
import { strict as assert } from 'assert';
import {
    SideInputs, CollectionId, Outputs,
    Framework, deleteCollection
} from './schema';
import produce from 'immer';

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

function getHttpCode(error: AnyError): number {
    switch (error.status) {
        case 'GAME_NOT_STARTED':
        case 'GAME_ALREADY_STARTED':
        case 'MOVE_PLAYED_OUT_OF_TURN':
        case 'GAME_IS_OVER':
        case 'INCORRECT_SUBMISSION_KIND':
            return 400;
        case 'PLAYER_NOT_IN_GAME':
            return 403
    }
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

function gameToPlayerGames([[gameId], game]: Item<Game1_0>): Iterable<Item<model.PlayerGame1_0>> {
    return ix.from(game.players).pipe(
        ixop.map((playerId: string): Item<model.PlayerGame1_0> =>
            [[playerId, gameId], getPlayerGameExport(game, playerId)])
    )
}

function getPlayerGameExport(game: Game1_0, playerId: string): model.PlayerGame1_0 {
    if (game.state === 'UNSTARTED') {
        return {
            state: 'UNSTARTED',
            players: game.players,
        }
    }

    const numPlayers = game.players.length
    const roundNum = Math.min(...Object.values(game.submissions).map(a => a.length))

    // Game is over.
    if (roundNum === numPlayers) {
        const series: model.ExportedSeries1_0[] = game.players.map(() => ({ entries: [] }))
        for (let rIdx = 0; rIdx < numPlayers; rIdx++) {
            for (let pIdx = 0; pIdx < numPlayers; pIdx++) {
                series[(pIdx + rIdx) % numPlayers].entries.push({
                    playerId: game.players[pIdx],
                    submission: game.submissions[game.players[pIdx]][rIdx]
                })
            }
        }

        return {
            state: 'GAME_OVER',
            players: game.players,
            series,
        }
    }

    if (game.submissions[playerId].length === 0) {
        return {
            state: 'FIRST_PROMPT',
            players: game.players,
        }
    }

    if (game.submissions[playerId].length === roundNum) {
        const playerIdx = game.players.indexOf(playerId)
        if (playerIdx === -1) {
            throw new Error('baad')
        }
        const nextPlayerIdx = (playerIdx + 1) % game.players.length
        return {
            state: 'RESPOND_TO_PROMPT',
            players: game.players,
            prompt: game.submissions[game.players[nextPlayerIdx]][roundNum - 1]
        }
    }

    return {
        state: 'WAITING_FOR_PROMPT',
        players: game.players,
    }
}

async function integrate1_0(action: model.AnyAction, games: Readable<Game1_0>): Promise<util.Result<Diff<Game1_0>[], model.AnyError>> {
    const gameOrDefault = await readables.getOrDefault(games, [action.gameId], defaultGame1_0());

    const gameResult = integrate1_0_0Helper(action, gameOrDefault);
    if (gameResult.status !== 'ok') {
        return gameResult
    }
    return util.ok(newDiff([action.gameId], gameOrDefault, gameResult.value));
}

async function integrate1_0_2(action: model.AnyAction, games: Readable<Game1_0>): Promise<util.Result<Diff<Game1_0>[], model.AnyError>> {
    const gameOrDefault = await readables.getOrDefault(games, [action.gameId], defaultGame1_0());

    const gameResult = integrate1_0_2Helper(action, gameOrDefault);
    if (gameResult.status !== 'ok') {
        return gameResult
    }
    return util.ok(newDiff([action.gameId], gameOrDefault, gameResult.value));
}

async function integrate1_1_0(action: model.AnyAction, games: Readable<Game1_1>): Promise<util.Result<Diff<Game1_1>[], model.AnyError>> {
    const gameOrDefault = await readables.getOrDefault(games, [action.gameId], defaultGame1_1());

    const gameResult = integrate1_1_0Helper(upgradeAction1_0(action), gameOrDefault);
    if (gameResult.status !== 'ok') {
        return gameResult
    }
    return util.ok(newDiff([action.gameId], gameOrDefault, gameResult.value));
}

function gameToPlayerGames1_1([[gameId], game]: Item<Game1_1>): Iterable<Item<model.PlayerGame1_1>> {
    return ix.from(game.players).pipe(
        ixop.map(({ id }): Item<model.PlayerGame1_1> =>
            [[id, gameId], getPlayerGameExport1_1(game, id)])
    )
}

function getPlayerGameExport1_1(game: Game1_1, playerId: string): model.PlayerGame1_1 {
    if (game.state === 'UNSTARTED') {
        const sanitizedPlayers: model.ExportedPlayer1_1[] = game.players.map(p => ({
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
    const sanitizedPlayers: model.ExportedPlayer1_1[] = game.players.map(p => ({
        id: p.id,
        displayName: p.displayName,
    }))

    const numPlayers = game.players.length
    const roundNum = Math.min(...game.players.map(p => p.submissions.length))

    // Game is over.
    if (roundNum === numPlayers) {
        const series: model.ExportedSeries1_0[] = game.players.map(() => ({ entries: [] }))
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


function gameToPlayerGames1_1to1_0(item: Item<Game1_1>): Iterable<Item<model.PlayerGame1_0>> {
    return ix.from(gameToPlayerGames1_1(item)).pipe(
        ixop.map(([key, pg]: Item<model.PlayerGame1_1>): Item<model.PlayerGame1_0> => {
            return [key, {
                ...pg,
                players: pg.players.map(p => p.id)
            }]
        }),
    );
}

const FRAMEWORK = new Framework(db.runTransaction(fsDb), {
    '1.0.0': async (action: model.AnyAction, inputs: SideInputs['1.0.0']): Promise<util.Result<Outputs['1.0.0'], model.AnyError>> => {
        const gamesResult = await integrate1_0(action, inputs.games);
        if (gamesResult.status !== 'ok') {
            return gamesResult
        }

        return util.ok({
            games: gamesResult.value,
        })
    },
    '1.0.1': async (action: model.AnyAction, inputs: SideInputs['1.0.1']): Promise<util.Result<Outputs['1.0.1'], model.AnyError>> => {
        const gamesResult = await integrate1_0(action, inputs.games);
        if (gamesResult.status !== 'ok') {
            return gamesResult
        }

        const gamesByPlayer = collections.map(collections.fromDiffs(gamesResult.value), gameToPlayerGames);

        return util.ok({
            games: gamesResult.value,
            gamesByPlayer: await collections.toDiffs(gamesByPlayer),
        })
    },
    '1.0.2': async (action: model.AnyAction, inputs: SideInputs['1.0.2']): Promise<util.Result<Outputs['1.0.2'], model.AnyError>> => {
        const gamesResult = await integrate1_0_2(action, inputs.games);
        if (gamesResult.status !== 'ok') {
            return gamesResult
        }

        const gamesByPlayer = collections.map(collections.fromDiffs(gamesResult.value), gameToPlayerGames);

        return util.ok({
            games: gamesResult.value,
            gamesByPlayer: await collections.toDiffs(gamesByPlayer),
        })
    },
    '1.1.0': async (action: model.AnyAction, inputs: SideInputs['1.1.0']): Promise<util.Result<Outputs['1.1.0'], model.AnyError>> => {
        const gamesResult = await integrate1_1_0(action, inputs.games);
        if (gamesResult.status !== 'ok') {
            return gamesResult
        }

        const gamesByPlayer = collections.map(collections.fromDiffs(gamesResult.value), gameToPlayerGames1_1);

        return util.ok({
            games: gamesResult.value,
            gamesByPlayer: await collections.toDiffs(gamesByPlayer),
        })
    },
    '1.1.1': async (action: model.AnyAction, inputs: SideInputs['1.1.1']): Promise<util.Result<Outputs['1.1.1'], model.AnyError>> => {
        const gamesResult = await integrate1_1_0(action, inputs.games);
        if (gamesResult.status !== 'ok') {
            return gamesResult
        }

        const gamesByPlayer1_1 = collections.map(collections.fromDiffs(gamesResult.value), gameToPlayerGames1_1);
        const gamesByPlayer1_0 = collections.map(collections.fromDiffs(gamesResult.value), gameToPlayerGames1_1to1_0);

        return util.ok({
            games: gamesResult.value,
            gamesByPlayer1_0: await collections.toDiffs(gamesByPlayer1_0),
            gamesByPlayer1_1: await collections.toDiffs(gamesByPlayer1_1),
        })
    },
});


app.options('/action', cors())
app.post('/action', cors(), function(req: Request<Dictionary<string>>, res, next) {
    FRAMEWORK.handleAction(validateModel('AnyAction')(req.body)).then((resp) => {
        if (resp !== null) {
            res.status(getHttpCode(resp))
            res.json(resp)
        } else {
            res.status(200)
            res.json()
        }
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


function defaultGame1_0(): Game1_0 {
    return {
        state: 'UNSTARTED',
        players: [],
    }
}

function defaultGame1_1(): Game1_1 {
    return {
        state: 'UNSTARTED',
        players: [],
    }
}

type AsyncResult1_0<R> = util.AsyncResult<R, Error1_0>

export const SUM_COMBINER: collections.Combiner<NumberValue> = {
    identity(): NumberValue { return { value: 0 } },
    opposite(n: NumberValue): NumberValue { return { value: -n.value } },
    combine(a: NumberValue, b: NumberValue): NumberValue {
        return { value: a.value + b.value }
    }
}

function integrate1_0_0Helper(a: Action1_0, gameOrDefault: util.Defaultable<Game1_0>):
    util.Result<util.Defaultable<Game1_0>, Error1_0> {
    const game = gameOrDefault.value;
    switch (a.kind) {
        case 'join_game':
            if (game.players.indexOf(a.playerId) !== -1) {
                return util.ok(gameOrDefault)
            }
            return util.ok(util.defaultable_some({
                ...game,
                players: [...game.players, a.playerId],
            }));

        case 'start_game':
            if (game.state !== 'UNSTARTED') {
                return util.ok(gameOrDefault)
            }
            const submissions: Record<string, model.StateSubmission1_0[]> = {};
            for (const player of game.players) {
                submissions[player] = [];
            }

            return util.ok(util.defaultable_some({
                state: 'STARTED',
                players: game.players,
                submissions,
            }))
        case 'make_move':
            return makeMove(gameOrDefault, a)
    }
}


function integrate1_0_2Helper(a: Action1_0, gameOrDefault: util.Defaultable<Game1_0>):
    util.Result<util.Defaultable<Game1_0>, Error1_0> {
    const game = gameOrDefault.value;
    switch (a.kind) {
        case 'join_game':
            if (game.state !== 'UNSTARTED') {
                return util.err({
                    version: '1.0',
                    status: 'GAME_ALREADY_STARTED',
                    gameId: a.gameId,
                })
            }

            if (game.players.indexOf(a.playerId) !== -1) {
                return util.ok(gameOrDefault)
            }
            return util.ok(util.defaultable_some({
                ...game,
                players: [...game.players, a.playerId],
            }));

        case 'start_game':
            if (game.state !== 'UNSTARTED') {
                return util.ok(gameOrDefault)
            }
            const submissions: Record<string, model.StateSubmission1_0[]> = {};
            for (const player of game.players) {
                submissions[player] = [];
            }

            return util.ok(util.defaultable_some({
                state: 'STARTED',
                players: game.players,
                submissions,
            }))
        case 'make_move':
            return makeMove(gameOrDefault, a)
    }
}

function upgradeAction1_0(a: model.Action1_0): model.Action1_1 {
    switch (a.kind) {
        case 'join_game':
            return {
                version: '1.1',
                kind: 'join_game',
                gameId: a.gameId,
                playerId: a.playerId,
                playerDisplayName: a.playerId,
            }
        case 'start_game':
        case 'make_move':
            return {
                ...a,
                version: '1.1'
            }
    }
}

function integrate1_1_0Helper(a: model.Action1_1, gameOrDefault: util.Defaultable<model.Game1_1>):
    util.Result<util.Defaultable<model.Game1_1>, model.Error1_1> {
    const game = gameOrDefault.value;
    switch (a.kind) {
        case 'join_game':
            if (game.state !== 'UNSTARTED') {
                return util.err({
                    version: '1.0',
                    status: 'GAME_ALREADY_STARTED',
                    gameId: a.gameId,
                })
            }

            if (game.players.some(p => p.id === a.playerId)) {
                return util.ok(gameOrDefault)
            }
            return util.ok(util.defaultable_some({
                ...game,
                players: [...game.players, {
                    id: a.playerId,
                    displayName: a.playerDisplayName,
                }]
            }));

        case 'start_game':
            if (game.state !== 'UNSTARTED') {
                return util.ok(gameOrDefault)
            }
            return util.ok(util.defaultable_some({
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

function makeMove(gameOrDefault: util.Defaultable<Game1_0>, action: model.MakeMoveAction1_0): util.Result<
    util.Defaultable<Game1_0>, Error1_0> {
    const game = gameOrDefault.value;
    const playerId = action.playerId

    if (game.state !== 'STARTED') {
        return util.err({
            version: '1.0',
            status: 'GAME_NOT_STARTED',
            gameId: action.gameId,
        })
    }

    if (game.players.indexOf(playerId) === -1) {
        return util.err({
            version: '1.0',
            status: 'PLAYER_NOT_IN_GAME',
            gameId: action.gameId,
            playerId: action.playerId,
        })
    }

    const roundNum = Math.min(...Object.values(game.submissions).map(s => s.length))
    if (game.submissions[playerId].length !== roundNum) {
        return util.err({
            version: '1.0',
            status: 'MOVE_PLAYED_OUT_OF_TURN',
            gameId: action.gameId,
            playerId: action.playerId,
        })
    }

    if (roundNum === game.players.length) {
        return util.err({
            version: '1.0',
            status: 'GAME_IS_OVER',
            gameId: action.gameId,
        })
    }

    if (roundNum % 2 === 0 && action.submission.kind === 'drawing') {
        return util.err({
            version: '1.0',
            status: 'INCORRECT_SUBMISSION_KIND',
            wanted: 'word',
            got: 'drawing',
        })
    }
    if (roundNum % 2 === 1 && action.submission.kind === 'word') {
        return util.err({
            version: '1.0',
            status: 'INCORRECT_SUBMISSION_KIND',
            wanted: 'word',
            got: 'drawing',
        })
    }

    return util.ok(util.defaultable_some(produce(game, game => {
        game.submissions[playerId].push(action.submission)
    })))
}

function findById<T extends { id: string }>(ts: T[], id: string): T | null {
    return ts.find(t => t.id === id) || null
}

function makeMove1_1(gameOrDefault: util.Defaultable<Game1_1>, action: model.MakeMoveAction1_1): util.Result<
    util.Defaultable<Game1_1>, Error1_1> {
    const game = gameOrDefault.value;
    const playerId = action.playerId

    if (game.state !== 'STARTED') {
        return util.err({
            version: '1.0',
            status: 'GAME_NOT_STARTED',
            gameId: action.gameId,
        })
    }

    const player = findById(game.players, playerId)

    if (player === null) {
        return util.err({
            version: '1.0',
            status: 'PLAYER_NOT_IN_GAME',
            gameId: action.gameId,
            playerId: action.playerId,
        })
    }

    const roundNum = Math.min(...game.players.map(p => p.submissions.length))
    if (player.submissions.length !== roundNum) {
        return util.err({
            version: '1.0',
            status: 'MOVE_PLAYED_OUT_OF_TURN',
            gameId: action.gameId,
            playerId: action.playerId,
        })
    }

    if (roundNum === game.players.length) {
        return util.err({
            version: '1.0',
            status: 'GAME_IS_OVER',
            gameId: action.gameId,
        })
    }

    if (roundNum % 2 === 0 && action.submission.kind === 'drawing') {
        return util.err({
            version: '1.0',
            status: 'INCORRECT_SUBMISSION_KIND',
            wanted: 'word',
            got: 'drawing',
        })
    }
    if (roundNum % 2 === 1 && action.submission.kind === 'word') {
        return util.err({
            version: '1.0',
            status: 'INCORRECT_SUBMISSION_KIND',
            wanted: 'word',
            got: 'drawing',
        })
    }

    return util.ok(util.defaultable_some(produce(game, game => {
        findById(game.players, playerId)!.submissions.push(action.submission)
    })))
}

type DeleteCollectionRequest = {
    collectionId: string
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
        FRAMEWORK.handleReplay().then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    res.post('/reexport', function(req: Request<{}>, res, next) {
        FRAMEWORK.handleReexport().then(result => {
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

    res.post('/delete/:collectionId', function(req: Request<DeleteCollectionRequest>, res, next) {
        deleteCollection(db.runTransaction(fsDb), req.params.collectionId as CollectionId).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    return res
}
