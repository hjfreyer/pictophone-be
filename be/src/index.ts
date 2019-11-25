import { DocumentReference, Firestore, Timestamp, Transaction } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import cors from 'cors';
import express from 'express';
import { Dictionary, Request } from 'express-serve-static-core';
import admin from 'firebase-admin';
import produce from 'immer';
import uuid from 'uuid/v1';
import GetConfig from './config';
import { ActionMap } from './model/Action';
import validateAction from './model/Action.validator';
import Action0, { JoinGame, MakeMove, StartGame } from './model/Action0';
import Export from './model/Export';
import validateExport from './model/Export.validator';
import { PlayerGame, Series } from './model/Export0';
import State0, { GameState, initState0 } from './model/State0';
import { Drawing } from './model/Upload';
import validateUpload from './model/Upload.validator';
import UploadResponse from './model/UploadResponse';
import * as types from './types.validator';

admin.initializeApp({
    credential: admin.credential.applicationDefault()
});

const storage = new Storage();
const db = admin.firestore();

// Create a new express application instance
const app: express.Application = express();
app.set('json spaces', 2)
app.use(express.json());

const port = process.env.PORT || 3000;
app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`);
});

function integrate0(acc: State0, action: Action0): State0 {
    switch (action.kind) {
        case 'join_game':
            return produce(joinGame)(acc, action)
        case 'start_game':
            return produce(startGame)(acc, action)
        case 'make_move':
            return produce(makeMove)(acc, action)
    }
}

function joinGame(game: State0, action: JoinGame) {
    if (game.state !== 'UNSTARTED') {
        return
    }

    if (game.playerOrder.indexOf(action.playerId) != -1) {
        return;
    }

    game.players[action.playerId] = {
        id: action.playerId
    }
    game.playerOrder.push(action.playerId);
}

function mapValues<V1, V2>(obj: { [k: string]: V1 }, fn: (k: string, v: V1) => V2): { [k: string]: V2 } {
    return Object.assign({}, ...Object.entries(obj).map(([k, v]) => {
        return { [k]: fn(k, v) }
    }))
}

function startGame(game: State0, action: StartGame): State0 {
    if (game.state !== 'UNSTARTED') {
        return game
    }
    if (game.playerOrder.length === 0) {
        return game
    }

    return {
        ...game,
        state: 'STARTED',
        players: mapValues(game.players, (k, v) => ({ ...v, submissions: [] }))
    }
}

function makeMove(game: State0, action: MakeMove) {
    if (game.state !== 'STARTED') {
        return
    }
    const playerId = action.playerId
    if (!(playerId in game.players)) {
        return
    }

    const roundNum = Math.min(...Object.values(game.players).map(a => a.submissions.length))
    if (game.players[playerId].submissions.length !== roundNum) {
        return
    }

    // Game is over.
    if (roundNum === game.playerOrder.length) {
        return
    }

    if (roundNum % 2 === 0 && action.submission.kind === 'drawing') {
        return
    }
    if (roundNum % 2 === 1 && action.submission.kind === 'word') {
        return
    }

    game.players[playerId].submissions.push(action.submission)
}

function exportState(gameId: string, stateEntry: types.StateEntry): Export[] {
    return stateEntry.state.playerOrder.map(playerId => ({
        version: 0,
        kind: 'player_game',
        gameId,
        playerId,
        ...exportStateForPlayer(stateEntry.state, playerId)
    }));
}

function exportStateForPlayer(state: State0, playerId: string): PlayerGame {
    if (state.state === 'UNSTARTED') {
        return {
            state: 'UNSTARTED',
            playerIds: state.playerOrder,
        }
    }

    const numPlayers = state.playerOrder.length
    const roundNum = Math.min(...Object.values(state.players).map(a => a.submissions.length))

    // Game is over.
    if (roundNum === numPlayers) {
        const series: Series[] = state.playerOrder.map(() => ({ entries: [] }))
        for (let rIdx = 0; rIdx < numPlayers; rIdx++) {
            for (let pIdx = 0; pIdx < numPlayers; pIdx++) {
                series[(pIdx + rIdx) % numPlayers].entries.push({
                    playerId: state.playerOrder[pIdx],
                    submission: state.players[state.playerOrder[pIdx]].submissions[rIdx]
                })
            }
        }

        return {
            state: 'GAME_OVER',
            playerIds: state.playerOrder,
            series,
        }
    }

    if (state.players[playerId].submissions.length === 0) {
        return {
            state: 'FIRST_PROMPT',
            playerIds: state.playerOrder,
        }
    }

    if (state.players[playerId].submissions.length === roundNum) {
        const playerIdx = state.playerOrder.indexOf(playerId)
        if (playerIdx === -1) {
            throw new Error('baad')
        }
        const nextPlayerIdx = (playerIdx + 1) % state.playerOrder.length
        return {
            state: 'RESPOND_TO_PROMPT',
            playerIds: state.playerOrder,
            prompt: state.players[state.playerOrder[nextPlayerIdx]].submissions[roundNum - 1]
        }
    }

    return {
        state: 'WAITING_FOR_PROMPT',
        playerIds: state.playerOrder,
    }
}

function initStateEntry(): types.StateEntry {
    return {
        generation: 0,
        iteration: 0,
        lastModified: Timestamp.fromMillis(0),
        state: initState0()
    }
}

function integrate(states: types.StateEntry, actions: Partial<ActionMap>): types.StateEntry {
    return {
        generation: 0,
        iteration: states.iteration + 1,
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
        state: integrate0(states.state, actions[0]!)
    }
}

function exportKey(e: Export): string {
    switch (e.kind) {
        case 'player_game':
            return JSON.stringify([e.version, e.playerId, e.gameId])
    }
}

type ExportMap = { [key: string]: Export }
function indexExports(exports: Export[]): ExportMap {
    const res: ExportMap = {}

    for (const e of exports) {
        res[exportKey(e)] = e
    }
    return res
}

async function doAction(db: FirebaseFirestore.Firestore, body: unknown): Promise<void> {
    const action = validateAction(body)
    console.log(action)

    const gameId = action.gameId;
    await db.runTransaction(async (tx: Transaction): Promise<void> => {
        const prevState = await gameState.get(tx, gameId) || initStateEntry()
        const prevExports = indexExports(exportState(gameId, prevState))

        const newState = integrate(prevState, { [0]: action })
        const newExports = indexExports(exportState(gameId, newState))

        gameState.set(tx, gameId, newState)
        applyDiff(tx, prevExports, newExports)
    })
}

function applyDiff(tx: Transaction, prevP: ExportMap, newP: ExportMap): void {
    for (const prevKey in prevP) {
        if (!(prevKey in newP)) {
            const key = JSON.parse(prevKey) as [number, string, string]
            playerGame.delete(tx, key)
        }
    }
    for (const newKey in newP) {
        const key = JSON.parse(newKey) as [number, string, string]
        playerGame.set(tx, key, newP[newKey])
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

function gameStateRef(db: Firestore, gameId: string): FirebaseFirestore.DocumentReference {
    return db.collection('state').doc(`game:${gameId}`)
}

const gameState = mkDpl(db, gameStateRef, types.validate('StateEntry'))

function playerGameRef(db: Firestore, [version, playerId, gameId]: [number, string, string]): FirebaseFirestore.DocumentReference {
    return db.collection('versions').doc('' + version)
        .collection('players').doc(playerId)
        .collection('games').doc(gameId)
}

const playerGame = mkDpl(db, playerGameRef, validateExport)

const MAX_POINTS = 50_000

async function doUpload(body: unknown): Promise<UploadResponse> {
    const upload = validateUpload(body)

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
    doAction(db, req.body).then(() => {
        res.status(200)
        res.json({})
    }).catch(next)
})

app.options('/upload', cors())
app.post('/upload', cors(), function(req: Request<Dictionary<string>>, res, next) {
    doUpload(req.body).then(resp => {
        res.status(200)
        res.json(resp)
    }).catch(next)
})
