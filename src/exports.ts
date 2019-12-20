import { Firestore, Transaction } from '@google-cloud/firestore'
import { getExportPath } from './logic'
import {AnyExport, ExportStateMap} from './model'
import {strict as assert} from 'assert'
import { EXPORT_STATE } from './model'

export function applyExportDiff(db: Firestore, tx: Transaction,
    prev: AnyExport[], next: AnyExport[]): void {
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

export async function checkExport(db: Firestore, tx: Transaction, exp: AnyExport): Promise<void> {
    const expDoc = await tx.get(db.doc(getExportPath(exp)))
    if (!expDoc.exists) {
        throw new Error('doc should exist')
    }

    assert.deepEqual(expDoc.data(), exp)
}

export function upgradeExportMap(esm: ExportStateMap): ExportStateMap {
    const res = { ...EXPORT_STATE }

    for (const version in esm) {
        if ((esm[version] === 'EXPORTED' && !(version in res))
            || esm[version] === 'DIRTY') {
            res[version] = 'DIRTY'
        }
    }

    return res
}
