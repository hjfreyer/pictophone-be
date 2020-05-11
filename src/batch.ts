import { DocumentData, Firestore } from '@google-cloud/firestore'
import { diff } from 'deep-diff'
import { Request, Router } from 'express'
import { getStateReadables, getExportsReadables } from './collections'
import { } from './framework/db'
import { getSchema, Op, Processor } from './framework/graph'
import { getExports } from '.'
import { enumerate, isKeyExpected, diffToChange } from './flow/base'
import { getDiffs } from './flow/comparison'
import { from, of, first, toArray } from "ix/asynciterable";
import * as read from './flow/read'

type BackwardsCheckCursor = {}

export async function check(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const stateReadables = getStateReadables(db, tx);
        const exportzReadables = getExportsReadables(db, tx);
        const exportz = getExports();

        for (const untypedCollectionId in exportz) {
            const collectionId = untypedCollectionId as keyof typeof exportz;
            console.log('checking:', collectionId)
            const space = enumerate(exportz[collectionId], stateReadables, {});

            for await (const diff of getDiffs(space, exportzReadables[collectionId])) {
               throw new Error(JSON.stringify(diff))
            }
        }
    })
    console.log("done")
    return {}
}

export async function backfill(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const stateReadables = getStateReadables(db, tx);
        const exportzReadables = getExportsReadables(db, tx);
        const exportz = getExports();

        for (const untypedCollectionId in exportz) {
            const collectionId = untypedCollectionId as keyof typeof exportz;
            console.log('correcting:', collectionId)

            const space = enumerate(exportz[collectionId], stateReadables, {});

            const diffs = await toArray(getDiffs(space, exportzReadables[collectionId]));
            for (const diff of diffs) {
                console.log('applying:', JSON.stringify(diff))
                exportzReadables[collectionId].commit([diffToChange(diff)]);
            }
        }
    })

    return {}
}

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