import { Firestore, Transaction } from '@google-cloud/firestore'
import { getExportPath } from './logic'
import Export from './model/Export'

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
