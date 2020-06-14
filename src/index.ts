import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import GetConfig from './config'
// import { AnyAction, Action1_0, Game1_0, state1_1_1.Game, Error1_0, Error1_1, AnyError, NumberValue } from './model'
import * as model from './model'

import * as model1_0 from './model/1.0'
import * as model1_1 from './model/1.1'
import * as state1_1_1 from './model/1.1.1'

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
import {Option} from './option';
import * as option from './option';
import {
SavedAction, Reference, AnyAction, AnyError
//     SideInputs, CollectionId, Outputs,
//     Framework, deleteCollection, AnyAction,AnyError,
} from './schema';
import produce from 'immer';

import { validate as validateSchema} from './schema/interfaces.validator'

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

interface Inputs2 {
    fetchByLabel(label: string[]): Promise<Option<[string, state1_1_1.Annotations]>>
}

interface IntegrationResult {
    parents: string[]
    labels: string[][]
    annotations: state1_1_1.Annotations
}


export type Tables = {
    "ACTIONS": db.Table<SavedAction>
    "ANNOTATIONS,1.1.1": db.Table<state1_1_1.Annotations>
    "LABELS,1.1.1,games": db.Table<Reference>
    // "IMPLEXP,1.1.1,1.0,gamesByPlayer": db.Table<import('../model/1.0').PlayerGame>
    // "IMPLEXP,1.1.1,1.1,gamesByPlayer": db.Table<import('../model/1.1').PlayerGame>
    // "EXP,1.0,gamesByPlayer": db.Table<import('../model/1.0').PlayerGame>
    // "EXP,1.1,gamesByPlayer": db.Table<import('../model/1.1').PlayerGame>
}



async function integrator(action : AnyAction, inputs: Inputs2): Promise<IntegrationResult> {
    const prev = await inputs.fetchByLabel([action.gameId]);
    const parents = option.from(prev).map(([actionId,])=>[actionId]).or_else(() => [])

    const gameOrDefault = await readables.getOrDefault(games, [action.gameId], defaultGame1_1());
}

async function doAction(action : AnyAction): Promise<AnyError | null> {
    
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
//     return util.ok(newDiff([action.gameId], gameOrDefault, gameResult.value));
// }

// function gameToPlayerGames1_1([[gameId], game]: Item<state1_1_1.Game>): Iterable<Item<model1_1.PlayerGame>> {
//     return ix.from(game.players).pipe(
//         ixop.map(({ id }): Item<model1_1.PlayerGame> =>
//             [[id, gameId], getPlayerGameExport1_1(game, id)])
//     )
// }

// function getPlayerGameExport1_1(game: state1_1_1.Game, playerId: string): model1_1.PlayerGame {
//     if (game.state === 'UNSTARTED') {
//         const sanitizedPlayers: model1_1.ExportedPlayer[] = game.players.map(p => ({
//             id: p.id,
//             displayName: p.displayName,
//         }))
//         return {
//             state: 'UNSTARTED',
//             players: sanitizedPlayers,
//         }
//     }

//     // Repeated because TS isn't smart enough to understand this code works whether 
//     // the game is started or not.
//     const sanitizedPlayers: model1_1.ExportedPlayer[] = game.players.map(p => ({
//         id: p.id,
//         displayName: p.displayName,
//     }))

//     const numPlayers = game.players.length
//     const roundNum = Math.min(...game.players.map(p => p.submissions.length))

//     // Game is over.
//     if (roundNum === numPlayers) {
//         const series: model1_0.ExportedSeries[] = game.players.map(() => ({ entries: [] }))
//         for (let rIdx = 0; rIdx < numPlayers; rIdx++) {
//             for (let pIdx = 0; pIdx < numPlayers; pIdx++) {
//                 series[(pIdx + rIdx) % numPlayers].entries.push({
//                     playerId: game.players[pIdx].id,
//                     submission: game.players[pIdx].submissions[rIdx]
//                 })
//             }
//         }

//         return {
//             state: 'GAME_OVER',
//             players: sanitizedPlayers,
//             series,
//         }
//     }

//     const player = findById(game.players, playerId)!;
//     if (player.submissions.length === 0) {
//         return {
//             state: 'FIRST_PROMPT',
//             players: sanitizedPlayers,
//         }
//     }

//     if (player.submissions.length === roundNum) {
//         const playerIdx = game.players.findIndex(p => p.id === playerId)
//         if (playerIdx === -1) {
//             throw new Error('baad')
//         }
//         const nextPlayerIdx = (playerIdx + 1) % game.players.length
//         return {
//             state: 'RESPOND_TO_PROMPT',
//             players: sanitizedPlayers,
//             prompt: game.players[nextPlayerIdx].submissions[roundNum - 1]
//         }
//     }

//     return {
//         state: 'WAITING_FOR_PROMPT',
//         players: sanitizedPlayers,
//     }
// }


// function gameToPlayerGames1_1to1_0(item: Item<state1_1_1.Game>): Iterable<Item<model1_0.PlayerGame>> {
//     return ix.from(gameToPlayerGames1_1(item)).pipe(
//         ixop.map(([key, pg]: Item<model1_1.PlayerGame>): Item<model1_0.PlayerGame> => {
//             return [key, {
//                 ...pg,
//                 players: pg.players.map(p => p.id)
//             }]
//         }),
//     );
// }


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
        if (resp !== null) {
            res.status(resp.status_code)
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

function upgradeAction1_0(a: model1_0.Action): model1_1.Action {
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
// function upgradeAction(a: AnyAction): model1_1.Action {
//     switch (a.version) {
//         case '1.0':
//             a = upgradeAction1_0(a)
//         case '1.1':
//             return a
//     }
// }


function integrate1_1_0Helper(a: model1_1.Action, gameOrDefault: util.Defaultable<state1_1_1.Game>):
    util.Result<util.Defaultable<state1_1_1.Game>, model1_1.Error> {
    const game = gameOrDefault.value;
    switch (a.kind) {
        case 'join_game':
            if (game.state !== 'UNSTARTED') {
                return util.err({
                    version: '1.0',
                    status: 'GAME_ALREADY_STARTED',
                               status_code: 400,
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

function findById<T extends { id: string }>(ts: T[], id: string): T | null {
    return ts.find(t => t.id === id) || null
}

function makeMove1_1(gameOrDefault: util.Defaultable<state1_1_1.Game>, action: model1_1.MakeMoveAction): util.Result<
    util.Defaultable<state1_1_1.Game>, model1_1.Error> {
    const game = gameOrDefault.value;
    const playerId = action.playerId

    if (game.state !== 'STARTED') {
        return util.err({
            version: '1.0',
            status: 'GAME_NOT_STARTED',
           status_code: 400,
             gameId: action.gameId,
        })
    }

    const player = findById(game.players, playerId)

    if (player === null) {
        return util.err({
            version: '1.0',
            status: 'PLAYER_NOT_IN_GAME',
           status_code: 403,
             gameId: action.gameId,
            playerId: action.playerId,
        })
    }

    const roundNum = Math.min(...game.players.map(p => p.submissions.length))
    if (player.submissions.length !== roundNum) {
        return util.err({
            version: '1.0',
            status: 'MOVE_PLAYED_OUT_OF_TURN',
               status_code: 400,
         gameId: action.gameId,
            playerId: action.playerId,
        })
    }

    if (roundNum === game.players.length) {
        return util.err({
            version: '1.0',
            status: 'GAME_IS_OVER',
              status_code: 400,
             gameId: action.gameId,
        })
    }

    if (roundNum % 2 === 0 && action.submission.kind === 'drawing') {
        return util.err({
            version: '1.0',
            status: 'INCORRECT_SUBMISSION_KIND',
            status_code: 400,
            wanted: 'word',
            got: 'drawing',
        })
    }
    if (roundNum % 2 === 1 && action.submission.kind === 'word') {
        return util.err({
            version: '1.0',
            status: 'INCORRECT_SUBMISSION_KIND',
            status_code: 400,
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

    // res.post('/replay', function(req: Request<{}>, res, next) {
    //     FRAMEWORK.handleReplay().then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

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
    // res.post('/purge', function(req: Request<{}>, res, next) {
    //     FRAMEWORK.handlePurge().then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    // res.post('/delete/:collectionId', function(req: Request<DeleteCollectionRequest>, res, next) {
    //     deleteCollection(db.runTransaction(fsDb), req.params.collectionId as CollectionId).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    return res
}
