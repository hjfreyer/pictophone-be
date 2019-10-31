import express from 'express';
import { Request, Dictionary } from 'express-serve-static-core';
import produce from 'immer'
import admin from 'firebase-admin';

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

type PlayerGames = {
    [playerAndGameId: string]: types.PlayerGame
}

type GameState = {
    playerIds: string[]
}

function initGame(): GameState {
    return {
        playerIds: []
    }
}

function integrateGame(acc: GameState, action: types.Action): GameState {
    return produce(acc, (draft) => {
        if (draft.playerIds.indexOf(action.playerId) != -1) {
            return;
        }

        draft.playerIds.push(action.playerId);
    })
}

function projectGame(gameId: string, state: GameState): PlayerGames {
    const res : PlayerGames = {}

    for (const playerId of state.playerIds) {
        res[`${playerId},${gameId}`] = {
            playerIds: state.playerIds,
            //state: game.state,
        }
    }

    return res
}

async function applyAction(db: FirebaseFirestore.Firestore, action: types.Action): Promise<void> {
    const gameId = action.gameId;
    db.runTransaction(async (tx: Transaction): Promise<void> => {
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


app.post('/action', async function(req: Request<Dictionary<string>>, res) {
    await applyAction(db, req.body)
    res.status(200)
    res.json({})
})


const port = process.env.PORT || 3000;
app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`);
});
