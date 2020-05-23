import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import GetConfig from './config'
import { Action1_1, AnyAction, Action1_0, Game1_0, TaggedGame1_0, TaggedGame1_1, SavedAction } from './model'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import { mapValues } from './util'
import deepEqual from 'deep-equal'
import timestamp from 'timestamp-nano';

import { interval, from, of, toArray, first, single, concat } from "ix/asynciterable"
import { map, filter, flatMap, tap, take, skip, skipWhile } from "ix/asynciterable/operators"
import { sha256 } from 'js-sha256';
import _ from 'lodash';
import * as ix from "ix/iterable"


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
    // doAction(db, req.body).then((resp) => {
    //     res.status(200)
    //     res.json(resp)
    // }).catch(next)
})

app.options('/upload', cors())
app.post('/upload', cors(), function(req: Request<Dictionary<string>>, res, next) {
    doUpload(req.body).then(resp => {
        res.status(200)
        res.json(resp)
    }).catch(next)
})

