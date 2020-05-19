import { DocumentData, Firestore } from '@google-cloud/firestore'
import { diff } from 'deep-diff'
import { Request, Router } from 'express'
import { getDPLInfos, getDerived, openAll } from './collections'
import { Database } from './framework/db'
import { getSchema, Op, Processor } from './framework/graph'
import { enumerate, isKeyExpected, diffToChange } from './flow/base'
import { getDiffs } from './flow/comparison'
import { from, of, first, toArray } from "ix/asynciterable";
import * as read from './flow/read'
import { BINDINGS } from '.'

type BackwardsCheckCursor = {}

export async function check(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const database = new Database(db, tx);
        const bindings = BINDINGS;

        const spaces = openAll(database, getDPLInfos());
        const derived = getDerived();

        for (const untypedPersistedId in bindings) {
            const persistedId = untypedPersistedId as keyof typeof bindings;

            console.log('checking:', persistedId);
            for (const binding of bindings[persistedId]) {
                if (binding.kind !== 'derivation') {
                    continue;
                }
                console.log('produced by:', binding.collection);

                const scram = enumerate(derived[binding.collection] as any, spaces);

                for await (const diff of getDiffs(scram, spaces[persistedId] as any)) {
                    throw new Error(JSON.stringify(diff))
                }
            }
        }
    });
    console.log("done")
    return {}
}

// export async function backfill(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
//     await db.runTransaction(async (tx) => {
//                 const database = new Database(db, tx);
//         const bindings = BINDINGS;

//         const spaces = openAll(database, getDPLInfos());
//         const derived = getDerived();

//         for (const untypedPersistedId in bindings) {       
//             const persistedId = untypedPersistedId as keyof typeof bindings;

//             console.log('correcting:', persistedId)
//             for (const binding of bindings[persistedId]) {
//                 if (binding.kind !== 'derivation') {
//                     continue;
//                 }
//                 console.log('produced by:', binding.collection);

//                 const scram = enumerate(derived[binding.collection] as any, spaces);

//                 for (const diff of getDiffs(scram, spaces[persistedId] as any)) {
//                     console.log('applying:', JSON.stringify(diff))
//                     spaces[persistedId].enqueue(diff);
//                 }
//                 // We only want to take the first derivation binding. The rest are redundant.
//                 break;
//             }
//         }

//         database.commit();
//     })

//     return {}
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

    // res.post('/backfill', function(_req: Request<{}>, res, next) {
    //     const cursor = _req.body as BackwardsCheckCursor
    //     backfill(db, cursor).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    // res.post('/delete-collection/:collectionId', function(req: Request<DeleteRequest>, res, next) {
    //     deleteCollection(db, req.params).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    return res
}

export default batch
