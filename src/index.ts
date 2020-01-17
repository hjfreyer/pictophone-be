import { DocumentReference, Firestore, Transaction, DocumentData } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import batch from './batch'
import GetConfig from './config'
import { applyDiff } from './exports'
import { AnyAction, AnyExport, AnyState } from './model'
import { validate as validateModel } from './model/index.validator'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import path from 'path'
import { DBCollection, Diff, makeIndexingDiffer, makeMappingDiffer, pathToDocumentReference, Item2 } from './framework/incremental'
import { initState, integrate } from './model/v1.0'

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

// Algorithm for applying an action:
//
// 1. Upgrade the state until it's at least as new as the action. Call it PS.
// 2. Upgrade the action until it's at least as new as the state. Call it A.
// 3. Integrate the A into PS. Call the result NS.
// 4. Produce prevStates[v] for all known versions by upgrading and downgrading from PS.
// 5. Produce nextStates[v] for all known versions by upgrading and downgrading from NS.
// 6. Export prevStates[v] for all known versions IFF v is exported (according to 
//    the export map).
// 7. Export nextStates[v] for all known versions IFF v is exported (according to 
//    the export map).
// 8. Apply the diff of the given exports.
//
// TODO: Monitor whether redundant upgrade/downgrade paths all agree with each other.
// type ActionInput = {
//     prevState: AnyState
//     prevExportMap: ExportStateMap
//     action: AnyAction
// }

// type ActionOutput = {
//     nextState: AnyState
//     exportMap: ExportStateMap
//     prevExports: AnyExport[]
//     nextExports: AnyExport[]
// }

// function firstAction(action: AnyAction): ActionOutput {
//     // Steps 1+2 are trivial in this case.
//     const prevState = logic.initState(action.version, action.gameId)

//     // 3
//     const nextState = logic.integrate(prevState, action)

//     // 4 and 6 are unnecessary, as initial states can't have export.

//     // 5 + 7
//     const exportMap: ExportStateMap = { ...EXPORT_STATE }
//     const exports: AnyExport[] = []
//     for (const version of VERSIONS) {
//         exportMap[version] = 'EXPORTED'
//         const migrated = logic.migrateState(action.gameId, nextState, version)
//         exports.push(...logic.exportState(action.gameId, migrated))
//     }

//     // Step 8 is handled by the caller.
//     return {
//         nextState,
//         exportMap,
//         prevExports: [],
//         nextExports: exports,
//     }
// }

// function act({ prevState, prevExportMap, action }: ActionInput): ActionOutput {
//     // 1
//     prevState = logic.upgradeState(action.gameId, prevState, action.version)

//     // 2
//     action = logic.upgradeAction(action, prevState.version)

//     // 3
//     const nextState = logic.integrate(prevState, action)

//     // 4, 5, 6, 7
//     const exportMap = upgradeExportMap(prevExportMap)
//     const prevExports: AnyExport[] = []
//     const nextExports: AnyExport[] = []
//     for (const version of VERSIONS) {
//         if (exportMap[version] !== 'EXPORTED') {
//             continue
//         }
//         const prevMigrated = logic.migrateState(action.gameId, prevState, version)
//         prevExports.push(...logic.exportState(action.gameId, prevMigrated))
//         const nextMigrated = logic.migrateState(action.gameId, nextState, version)
//         nextExports.push(...logic.exportState(action.gameId, nextMigrated))
//     }

//     // Step 8 is handled by the caller.
//     return {
//         nextState,
//         exportMap,
//         prevExports,
//         nextExports,
//     }
// }

// function interest(a: AnyAction): string[] {
//     const res = [`states/${a.version}/games/${a.gameId}`]

//     if (a.kind === 'create_game' && a.shortCode !== '') {
//         res.push(`derived/${a.version}/shortCodes/${a.shortCode}/games`)
//     }

//     return res
// }

// function allRecords(s: PrimaryState): AnyDBRecord[] {
//     const actives = logic.activeStates(s)
//     const res: AnyDBRecord[] = []

//     for (const a of actives) {
//         res.push(a, ...logic.exportState(a))
//     }

//     return res
// }

// async function fetchPath(tx: Transaction, path: string): Promise<AnyDBRecord[]> {
//     if ((path.match(/\//g) || []).length % 2 === 0) {
//         // Collection.
//         const docs = await tx.get(db.collection(path))
//         return docs.docs.map(d => validateModel('AnyDBRecord')(d.data()))
//     } else {
//         const doc = await tx.get(db.doc(path))
//         if (!doc.exists) {
//             return []
//         }
//         return [validateModel('AnyDBRecord')(doc.data())]
//     }
// }

// async function doAction(db: FirebaseFirestore.Firestore, body: unknown): Promise<void> {
//     const originalAction = validateModel('AnyAction')(body)
//     const action = logic.upgradeAction(originalAction)
//     console.log(action)

//     const paths = interest(action)
//     await db.runTransaction(async (tx: Transaction): Promise<void> => {
//         const prevStateDocPromises = paths.map(
//             (p) : [string, Promise<AnyDBRecord[]>] => [p, fetchPath(tx, p)])
//         const prevStateDocs : {[path: string]: AnyDBRecord[]}= {}
//         for (const [path, promise] of prevStateDocPromises) {
//              prevStateDocs[path] = await promise
//         }

//         const nextState = logic.integrate(prevStateDocs, action)

//         const prevStateDoc = await tx.get(
//             db.doc(`states/${PRIMARY_VERSION}/games/${action.gameId}`))

//         let prevRecords: AnyDBRecord[]
//         let nextRecords: AnyDBRecord[]

//         if (prevStateDoc.exists) {
//             const prevState = validateModel('PrimaryState')(prevStateDoc.data())
//             applyDiff(db, tx, allRecords(prevState), allRecords(nextState))
//         } else {
//             applyDiff(db, tx, [], allRecords(nextState))
//         }
//     })
// }

function indexByPlayer(path: string[], value: unknown) {
    const res: string[] = []
    const state = value as AnyState
    for (const gameId in state.players) {
        for (const player of state.players[gameId]) {
            if (res.indexOf(player) === -1) {
                res.push(player)
            }
        }
    }
    return res
}

function indexByGame(path: string[], value: unknown) {
    const res: string[] = []
    const [_, playerId] = path
    const state = value as AnyState
    for (const gameId in state.players) {
        if (state.players[gameId].indexOf(playerId) !== -1) {
            res.push(gameId)
        }
    }
    return res
}

function makePlayerGame(path: string[], value: unknown): Item2<AnyExport>[] {
    const state = value as AnyState
    const res: Item2<AnyExport>[] = []
    for (const gameId in state.players) {
        for (const playerId of state.players[gameId]) {
            res.push([[playerId, gameId], {
                version: "v1.0",
                kind: 'player_game',
                playerId,
                gameId,
                players: state.players[gameId]
            }])
        }
    }
    return res
}

function inputCollections(db: Firestore, tx: Transaction) {
    return {
        'v1.0-universe': new DBCollection(db, tx, ['v1.0-universe'])
    }
}

function applyDiffs(db: Firestore, tx: Transaction, schema: string[], diffs: Diff[]): void {
    for (const diff of diffs) {
        const docRef = pathToDocumentReference(db, schema, diff.path)
        switch (diff.kind) {
            case 'delete':
                tx.delete(docRef)
                break
            case 'add':
                tx.set(docRef, diff.value as DocumentData)
                break
            case 'replace':
                tx.set(docRef, diff.newValue as DocumentData)
                break
        }
    }
}

async function doAction(db: FirebaseFirestore.Firestore, body: unknown): Promise<void> {
    const action = validateModel('AnyAction')(body)

    await db.runTransaction(async (tx: Transaction): Promise<void> => {
        const inputs = inputCollections(db, tx)

        const maybeState = await inputs['v1.0-universe'].get(['root'])
        const state = maybeState.result === 'some'
            ? validateModel('AnyState')(maybeState.value)
            : initState()

        const newState = integrate(state, action)

        const stateDiffs: Diff[] = [maybeState.result === 'some'
            ? { path: ['root'], kind: 'replace', oldValue: state, newValue: newState }
            : { path: ['root'], kind: 'add', value: newState }]

        const playerGamesDiffs = makeMappingDiffer(makePlayerGame)(stateDiffs)

        applyDiffs(db, tx, ['v1.0-universe'], stateDiffs)
        applyDiffs(db, tx, ['v1.0-exports', 'players', 'games'], playerGamesDiffs)
    })
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

app.use('/batch', batch(db))
