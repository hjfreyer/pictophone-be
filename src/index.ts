import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import batch from './batch'
import { COLLECTION_GRAPH, getCollections, InputType, INPUT_ID, INPUT_OP } from './collections'
import GetConfig from './config'
import { DBHelper, DBHelper2 } from './framework/db'
import { Diff, getSchema, Op, Processor } from './framework/graph'
import { Action1_1, AnyAction } from './model'
import { validate as validateModel } from './model/index.validator'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import rev0 from './rev0'
import { Sources as R0Sources } from './rev0'
import { Source, Readables, DBs } from './framework/revision'
import { mapValues } from './util'

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

// export type ActionType = Action1_1

// function upgradeAction(a: AnyAction): ActionType {
//     switch (a.version) {
//         case "1.0":
//             return {
//                 version: '1.1',
//                 kind: 'join_game',
//                 gameId: a.gameId,
//                 playerId: a.playerId,
//                 createIfNecessary: true,
//             }
//     }
// }

// export function integrate(
//     game: InputType | null,
//     shortCodeInUse: {} | null,
//     a: ActionType): InputType | null {
//     switch (a.kind) {
//         case 'create_game':
//             if (game !== null) {
//                 // Don't create already created game.
//                 return game
//             }
//             if (shortCodeInUse !== null) {
//                 return null
//             }
//             return {
//                 players: [],
//                 shortCode: a.shortCode,
//             }
//         case 'join_game':
//             if (game === null) {
//                 if (a.createIfNecessary) {
//                     return {
//                         players: [a.playerId],
//                         shortCode: ''
//                     }
//                 } else {
//                     return null
//                 }
//             }

//             if (game.players.indexOf(a.playerId) !== -1) {
//                 return game
//             }
//             return {
//                 ...game,
//                 players: [...game.players, a.playerId],
//             }
//     }
// }

// async function reactTo(
//     p: Processor,
//     action: ActionType,
//     input: Op<InputType, InputType>,
//     shortCodes: Op<InputType, {}>): Promise<Diff<InputType>[]> {
//     const gameKey = [action.gameId]
//     const maybeGame = await p.get(input, gameKey)
//     let maybeShortCodeInUse: {} | null = null

//     if (action.kind === 'create_game') {
//         maybeShortCodeInUse = await p.get(shortCodes, [action.shortCode])
//     }
//     const newGame = integrate(maybeGame, maybeShortCodeInUse, action)

//     if (maybeGame === null) {
//         return newGame === null
//             ? []
//             : [{ kind: 'add', key: gameKey, value: newGame }]
//     } else {
//         return newGame === null
//             ? [{ kind: 'delete', key: gameKey, value: maybeGame }]
//             : [{ kind: 'replace', key: gameKey, oldValue: maybeGame, newValue: newGame }]
//     }
// }



async function doAction(db: FirebaseFirestore.Firestore, body: unknown): Promise<void> {
    const anyAction = validateModel('Action1_0')(body)
    // const action = upgradeAction(anyAction)

    await db.runTransaction(async (tx: Transaction): Promise<void> => {
        const p = new Processor(db, tx)
        const helper2 = new DBHelper2(db, tx);

        const inputConfig: Source<R0Sources> = {
            game: {
                collectionId: 'state-2.0',
                schema: ['game'],
                validator: validateModel('Game1_0')
            }
        };

        const dbs = mapValues(inputConfig, (_, i) => helper2.open(i)) as DBs<R0Sources>;

        const sourceDiffs = await rev0.integrate(anyAction, dbs);

        // const outputDiffs: [string, string[], Diff<DocumentData>[]][] = [
        //     [INPUT_ID, getSchema(INPUT_OP), state1_0Diffs]]
        // const output = getCollections()

        // for (const collectionId in output) {
        //     const op = output[collectionId]
        //     outputDiffs.push([collectionId, getSchema(op), await p.reactTo(op, state1_0Diffs)])
        // }

        for (const untypedCollectionId in sourceDiffs) {
            const collectionId = untypedCollectionId as keyof typeof sourceDiffs;
            dbs[collectionId].commit(sourceDiffs[collectionId]);
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
