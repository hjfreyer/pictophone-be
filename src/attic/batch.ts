import { DocumentData, Firestore, FieldPath, Query } from '@google-cloud/firestore'
import { diff } from 'deep-diff'
import { Request, Router } from 'express'
import { getDPLInfos, getDerived, openAll, openAll2, Persisted } from './collections'
import { Database, Database2 } from './framework/db'
import { getSchema, Op, Processor } from './framework/graph'
import { enumerate, isKeyExpected, diffToChange, newReadableTapes, Change } from './flow/base'
import { getDiffs } from './flow/comparison'
import { from, of, first, toArray } from "ix/asynciterable";
import * as read from './flow/read'
import { BINDINGS, integrateGame } from '.'
import { SavedAction, TaggedGame1_0 } from './model'

type BackwardsCheckCursor = {}

// export async function check(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
//     await db.runTransaction(async (tx) => {
//         const database = new Database(db, tx, new Set());
//         const bindings = BINDINGS;

//         const spaces = openAll(database, getDPLInfos());
//         const derived = getDerived();

//         for (const untypedPersistedId in bindings) {
//             const persistedId = untypedPersistedId as keyof typeof bindings;

//             console.log('checking:', persistedId);
//             for (const binding of bindings[persistedId]) {
//                 if (binding.kind !== 'derivation') {
//                     continue;
//                 }
//                 console.log('produced by:', binding.collection);

//                 const scram = enumerate(derived[binding.collection] as any, spaces);

//                 for await (const diff of getDiffs(scram, spaces[persistedId] as any)) {
//                     throw new Error(JSON.stringify(diff))
//                 }
//             }
//         }
//     });
//     console.log("done")
//     return {}
// }

type ReplayRequest = {
    collectionId: string
}

export async function replay(db: Firestore, req: ReplayRequest): Promise<{}> {
    console.log("replaying:", req.collectionId)

    let cursor = '';
    while (
        await db.runTransaction(async (tx): Promise<boolean> => {
            const infos
            const info = getDPLInfos()[req.collectionId as keyof Persisted];
            const collectionGroup = `${info.schema[info.schema.length - 1]}-${info.collectionId}`
            let q: Query = db.collection('actions')
                .orderBy(FieldPath.documentId());
            if (0 < cursor.length) {
                q = q.startAfter(cursor)
            }
            q = q.limit(1)
            const actions = await tx.get(q);
            if (actions.empty) {
                console.log('done');
                return false;
            }
            const actionId = actions.docs[0].id;
            cursor = actionId;
            console.log("cursor:", cursor)
            const action = actions.docs[0].data() as SavedAction;

            const database = new Database2(db, tx);

            const data = openAll2(database, getDPLInfos());
            const tapes = newReadableTapes(data)

            const diffs = await integrateGame(action.action, tapes);
            for (const [key, value] of tapes.games1_0_1.items) {
                if (action.parents.indexOf(value.actionId) === -1) {
                    throw new Error("illegal ref");
                }
            }

            const changes = diffs
                .map(diffToChange)
                .map((change): Change<TaggedGame1_0> => {
                    switch (change.kind) {
                        case 'set':
                            return {
                                ...change,
                                value: {
                                    ...change.value,
                                    actionId,
                                }
                            }
                        case 'delete':
                            return change
                    }
                })

            console.log(changes)
            data.games1_0_1.commit(...changes);

            return true;
        })) { }


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

    // res.post('/check', function(_req: Request<{}>, res, next) {
    //     const cursor = _req.body as BackwardsCheckCursor
    //     check(db, cursor).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    res.post('/replay/:collectionId', function(req: Request<ReplayRequest>, res, next) {
        replay(db, req.params).then(result => {
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
