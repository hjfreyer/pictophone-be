import { DocumentReference, Firestore, Transaction } from "@google-cloud/firestore"
import produce from "immer"
import { EXPORT_VERSIONS, GENERATION } from "./model/base"
import { StateEntry, validate } from "./types.validator"


function updateGenerationForState(state: StateEntry): void {
    state.generation = GENERATION
    for (const version of EXPORT_VERSIONS) {
        if (!(version in state.exports)) { }
        state.exports[version] = 'NOT_EXPORTED'
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