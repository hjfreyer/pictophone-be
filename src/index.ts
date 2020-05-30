import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import GetConfig from './config'
import { Action1_1, AnyAction, Action1_0, Game1_0, Game1_1, Error1_1, TaggedGame1_0, SavedAction, ActionTableMetadata, NumberValue } from './model'
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
    Integrator1_1_0, Integrator1_1_1, Framework,
    openAll, Tables, applyOutputs1_1_0, applyOutputs1_1_1, Outputs1_1_0, Outputs1_1_1,
    Inputs1_1_0, Inputs1_1_1, getTrackedInputs1_1_0, getTrackedInputs1_1_1, deleteCollection
} from './schema';


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

function upgradeAction(action: AnyAction): Action1_1 {
    switch (action.version) {
        case '1.0':
            action = upgradeAction1_0(action);
        case '1.1':
            return action;
    }
}

function getHttpCode(error: Error1_1): number {
    switch (error.status) {
        case 'GAME_NOT_FOUND':
            return 404;
        case 'SHORT_CODE_IN_USE':
        case 'GAME_ALREADY_EXISTS':
            return 403;
    }
}

const INT1_1_0: Integrator1_1_0 = {
    integrate(action: model.AnyAction, inputs: Inputs1_1_0): Promise<util.Result<Outputs1_1_0, model.AnyError>> {
        return integrate1_1_0MiddleHelper(upgradeAction(action), inputs)
    }
}

const INT1_1_1: Integrator1_1_1 = {
    integrate(action: model.AnyAction, inputs: Inputs1_1_1): Promise<util.Result<Outputs1_1_1, model.AnyError>> {
        return integrate1_1_1MiddleHelper(upgradeAction(action), inputs)
    }
}

const FRAMEWORK = new Framework(db.runTransaction(fsDb), INT1_1_0, INT1_1_1);


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


function defaultGame1_1(): Game1_1 {
    return {
        state: 'UNCREATED'
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

type AsyncResult1_1<R> = util.AsyncResult<R, Error1_1>

export const SUM_COMBINER: collections.Combiner<NumberValue> = {
    identity(): NumberValue { return { value: 0 } },
    opposite(n: NumberValue): NumberValue { return { value: -n.value } },
    combine(a: NumberValue, b: NumberValue): NumberValue {
        return { value: a.value + b.value }
    }
}

async function integrate1_1_0MiddleHelper(
    a: Action1_1, inputs: Inputs1_1_0): AsyncResult1_1<Outputs1_1_0> {
    // Action1_1 + Game state + scuc state => Diffs of Games
    const gameDiffsResult = await integrate1_1_0Helper(a, inputs);
    if (gameDiffsResult.status !== 'ok') {
        return gameDiffsResult
    }
    const games = collections.fromDiffs(gameDiffsResult.value);

    // Diffs of games => Diffs of numbers indexed by short code.
    const indexedShortCodes = collections.map(games, mapShortCode);

    // Diffs of indexed short code count => diffs of sums to apply to DB.
    const shortCodeUsageCount = collections.combine(indexedShortCodes, SUM_COMBINER, inputs.shortCodeUsageCount)

    return util.ok({
        games: await collections.toDiffs(games),
        shortCodeUsageCount: await collections.toDiffs(shortCodeUsageCount),
    })
}

async function integrate1_1_0Helper(a: Action1_1, inputs: Inputs1_1_0):
    AsyncResult1_1<Diff<Game1_1>[]> {
    const game = await readables.get(inputs.games, [a.gameId], defaultGame1_1());
    switch (a.kind) {
        case 'join_game':
            if (game.state === 'UNCREATED') {
                if (a.createIfNecessary) {
                    return util.ok([{
                        kind: 'replace',
                        key: [a.gameId],
                        oldValue: game,
                        newValue: {
                            state: 'CREATED',
                            players: [a.playerId],
                            shortCode: '',
                        }
                    }])
                } else {
                    return util.err({
                        version: '1.1',
                        status: 'GAME_NOT_FOUND',
                        gameId: a.gameId,
                    })
                }
            }
            if (game.players.indexOf(a.playerId) !== -1) {
                return util.ok([])
            }
            return util.ok([{
                kind: 'replace',
                key: [a.gameId],
                oldValue: game,
                newValue: {
                    ...game,
                    players: [...game.players, a.playerId],
                }
            }])

        case 'create_game':
            if (game.state !== 'UNCREATED') {
                return util.err({
                    version: '1.1',
                    status: 'GAME_ALREADY_EXISTS', gameId: a.gameId
                })
            }
            if (a.shortCode === '') {
                throw new Error("Validator should have caught this.")
            }
            const scCount = await readables.get(inputs.shortCodeUsageCount, [a.shortCode], { value: 0 });
            if (scCount.value !== 0) {
                return util.err({
                    version: '1.1',
                    status: 'SHORT_CODE_IN_USE',
                    shortCode: a.shortCode,
                })
            }
            return util.ok([{
                kind: 'replace',
                key: [a.gameId],
                oldValue: game,
                newValue: {
                    state: 'CREATED',
                    players: [],
                    shortCode: a.shortCode
                }
            }])
    }
}



async function integrate1_1_1MiddleHelper(a: Action1_1, inputs: Inputs1_1_0): AsyncResult1_1<Outputs1_1_1> {
    const outputs1_1OrError = await integrate1_1_0MiddleHelper(a, inputs);
    if (outputs1_1OrError.status === 'err') {
        return outputs1_1OrError;
    }
    const outputs1_1 = outputs1_1OrError.value;


    return util.ok({
        ...outputs1_1,
        gamesByPlayer: await collections.toDiffs(collections.map(
            collections.fromDiffs(outputs1_1.games), gameToGamesByPlayer))
    })
}

function gameToGamesByPlayer([gameKey, game]: Item<Game1_1>): Item<Game1_1>[] {
    if (game.state !== 'CREATED') {
        return []
    }
    return util.sorted(game.players).map((playerId): Item<Game1_1> => [[playerId, ...gameKey], game])
}

function mapShortCode([key, game]: Item<Game1_1>): Item<NumberValue>[] {
    if (game.state !== 'CREATED' || game.shortCode === '') {
        return []
    }
    return [[[game.shortCode], { value: 1 }]]
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
