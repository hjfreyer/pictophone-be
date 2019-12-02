import { DocumentReference, FieldPath, Firestore, Transaction } from '@google-cloud/firestore'
import produce from 'immer'
import { GENERATION } from './base'
import { applyExportDiff, getExporter } from './exports'
import { Version as ExportVersion, VERSIONS as EXPORT_VERSIONS } from './model/Export'
import { StateEntry, validate } from './types.validator'

function updateGenerationForState(state: StateEntry): void {
    state.generation = GENERATION
    for (const version of EXPORT_VERSIONS) {
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
    doc: DocumentReference, version: ExportVersion): Promise<void> {
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

    const newExports = getExporter(version)(gameId, stateEntry.state)
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

async function backfillExportsForVersion(db: Firestore, version: ExportVersion): Promise<BackfillStatus> {
    const dirtyRefs = await db.collection('state')
        .where(new FieldPath('exports', version), '==', 'DIRTY')
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
        .where(new FieldPath('exports', version), '==', 'NOT_EXPORTED')
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
    for (const version of EXPORT_VERSIONS) {
        res[version] = await backfillExportsForVersion(db, version)
    }
    return res
}