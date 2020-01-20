import { DocumentReference, Firestore, Transaction, DocumentData } from '@google-cloud/firestore'
import { Request, Router } from 'express'
import { Collection, documentReferenceToPath, pathToCollectionReference, pathToDocumentReference } from './framework/incremental'
import { derivedCollections, makeSavedCollections } from './collections'
import { diff } from 'deep-diff'
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

export async function backwardsCheck(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const saved = makeSavedCollections(db, tx)
        const derived = derivedCollections(saved)

        for (const collectionId in derived) {
            if (!(collectionId in saved)) {
                console.log('cant backwards check:', collectionId)
                continue
            }

            console.log('backwards checking:', collectionId)
            const expected = (derived as any)[collectionId] as Collection<unknown>
            const actual = (saved as any)[collectionId] as Collection<unknown>

            await backwardsCheckCollections(expected, actual, cursor)
        }
    })

    return {}
}

export async function backwardsCheckCollections(
    expected: Collection<unknown>, actual: Collection<unknown>, cursor: BackwardsCheckCursor): Promise<void> {
    for await (const [key,] of actual.unsortedList()) {
        const res = await expected.get(key)
        if (res === null) {
            throw new Error(`unexpected key: ${key}`)
        }
    }
}

export async function forwardsCheck(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const saved = makeSavedCollections(db, tx)
        const derived = derivedCollections(saved)

        for (const collectionId in derived) {
            console.log('forwards checking:', collectionId)
            const expected = (derived as any)[collectionId] as Collection<unknown>
            const actual = (saved as any)[collectionId] as Collection<unknown>

            await forwardsCheckCollections(expected, actual, cursor)
        }
    })

    return {}
}

export async function forwardsCheckCollections(
    expected: Collection<unknown>, actual: Collection<unknown>, cursor: BackwardsCheckCursor): Promise<void> {
    for await (const [key, expectedValue] of expected.unsortedList()) {
        const actualValue = await actual.get(key)
        const d = diff(expectedValue, actualValue)

        if (d) {
            throw new Error(`for key ${key}, expected ${JSON.stringify(expectedValue)}; got ${JSON.stringify(actualValue)}.
Diff: ${JSON.stringify(d)}`)
        }
    }
}

export async function backfill(db: Firestore, cursor: BackwardsCheckCursor): Promise<BackwardsCheckCursor> {
    await db.runTransaction(async (tx) => {
        const saved = makeSavedCollections(db, tx)
        const derived = derivedCollections(saved)

        const changes: [string[], string[], unknown][] = []
        for (const collectionId in derived) {
            console.log('backfilling:', collectionId)
            const expected = (derived as any)[collectionId] as Collection<unknown>
            const actual = (saved as any)[collectionId] as Collection<unknown>

            for await (const change of backfillCollection(expected, actual, cursor)) {
                changes.push(change)
            }
        }

        for (const [schema, path, value] of changes) {
            tx.set(pathToDocumentReference(db, schema, path), value as DocumentData)
        }
    })

    return {}
}

export async function* backfillCollection(
    expected: Collection<unknown>, actual: Collection<unknown>,
    cursor: BackwardsCheckCursor): AsyncIterable<[string[], string[], unknown]> {
    for await (const [path, expectedValue] of expected.unsortedList()) {
        const actualValue = await actual.get(path)

        if (actualValue === null) {
            yield [expected.schema, path, expectedValue]
        }
    }
}

function batch(db: Firestore): Router {
    const res = Router()

    res.post('/backwards-check', function(_req: Request<{}>, res, next) {
        const cursor = _req.body as BackwardsCheckCursor
        backwardsCheck(db, cursor).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    res.post('/forwards-check', function(_req: Request<{}>, res, next) {
        const cursor = _req.body as BackwardsCheckCursor
        forwardsCheck(db, cursor).then(result => {
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