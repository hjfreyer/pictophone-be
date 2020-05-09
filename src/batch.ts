import { DocumentData, Firestore } from '@google-cloud/firestore'
import { diff } from 'deep-diff'
import { Request, Router } from 'express'
import { getStateReadables, getExportsReadables } from './collections'
import { } from './framework/db'
import { getSchema, Op, Processor } from './framework/graph'
import { getExports } from '.'
import { enumerate, isKeyExpected } from './flow/base'
import { getDiffs, getOrphans } from './framework/comparison'

type BackwardsCheckCursor = {}

export async function check(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const stateReadables = getStateReadables(db, tx);
        const exportzReadables = getExportsReadables(db, tx);
        const exportz = getExports();

        for (const untypedCollectionId in exportz) {
            const collectionId = untypedCollectionId as keyof typeof exportz;
            console.log('checking:', collectionId)
            const list = enumerate(exportz[collectionId], stateReadables, {}, { kind: 'unbounded' });

            for await (const diff of getDiffs(list, exportzReadables[collectionId])) {
                throw new Error(JSON.stringify(diff))
            }
            for await (const orphan of getOrphans(
                k=> isKeyExpected(exportz[collectionId], stateReadables, {}, k), 
                exportzReadables[collectionId])) {
                throw new Error(JSON.stringify(orphan))
            }
        }
    })

    return {}
}

export async function backfill(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const stateReadables = getStateReadables(db, tx);
        const exportzReadables = getExportsReadables(db, tx);
        const exportz = getExports();

        for (const untypedCollectionId in exportz) {
            const collectionId = untypedCollectionId as keyof typeof exportz;
            console.log('populating:', collectionId)
            const list = enumerate(exportz[collectionId], stateReadables, {}, { kind: 'unbounded' });

            for await (const [key, value] of list) {
                exportzReadables[collectionId].commit([{
                    kind: 'set',
                    key,
                    value
                }])
            }
        }
    })

    return {}
}

export async function purgeOrphans(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const stateReadables = getStateReadables(db, tx);
        const exportzReadables = getExportsReadables(db, tx);
        const exportz = getExports();

        for (const untypedCollectionId in exportz) {
            const collectionId = untypedCollectionId as keyof typeof exportz;
            console.log('populating:', collectionId)
            const list = enumerate(exportz[collectionId], stateReadables, {}, { kind: 'unbounded' });

            for await (const [key, value] of list) {
                exportzReadables[collectionId].commit([{
                    kind: 'set',
                    key,
                    value
                }])
            }
        }
    })

    return {}
}

// export async function backfill(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
//     await db.runTransaction(async (tx) => {
//         const p = new Processor(db, tx)
//         const output = getCollections()

//         const changes: [string, string[], string[], unknown][] = []
//         for (const collectionId in output) {
//             console.log('backfilling:', collectionId)

//             const expected = output[collectionId]
//             const actual: Op<unknown, unknown> = {
//                 kind: 'input',
//                 schema: getSchema(output[collectionId]),
//                 collectionId,
//                 validator: (x) => x,
//             }

//             for await (const change of backfillCollection(p, collectionId, expected, actual)) {
//                 changes.push(change)
//             }
//         }

//         for (const [collectionId, schema, path, value] of changes) {
//             new DBHelper(db, tx, collectionId, schema).set(path, value as DocumentData)
//         }
//     })

//     return {}
// }

// export async function* backfillCollection(
//     p: Processor,
//     collectionId: string,
//     expected: Op<unknown, unknown>, actual: Op<unknown, unknown>): AsyncIterable<[string, string[], string[], unknown]> {
//     for await (const [path, expectedValue] of p.enumerate(expected)) {
//         const actualValue = await p.get(actual, path)

//         if (actualValue === null) {
//             yield [collectionId, getSchema(expected), path, expectedValue]
//         }
//     }
// }

// type DeleteRequest = {
//     collectionId: string
// }

// async function deleteCollection(db: Firestore, req: DeleteRequest): Promise<{}> {
//     console.log('deleting: ', req.collectionId)
//     await db.runTransaction(async (tx) => {
//         const list = await tx.get(db.collectionGroup(req.collectionId))
//         for (const doc of list.docs) {
//             console.log(doc.ref.path)
//             //            tx.delete(doc.ref)
//         }
//     })
//     return {}
// }

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

    // res.post('/delete-collection/:collectionId', function(req: Request<DeleteRequest>, res, next) {
    //     deleteCollection(db, req.params).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    return res
}

export default batch