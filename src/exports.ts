import { Firestore, Transaction } from '@google-cloud/firestore'
import { getExportPath } from './logic'
import Export from './model/Export'
import {strict as assert} from 'assert'

export function applyExportDiff(db: Firestore, tx: Transaction,
    prev: Export[], next: Export[]): void {
    const nextPaths = new Set(next.map(getExportPath))

    for (const e of prev) {
        const path = getExportPath(e)
        if (!nextPaths.has(path)) {
            tx.delete(db.doc(path))
        }
    }
    for (const e of next) {
        tx.set(db.doc(getExportPath(e)), e)
    }
}

export async function checkExport(db: Firestore, tx: Transaction, exp: Export): Promise<void> {
    const expDoc = await tx.get(db.doc(getExportPath(exp)))
    if (!expDoc.exists) {
        throw new Error('doc should exist')
    }

    assert.deepEqual(expDoc.data(), exp)
}