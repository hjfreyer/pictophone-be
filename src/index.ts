import { DocumentData, Firestore, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import batch from './batch'
import { getCollections, INPUT_ID, INPUT_OP } from './collections'
import GetConfig from './config'
import { DBHelper } from './framework/db'
import { Diff, getSchema, Op, Processor } from './framework/graph'
import { Action1_0, Game1_0, State1_0 } from './model'
import { validate as validateModel } from './model/index.validator'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'

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

export function integrate1_0(acc: Game1_0 | null, action: Action1_0): State1_0 {
    acc = acc || {            players: []        }

    if (acc.players.indexOf(action.playerId) !== -1) {
        return acc
    }
    return {
        players: [...acc.players, action.playerId]
    }
}

async function reactTo(
    p: Processor,
    action: Action1_0,
    input: Op<State1_0, State1_0>): Promise<Diff<State1_0>[]> {
        const key = [action.gameId]
    const maybeState = await p.get(input,key)
    const newState = integrate1_0(maybeState, action)

    return [maybeState !== null
        ? { kind: 'replace', key, oldValue: maybeState, newValue: newState }
        : { kind: 'add', key, value: newState }]
}

async function doAction(db: FirebaseFirestore.Firestore, body: unknown): Promise<void> {
    const action = validateModel('AnyAction')(body)

    await db.runTransaction(async (tx: Transaction): Promise<void> => {
        const p = new Processor(db, tx)

        const state1_0Diffs = await reactTo(p, action, INPUT_OP)

        const outputDiffs: [string, string[], Diff<DocumentData>[]][] = [
            [INPUT_ID, getSchema(INPUT_OP), state1_0Diffs]]
        const output = getCollections()

        for (const collectionId in output) {
            const op = output[collectionId]
            outputDiffs.push([collectionId, getSchema(op), await p.reactTo(op, state1_0Diffs)])
        }

        for (const [collectionId, schema, diffs] of outputDiffs) {
            new DBHelper(db, tx, collectionId, schema).applyDiffs(diffs)
        }
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
