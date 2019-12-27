import { DocumentReference, Firestore, Transaction } from '@google-cloud/firestore'
import { Request, Router } from 'express'
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

function batch(db: Firestore): Router {
    const res = Router()

    // res.post('/check', function(req: Request<Dictionary<string>>, res, next) {
    //     checkExports(db).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

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