import { DocumentData, Firestore } from '@google-cloud/firestore'
import { diff } from 'deep-diff'
import { Request, Router } from 'express'
import { getCollections } from './collections'
import { DBHelper } from './framework/db'
import { getSchema, Op, Processor } from './framework/graph'

type BackwardsCheckCursor = {}

export async function check(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const p = new Processor(db, tx)
        const output = getCollections()

        for (const collectionId in output) {
            console.log('checking:', collectionId)

            const expected = output[collectionId]
            const actual: Op<unknown, unknown> = {
                kind: 'input',
                schema: getSchema(output[collectionId]),
                collectionId,
                validator: (x) => x,
            }

            await checkCollections(p, expected, actual)
        }
    })

    return {}
}

export async function checkCollections(
    p: Processor,
    expected: Op<unknown, unknown>, actual: Op<unknown, unknown>): Promise<void> {
    // Check backwards (all keys that do exist are expected).
    for await (const [key,] of p.list(actual, getSchema(actual).map(() => ''))) {
        const res = await p.get(expected, key)    
        if (res === null) {
            throw new Error(`unexpected key: ${key}`)
        }
    }

    // Check forwards (all expected keys exist and match).
    for await (const [key, expectedValue] of p.list(expected, getSchema(expected).map(() => ''))) {
        const actualValue = await p.get(actual, key)
        const d = diff(expectedValue, actualValue)

        if (d) {
            throw new Error(`for key "${key}": expected ${JSON.stringify(expectedValue)}; got ${JSON.stringify(actualValue)}.
Diff: ${JSON.stringify(d)}`)
        }
    }
}

export async function backfill(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const p = new Processor(db, tx)
        const output = getCollections()

        const changes: [string, string[], string[], unknown][] = []
        for (const collectionId in output) {
            console.log('backfilling:', collectionId)

            const expected = output[collectionId]
            const actual: Op<unknown, unknown> = {
                kind: 'input',
                schema: getSchema(output[collectionId]),
                collectionId,
                validator: (x) => x,
            }

            for await (const change of backfillCollection(p, collectionId, expected, actual)) {
                changes.push(change)
            }
        }

        for (const [collectionId, schema, path, value] of changes) {
            new DBHelper(db, tx, collectionId, schema).set(path, value as DocumentData)
        }
    })

    return {}
}

export async function* backfillCollection(
    p: Processor,
    collectionId: string,
    expected: Op<unknown, unknown>, actual: Op<unknown, unknown>): AsyncIterable<[string, string[], string[], unknown]> {
    for await (const [path, expectedValue] of p.enumerate(expected)) {
        const actualValue = await p.get(actual, path)

        if (actualValue === null) {
            yield [collectionId, getSchema(expected), path, expectedValue]
        }
    }
}

type DeleteRequest = {
    collectionId: string
}

async function deleteCollection(db: Firestore, req: DeleteRequest): Promise<{}> {
    console.log('deleting: ', req.collectionId)
    await db.runTransaction(async (tx) => {
        const list = await tx.get(db.collectionGroup(req.collectionId))
        for (const doc of list.docs) {
            console.log(doc.ref.path)
            //            tx.delete(doc.ref)
        }
    })
    return {}
}

function batch(db: Firestore): Router {
    const res = Router()

    res.post('/check', function(_req: Request<{}>, res, next) {
        const cursor = _req.body as BackwardsCheckCursor
        check(db, cursor).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    res.post('/backfill', function(_req: Request<{}>, res, next) {
        const cursor = _req.body as BackwardsCheckCursor
        backfill(db, cursor).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    res.post('/delete-collection/:collectionId', function(req: Request<DeleteRequest>, res, next) {
        deleteCollection(db, req.params).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    return res
}

export default batch