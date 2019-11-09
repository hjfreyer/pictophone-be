import express from 'express';
import { Request, Dictionary } from 'express-serve-static-core';
import produce from 'immer'
import admin from 'firebase-admin';
import cors from 'cors'

import * as types from './types.validator'
import { Firestore, DocumentReference, Transaction } from '@google-cloud/firestore';

admin.initializeApp({
    credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

// // Create a new express application instance
const app: express.Application = express();
app.set('json spaces', 2)
app.use(express.json());


const port = process.env.PORT || 3000;
app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`);
});


type PlayerGames = {
    [playerAndGameId: string]: types.PlayerGame
}

type GameStatus = 'UNSTARTED' | 'ACTIVE' | 'GAME_OVER'

type GameState = {
    state: 'UNSTARTED'
    playerIds: string[]
} | {
    state: 'STARTED'
    playerIds: string[]
    submissions: types.Submission[][]
}

function initGame(): GameState {
    return {
        state: 'UNSTARTED',
        playerIds: []
    }
}

function integrateGame(acc: GameState, action: types.Action): GameState {
    switch (action.kind) {
        case "join_game":
            return produce(joinGame)(acc, action)
        case "start_game":
            return produce(startGame)(acc, action)
        case "make_move":
            return produce(makeMove)(acc, action)
    }
}

function joinGame(game: GameState, action: types.JoinGame) {
    if (game.state !== 'UNSTARTED') {
        return
    }
    if (game.playerIds.indexOf(action.playerId) != -1) {
        return;
    }

    game.playerIds.push(action.playerId);
}

function startGame(game: GameState, action: types.StartGame): GameState {
    if (game.state !== 'UNSTARTED') {
        return game
    }
    if (game.playerIds.length == 0) {
        return game
    }

    return {
        ...game,
        state: 'STARTED',
        submissions: game.playerIds.map(() => [])
    }
}

function makeMove(game: GameState, action: types.MakeMove) {
    if (game.state !== 'STARTED') {
        return
    }
    const playerIdx = game.playerIds.indexOf(action.playerId)
    if (playerIdx === -1) {
        return
    }

    const roundNum = Math.min(...game.submissions.map(a => a.length));
    if (game.submissions[playerIdx].length !== roundNum) {
        return
    }

    // Game is over.
    if (roundNum === game.playerIds.length) {
        return
    }

    if (roundNum % 2 === 0 && action.submission.kind === 'drawing') {
        return
    }
    if (roundNum % 2 === 1 && action.submission.kind === 'word') {
        return
    }

    game.submissions[playerIdx].push(action.submission)
}

function projectGame(gameId: string, state: GameState): PlayerGames {
    const res: PlayerGames = {}

    for (const playerId of state.playerIds) {
        res[`${playerId},${gameId}`] = projectGameForPlayer(state, playerId)
    }

    return res
}

function projectGameForPlayer(state: GameState, playerId: string): types.PlayerGame {
    if (state.state === 'UNSTARTED') {
        return {
            state: "UNSTARTED",
            playerIds: state.playerIds,
        }
    }

    const playerIdx = state.playerIds.indexOf(playerId)
    if (playerIdx === -1) {
        throw new Error("baad")
    }

    const roundNum = Math.min(...state.submissions.map(a => a.length))
    // Game is over.
    if (roundNum === state.playerIds.length) {
        return {
            state: "GAME_OVER",
            playerIds: state.playerIds,
        }
    }

    // const maxSubmissions = Math.max(...state.submissions.map(a => a.length))

    if (state.submissions[playerIdx].length === 0) {
        return {
            state: "FIRST_PROMPT",
            playerIds: state.playerIds,
        }
    }

    if (state.submissions[playerIdx].length === roundNum) {
        return {
            state: "RESPOND_TO_PROMPT",
            playerIds: state.playerIds,
            prompt: state.submissions[(playerIdx + 1) % state.playerIds.length][roundNum - 1]
        }
    } 

    return {
        state: "WAITING_FOR_PROMPT",
        playerIds: state.playerIds,
    }
}


async function applyAction(db: FirebaseFirestore.Firestore, action: types.Action): Promise<void> {
    console.log('action: ', action)
    const gameId = action.gameId;
    await db.runTransaction(async (tx: Transaction): Promise<void> => {
        let log = await gameLog.get(tx, gameId);
        if (log === null) {
            log = {
                lastTimestamp: null,
                entries: []
            }
        }

        let state = initGame();
        for (const entry of log.entries) {
            state = integrateGame(state, entry.action)
        }

        const prevProjection = projectGame(gameId, state)

        state = integrateGame(state, action)

        const newProjection = projectGame(gameId, state)

        applyDiff(tx, prevProjection, newProjection)

        const newEntry: types.GameLogEntry = {
            action,
            timestamp: null
        }
        if (0 < log.entries.length) {
            log.entries[log.entries.length - 1].timestamp = log.lastTimestamp
        }
        log.lastTimestamp = admin.firestore.FieldValue.serverTimestamp()
        log.entries.push(newEntry)
        gameLog.set(tx, gameId, log)
    })
}

function applyDiff(tx: Transaction, prevP: PlayerGames, newP: PlayerGames): void {
    for (const prevKey in prevP) {
        if (!(prevKey in newP)) {
            const split = prevKey.split(',') as [string, string]
            playerGame.delete(tx, split)
        }
    }
    for (const newKey in newP) {
        const split = newKey.split(',') as [string, string]
        playerGame.set(tx, split, newP[newKey])
    }
}

type DPL<K, V> = {
    get(tx: Transaction, k: K): Promise<V | null>
    set(tx: Transaction, k: K, v: V): void
    delete(tx: Transaction, k: K): void
}
type Reffer<KeyType> = (db: Firestore, k: KeyType) => DocumentReference
type Parser<ValueType> = (v: unknown) => ValueType

function mkDpl<K, V>(
    db: Firestore,
    reffer: Reffer<K>,
    parser: Parser<V>): DPL<K, V> {
    return {
        get: async (tx, k) => {
            const data = await tx.get(reffer(db, k))
            if (!data.exists) {
                return null
            }
            return parser(data.data());
        },
        set: (tx, k, v) => {
            tx.set(reffer(db, k), v)
        },
        delete: (tx, k) => {
            tx.delete(reffer(db, k))
        }
    }
}
// //const get : Getter<KeyType, ValueType> = async (tx, k) => {
// const get: Getter<KeyType, ValueType> = async (tx, k) => {

// }
// const set: Setter<KeyType, ValueType> = 
// const delete : Deleter < KeyType >
//     return [getter, setter]
// }

function gameLogRef(db: Firestore, gameId: string): FirebaseFirestore.DocumentReference {
    return db.collection('games').doc(gameId)
}

const gameLog = mkDpl(db, gameLogRef, types.validate('GameLog'))

function playerGameRef(db: Firestore, [playerId, gameId]: [string, string]): FirebaseFirestore.DocumentReference {
    return db.collection('versions').doc('0')
        .collection('players').doc(playerId)
        .collection('games').doc(gameId)
}

const playerGame = mkDpl(db, playerGameRef, types.validate('PlayerGame'))

app.options('/action', cors())
app.post('/action', cors(), async function(req: Request<Dictionary<string>>, res) {
    console.log(req.body)
    await applyAction(db, req.body)
    res.status(200)
    res.json({})
})

