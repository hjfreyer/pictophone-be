import { DocumentReference, Firestore, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import batch from './batch'
import GetConfig from './config'
import { applyDiff } from './exports'
import * as logic from './logic'
import { AnyAction, AnyExport, AnyState, VERSIONS, AnyRecord, PrimaryState } from './model'
import { validate as validateModel } from './model/index.validator'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import path from 'path'

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

function interest(a: AnyAction): string[] {
    return [`states/${a.version}/games/${a.gameId}`]
}

function allRecords(s: PrimaryState): AnyRecord[] {
    const actives = logic.activeStates(s)
    const res: AnyRecord[] = []

    for (const a of actives) {
        res.push(a, ...logic.exportState(a))
    }

    return res
}

async function doAction(db: FirebaseFirestore.Firestore, body: unknown): Promise<void> {
    const originalAction = validateModel('AnyAction')(body)
    const action = logic.upgradeAction(originalAction)
    console.log(action)

    const gamePath = interest(action)[0]
    const gameId = path.basename(gamePath)
    await db.runTransaction(async (tx: Transaction): Promise<void> => {
        let prevRecords: AnyRecord[]
        let nextRecords: AnyRecord[]

        const prevStateDoc = await tx.get(db.doc(gamePath))
        if (prevStateDoc.exists) {
            const prevState = validateModel('PrimaryState')(prevStateDoc.data())
            prevRecords = allRecords(prevState)
            const nextState = logic.integrate(prevState, action)
            nextRecords = allRecords(nextState)
        } else {
            prevRecords = []
            const nextState = logic.integrate(logic.initState(gameId), action)
            nextRecords = allRecords(nextState)
        }
        applyDiff(db, tx, prevRecords, nextRecords)
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
