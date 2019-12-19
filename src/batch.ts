import { DocumentReference, FieldPath, Firestore, Transaction } from '@google-cloud/firestore'
import { Request, Router } from 'express'
import { Dictionary } from 'express-serve-static-core'
import admin from 'firebase-admin'
import produce from 'immer'
import { applyExportDiff, checkExport } from './exports'
import { exportState, migrateState, upgradeState } from './logic'
import { VERSIONS } from './model'
import State from './model/AnyState'
import { StateEntry, validate } from './types.validator'

const UPDATES = [
    'UNKNOWN 1',
    'UNKNOWN 2',
    'UNKNOWN 3',
    'UNKNOWN 4',
    'UNKNOWN 5',
    '2019-12-17: Upgrade all states to v1.1.0',
    '2019-12-17: CHECK',
    '2019-12-19: Upgrade all states to v1.2.0',
    '2019-12-17: CHECK',
]

const GENERATION = UPDATES.length

function updateGenerationForState(state: StateEntry): void {
    state.generation = GENERATION
    for (const version of VERSIONS) {
        if (!(version in state.exports)) {
            state.exports[version] = 'NOT_EXPORTED'
        }
    }
}

async function updateGenerationTx(tx: Transaction, doc: DocumentReference): Promise<void> {
    const stateDoc = await tx.get(doc)
    if (!stateDoc.exists) {
        return  // Race. Got deleted.
    }
    const state = validate('StateEntry')(stateDoc.data())
    if (GENERATION <= state.generation) {
        return  // Race. Already got updated.
    }
    tx.set(doc, produce(state, updateGenerationForState))
}

export async function updateGeneration(db: Firestore): Promise<boolean> {
    const oldRefs = await db.collection('state')
        .where('generation', '<', GENERATION)
        .select()
        .limit(10)
        .get()
    if (oldRefs.empty) {
        return true
    }
    // TODO: This can be parallelized.
    for (const doc of oldRefs.docs) {
        console.log('Updating generation:', doc.ref.path)
        await db.runTransaction(tx => updateGenerationTx(tx, doc.ref))
    }
    return false
}

async function updateExportTx(
    db: Firestore, tx: Transaction,
    doc: DocumentReference, version: State['version']): Promise<void> {
    const stateEntryDoc = await tx.get(doc)
    if (!stateEntryDoc.exists) {
        return  // Race. Got deleted.
    }
    const stateEntry = validate('StateEntry')(stateEntryDoc.data())
    if (stateEntry.exports[version] !== 'NOT_EXPORTED') {
        return  // Race. Something else either exported or dirtied it.
    }
    const newStateEntry = produce(stateEntry, stateEntry => {
        stateEntry.exports[version] = 'EXPORTED'
    })
    tx.set(doc, newStateEntry)

    // Hack.
    const gameId = doc.id.replace('game:', '')

    const migrated = migrateState(gameId, stateEntry.state, version)

    const newExports = exportState(gameId, migrated)
    applyExportDiff(db, tx, [], newExports)
}

export type BackfillStatus = {
    state: 'FINISHED' | 'NOT_FINISHED'
} | {
    state: 'DIRTY'
    examples: string[]
}

export type BackfillStatusMap = {
    [version: string]: BackfillStatus
}

async function backfillExportsForVersion(db: Firestore, version: State['version']): Promise<BackfillStatus> {
    const dirtyRefs = await db.collection('state')
        .where(new FieldPath('exports', '' + version), '==', 'DIRTY')
        .select()
        .limit(10)
        .get()

    if (!dirtyRefs.empty) {
        return {
            state: 'DIRTY',
            examples: dirtyRefs.docs.map(doc => doc.ref.path)
        }
    }

    const unExportedRefs = await db.collection('state')
        .where(new FieldPath('exports', '' + version), '==', 'NOT_EXPORTED')
        .select()
        .limit(10)
        .get()
    if (unExportedRefs.empty) {
        return { state: 'FINISHED' }
    }

    // TODO: This can be parallelized.
    for (const doc of unExportedRefs.docs) {
        console.log('Updating export:', doc.ref.path, version)
        await db.runTransaction(tx => updateExportTx(db, tx, doc.ref, version))
    }

    return { state: 'NOT_FINISHED' }
}

export async function backfillExports(db: Firestore): Promise<BackfillStatusMap> {
    const res: BackfillStatusMap = {}
    for (const version of VERSIONS) {
        res[version] = await backfillExportsForVersion(db, version)
    }
    return res
}

async function checkExportsForDoc(db: Firestore, tx: Transaction, doc: DocumentReference): Promise<void> {
    const stateEntryDoc = await tx.get(doc)
    if (!stateEntryDoc.exists) {
        return  // Race. Got deleted.
    }
    const stateEntry = validate('StateEntry')(stateEntryDoc.data())

    // Hack.
    const gameId = doc.id.replace('game:', '')

    for (const version of VERSIONS) {
        if (version !== 'v1.1.0' && stateEntry.exports[version] === 'EXPORTED') {
            console.log('..', version)
            const migrated = migrateState(gameId, stateEntry.state, version)
            for (const exp of exportState(gameId, migrated)) {
                await checkExport(db, tx, exp)
            }
        }
    }
    tx.set(doc, { generation: GENERATION }, { mergeFields: ['generation'] })
}

export type CheckExportsResult = {
    state: 'FINISHED' | 'NOT_FINISHED'
}

export async function checkExports(db: Firestore): Promise<CheckExportsResult> {
    const uncheckedRefs = await db.collection('state')
        .where('generation', '<', GENERATION)
        .select()
        .limit(10)
        .get()
    if (uncheckedRefs.empty) {
        return { state: 'FINISHED' }
    }

    for (const doc of uncheckedRefs.docs) {
        console.log('checking', doc.ref.path)
        await db.runTransaction(tx => checkExportsForDoc(db, tx, doc.ref))
    }
    return { state: 'NOT_FINISHED' }
}

async function upgradeDoc(db: Firestore, tx: Transaction, ref: DocumentReference): Promise<void> {
    const doc = await tx.get(ref)
    if (!doc.exists) {
        return  // Race. Got deleted.
    }
    const stateEntry = validate('StateEntry')(doc.data())
    if (GENERATION <= stateEntry.generation) {
        return // Race.
    }

    // Hack.
    const gameId = doc.id.replace('game:', '')

    const newState = upgradeState(gameId, stateEntry.state, 'v1.1.0')
    const newStateEntry: StateEntry = {
        generation: GENERATION,
        iteration: stateEntry.iteration,
        exports: stateEntry.exports,
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
        state: newState,
    }
    tx.set(ref, newStateEntry)
}

async function upgrade(db: Firestore): Promise<any> {
    const refs = await db.collection('state')
        .where('generation', '<', GENERATION)
        .select()
        .limit(10)
        .get()

    if (refs.empty) {
        return { state: 'FINISHED' }
    }

    for (const doc of refs.docs) {
        console.log('upgrading', doc.ref.path)
        await db.runTransaction(async tx => await upgradeDoc(db, tx, doc.ref))
        await db.runTransaction(async tx => { await checkExportsForDoc(db, tx, doc.ref) })
    }
    return { state: 'NOT_FINISHED' }
}

async function upgradeOne(db: Firestore, stateId: string): Promise<any> {
    const ref = db.collection('state').doc(stateId)
    console.log('upgrading', ref.path)
    await db.runTransaction(async tx => { await upgradeDoc(db, tx, ref) })
    await db.runTransaction(async tx => { await checkExportsForDoc(db, tx, ref) })
}

function batch(db: Firestore): Router {
    const res = Router()

    res.post('/check', function(req: Request<Dictionary<string>>, res, next) {
        checkExports(db).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    res.post('/upgrade', function(req: Request<Dictionary<string>>, res, next) {
        upgrade(db).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    res.post('/upgrade-one/:state', function(req: Request<{ state: string }>, res, next) {
        upgradeOne(db, req.params.state).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    return res
}

export default batch