import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import GetConfig from './config'
import { AnyAction, Action1_0, Game1_0, Error1_0, AnyError, NumberValue } from './model'
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
    Framework, Outputs1_0_0, Inputs1_0_0, deleteCollection, Inputs1_0_1, Outputs1_0_1
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
        const series: model.Series[] = game.players.map(() => ({ entries: [] }))
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

async function integrate1_0(action: model.AnyAction, inputs: Inputs1_0_0): Promise<util.Result<Diff<Game1_0>[], model.AnyError>> {
    const gameOrDefault = await readables.getOrDefault(inputs.games, [action.gameId], defaultGame1_0());

    const gameResult = integrate1_0_0Helper(action, gameOrDefault);
    if (gameResult.status !== 'ok') {
        return gameResult
    }
    return util.ok(newDiff([action.gameId], gameOrDefault, gameResult.value));
}

const FRAMEWORK = new Framework(db.runTransaction(fsDb), {
    async integrate1_0_0(action: model.AnyAction, inputs: Inputs1_0_0): Promise<util.Result<Outputs1_0_0, model.AnyError>> {
        const gamesResult = await integrate1_0(action, inputs);
        if (gamesResult.status !== 'ok') {
            return gamesResult
        }

        return util.ok({
            games: gamesResult.value,
        })
    },
    async integrate1_0_1({ games }: { games: Diff<Game1_0>[] }, inputs: Inputs1_0_1): Promise<util.Result<Outputs1_0_1, model.AnyError>> {
        const gamesByPlayer = collections.map(collections.fromDiffs(games), gameToPlayerGames);

        return util.ok({
            gamesByPlayer: await collections.toDiffs(gamesByPlayer),
        })
    }
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
            const submissions: Record<string, model.Submission[]> = {};
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

    // res.post('/backfill', function(_req: Request<{}>, res, next) {
    //     const cursor = _req.body as BackwardsCheckCursor
    //     backfill(db, cursor).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    res.post('/delete/:collectionId', function(req: Request<DeleteCollectionRequest>, res, next) {
        deleteCollection(db.runTransaction(fsDb), req.params.collectionId).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    return res
}
