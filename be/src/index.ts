import { DocumentReference, Firestore, Timestamp, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import produce from 'immer'
import uuid from 'uuid/v1'
import { backfillExports, updateGeneration } from './batch'
import GetConfig from './config'
import { getExporter, applyExportDiff } from './exports'
import validateAction from './model/Action.validator'
import Action0, { JoinGame, MakeMove, StartGame } from './model/Action0'
import Export, {VERSIONS as EXPORT_VERSIONS} from './model/Export'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import State from './model/State'
import State0, { initState0 } from './model/State0'
import { ExportStateMap } from './types'
import * as types from './types.validator'
import { mapValues } from './util'
import { GENERATION } from './base'

admin.initializeApp({
    credential: admin.credential.applicationDefault()
})

const storage = new Storage()
const db = admin.firestore()

// Create a new express application instance
const app: express.Application = express()
app.set('json spaces', 2)
app.use(express.json())

const port = process.env.PORT || 3000
app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`)
})

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
        return
    }

    game.players[action.playerId] = {
        id: action.playerId
    }
    game.playerOrder.push(action.playerId)
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
        players: mapValues(game.players, (_, v) => ({ ...v, submissions: [] }))
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


type EsmState = {
    prev: ExportStateMap
    next: ExportStateMap
}

function upgradeExportMap(esm: ExportStateMap): EsmState {
    const known = new Set<string>(EXPORT_VERSIONS)

    const prev = produce(esm, prev => {
        // Fill in any missing gaps in esm.
        for (const version of EXPORT_VERSIONS) {
            if (!(version in prev)) {
                prev[version] = 'NOT_EXPORTED'
            }
        }
    })
    let next: ExportStateMap = mapValues(prev, (version, state) => {
        if (known.has(version)) {
            switch (state) {
                case 'DIRTY': return 'DIRTY'
                case 'EXPORTED': return 'EXPORTED'
                case 'NOT_EXPORTED': return 'EXPORTED'
            }
        }
        switch (state) {
            case 'DIRTY': return 'DIRTY'
            case 'EXPORTED': return 'DIRTY'
            case 'NOT_EXPORTED': return 'NOT_EXPORTED'
        }
    })

    return { prev, next }
}

function exportState(gameId: string, state: State,
    exports: ExportStateMap): Export[] {

    const res: Export[] = []
    for (const version of EXPORT_VERSIONS) {
        if (exports[version] === 'EXPORTED') {
            res.push(...getExporter(version)(gameId, state))
        }
    }

    return res
}

function initStateEntry(): types.StateEntry {
    return {
        generation: 0,
        iteration: 0,
        lastModified: Timestamp.fromMillis(0),
        state: initState0(),
        exports: {},
    }
}

async function doAction(db: FirebaseFirestore.Firestore, body: unknown): Promise<void> {
    const action = validateAction(body)
    console.log(action)

    const gameId = action.gameId
    await db.runTransaction(async (tx: Transaction): Promise<void> => {
        const prevState = await gameState.get(tx, gameId) || initStateEntry()

        const exports = upgradeExportMap(prevState.exports)

        const prevExports = exportState(
            gameId, prevState.state, exports.prev)

        const newState = integrate0(prevState.state, action)
        const newExports = exportState(gameId, newState, exports.next)

        gameState.set(tx, gameId, {
            generation: GENERATION,
            iteration: prevState.iteration + 1,
            exports: exports.next,
            lastModified: admin.firestore.FieldValue.serverTimestamp(),
            state: newState,
        })
        applyExportDiff(db, tx, prevExports, newExports)
    })
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
            return parser(data.data())
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

app.post('/batch/update-generation', function(req: Request<Dictionary<string>>, res, next) {
    updateGeneration(db).then(finished => {
        res.status(200)
        res.json({ finished })
    }).catch(next)
})

app.post('/batch/backfill-exports', function(req: Request<Dictionary<string>>, res, next) {
    backfillExports(db).then(result => {
        res.status(200)
        res.json(result)
    }).catch(next)
})
