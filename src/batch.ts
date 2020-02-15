import { DocumentData, Firestore, Transaction } from '@google-cloud/firestore'
import { diff } from 'deep-diff'
import { Request, Router } from 'express'
//import { derivedCollections, makeSavedCollections } from './collections'
import { documentReferenceToPath, pathToCollectionReference, pathToDocumentReference, DBCollection, DBHelper } from './framework/db'
import { inputCollections, pipeline, OutputCollectons, COLLECTION_GRAPH } from './collections'
import { Enumerable } from './framework/incremental'
import { Processor, Op, getSchema } from './framework/graph'
import _ from 'lodash'
//import { Collection } from './framework/incremental'
// import { Dictionary } from 'express-serve-static-core'
// import admin from 'firebase-admin'
// import { applyExportDiff, checkExport, upgradeExportMap } from './exports'
// import { exportState, migrateState, upgradeState } from './logic'
// import { AnyExport, Version, VERSIONS } from './model'
// import { StateEntry, validate } from './types.validator'

// const UPDATES = [
//     'UNKNOWN 1',
//     'UNKNOWN 2',
//     'UNKNOWN 3',
//     'UNKNOWN 4',
//     'UNKNOWN 5',
//     '2019-12-17: Upgrade all states to v1.1.0',
//     '2019-12-17: CHECK',
//     '2019-12-19: Upgrade all states to v1.2.0',
//     '2019-12-17: CHECK',
//     '2019-12-19: ACTUALLY upgrade all states to v1.2.0',
//     '2019-12-19: CHECK',
//     '2019-12-19: Turn off old exports',
//     '2019-12-19: Turn old exports back on',
//     '2019-12-19: Turn back off again',
//     '2019-12-19: Finally, back on',
//     '2019-12-19: CHECK',
//     '2019-12-19: CHECK',
// ]

// const GENERATION = UPDATES.length

// async function backfillDoc(
//     db: Firestore, tx: Transaction,
//     doc: DocumentReference): Promise<void> {
//     const stateEntryDoc = await tx.get(doc)
//     if (!stateEntryDoc.exists) {
//         return  // Race. Got deleted.
//     }
//     const stateEntry = validate('StateEntry')(stateEntryDoc.data())

//     const prevExportMap = stateEntry.exports
//     const nextExportMap = upgradeExportMap(prevExportMap)

//     for (const version in nextExportMap) {
//         if (nextExportMap[version] === 'DIRTY') {
//             throw new Error(`dirty version: ${version} in doc ${doc.path}`)
//         }
//     }

//     // Hack.
//     const gameId = doc.id.replace('game:', '')

//     const prevExports: AnyExport[] = []
//     for (const version in prevExportMap) {
//         if (prevExportMap[version] === 'EXPORTED') {
//             const m = migrateState(gameId, stateEntry.state, version as Version)
//             prevExports.push(...exportState(gameId, m))
//         }
//     }

//     const nextExports: AnyExport[] = []
//     for (const version in nextExportMap) {
//         if (nextExportMap[version] === 'EXPORTED') {
//             const m = migrateState(gameId, stateEntry.state, version as Version)
//             nextExports.push(...exportState(gameId, m))
//         }
//     }

//     applyExportDiff(db, tx, prevExports, nextExports)
//     tx.set(doc, { generation: GENERATION, exports: nextExportMap },
//         { mergeFields: ['generation', 'exports'] })
// }

// export type BackfillStatus = {
//     state: 'FINISHED' | 'NOT_FINISHED' | 'DIRTY'
// }

// export async function backfillExports(db: Firestore): Promise<BackfillStatus> {
//     const todo = await db.collection('state')
//         .where('generation', '<', GENERATION)
//         .select()
//         .limit(10)
//         .get()

//     if (todo.empty) {
//         return { state: 'FINISHED' }
//     }

//     for (const doc of todo.docs) {
//         console.log('backfilling', doc.ref.path)
//         await db.runTransaction(async tx => await backfillDoc(db, tx, doc.ref))
//     }
//     return { state: 'NOT_FINISHED' }
// }

// async function checkExportsForDoc(db: Firestore, tx: Transaction, doc: DocumentReference): Promise<void> {
//     const stateEntryDoc = await tx.get(doc)
//     if (!stateEntryDoc.exists) {
//         return  // Race. Got deleted.
//     }
//     const stateEntry = validate('StateEntry')(stateEntryDoc.data())

//     // Hack.
//     const gameId = doc.id.replace('game:', '')

//     for (const version of VERSIONS) {
//         if (stateEntry.exports[version] === 'EXPORTED') {
//             console.log('..', version)
//             const migrated = migrateState(gameId, stateEntry.state, version)
//             for (const exp of exportState(gameId, migrated)) {
//                 await checkExport(db, tx, exp)
//             }
//         }
//     }
//     tx.set(doc, { generation: GENERATION }, { mergeFields: ['generation'] })
// }

// export type CheckExportsResult = {
//     state: 'FINISHED' | 'NOT_FINISHED'
// }

// export async function checkExports(db: Firestore): Promise<CheckExportsResult> {
//     const uncheckedRefs = await db.collection('state')
//         .where('generation', '<', GENERATION)
//         .select()
//         .limit(10)
//         .get()
//     if (uncheckedRefs.empty) {
//         return { state: 'FINISHED' }
//     }

//     for (const doc of uncheckedRefs.docs) {
//         console.log('checking', doc.ref.path)
//         await db.runTransaction(tx => checkExportsForDoc(db, tx, doc.ref))
//     }
//     return { state: 'NOT_FINISHED' }
// }

// async function upgradeDoc(db: Firestore, tx: Transaction, ref: DocumentReference): Promise<void> {
//     const doc = await tx.get(ref)
//     if (!doc.exists) {
//         return  // Race. Got deleted.
//     }
//     const stateEntry = validate('StateEntry')(doc.data())
//     if (GENERATION <= stateEntry.generation) {
//         return // Race.
//     }

//     // Hack.
//     const gameId = doc.id.replace('game:', '')

//     const newState = upgradeState(gameId, stateEntry.state, 'v1.2.0')
//     const newStateEntry: StateEntry = {
//         generation: GENERATION,
//         iteration: stateEntry.iteration,
//         exports: stateEntry.exports,
//         lastModified: admin.firestore.FieldValue.serverTimestamp(),
//         state: newState,
//     }
//     tx.set(ref, newStateEntry)
// }

// async function upgrade(db: Firestore): Promise<any> {
//     const refs = await db.collection('state')
//         .where('generation', '<', GENERATION)
//         .select()
//         .limit(10)
//         .get()

//     if (refs.empty) {
//         return { state: 'FINISHED' }
//     }

//     for (const doc of refs.docs) {
//         console.log('upgrading', doc.ref.path)
//         await db.runTransaction(async tx => await upgradeDoc(db, tx, doc.ref))
//         await db.runTransaction(async tx => { await checkExportsForDoc(db, tx, doc.ref) })
//     }
//     return { state: 'NOT_FINISHED' }
// }

// async function upgradeOne(db: Firestore, stateId: string): Promise<any> {
//     const ref = db.collection('state').doc(stateId)
//     console.log('upgrading', ref.path)
//     await db.runTransaction(async tx => { await upgradeDoc(db, tx, ref) })
//     await db.runTransaction(async tx => { await checkExportsForDoc(db, tx, ref) })
// }

async function* listKeysHelper(
    db: Firestore, tx: Transaction,
    baseSchema: string[],
    basePath: string[],
    schemaLeft: string[]): AsyncIterable<string[]> {
    if (schemaLeft.length === 0) {
        yield basePath
        return
    }

    const nextBaseSchema = [...baseSchema, schemaLeft[0]]
    const nextSchemaLeft = schemaLeft.slice(1)

    const subDocs = await tx.get(pathToCollectionReference(db, nextBaseSchema, basePath))
    for (const doc of subDocs.docs) {
        yield* listKeysHelper(db, tx, nextBaseSchema, [...basePath, doc.id], nextSchemaLeft)
    }
}

async function* listKeys(db: Firestore, tx: Transaction, schema: string[]): AsyncIterable<string[]> {
    yield* listKeysHelper(db, tx, [], [], schema)
}

async function* listKeys2(db: Firestore, tx: Transaction, schema: string[]): AsyncIterable<string[]> {
    const subDocs = await tx.get(db.collectionGroup(schema[schema.length - 1]))
    for (const doc of subDocs.docs) {
        yield documentReferenceToPath(schema, doc.ref)
    }
}


type BackwardsCheckCursor = {}

export async function check(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const p = new Processor(db, tx)
        const output = COLLECTION_GRAPH

        for (const collectionIdStr in output) {
            const collectionId = collectionIdStr as keyof typeof COLLECTION_GRAPH
            console.log('checking:', collectionId)

            const expected = output[collectionId]
            const actual: Op<unknown, unknown> = {
                kind: 'input',
                schema: getSchema(output[collectionId]),
                collectionId,
                validator: (x) => x,
            }// new DBCollection(db, tx, expected.schema, (x) => x)

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
            throw new Error(`for key ${key}, expected ${JSON.stringify(expectedValue)}; got ${JSON.stringify(actualValue)}.
Diff: ${JSON.stringify(d)}`)
        }
    }
}

export async function backfill(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const p = new Processor(db, tx)
        const output = COLLECTION_GRAPH

        const changes: [string, string[], string[], unknown][] = []
        for (const collectionIdStr in output) {
            const collectionId = collectionIdStr as keyof typeof COLLECTION_GRAPH
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

    // res.post('/backfill', function(req: Request<{}>, res, next) {
    //     backfillExports(db).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    // res.post('/upgrade', function(req: Request<Dictionary<string>>, res, next) {
    //     upgrade(db).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    // res.post('/upgrade-one/:state', function(req: Request<{ state: string }>, res, next) {
    //     upgradeOne(db, req.params.state).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    return res
}

export default batch