import { Firestore, Transaction, FieldPath } from '@google-cloud/firestore'
import { getPath } from './logic'
import {AnyExport, AnyDBRecord} from './model'
import {strict as assert} from 'assert'
import admin = require('firebase-admin')

export function applyDiff(db: Firestore, tx: Transaction,
    prev: AnyDBRecord[], next: AnyDBRecord[]): void {
    const nextPaths = new Set(next.map(getPath))

    for (const e of prev) {
        const path = getPath(e)
        if (!nextPaths.has(path)) {
            tx.delete(db.doc(path))
        }
    }
    for (const e of next) {
        tx.set(db.doc(getPath(e)), {
            ...e,
            lastModified: admin.firestore.FieldValue.serverTimestamp(),
        })
    }
}

export async function checkExport(db: Firestore, tx: Transaction, exp: AnyExport): Promise<void> {
    const expDoc = await tx.get(db.doc(getPath(exp)))
    if (!expDoc.exists) {
        throw new Error('doc should exist')
    }

    assert.deepEqual(expDoc.data(), exp)
}

// export function upgradeExportMap(esm: ExportStateMap): ExportStateMap {
//     const res = { ...EXPORT_STATE }

//     for (const version in esm) {
//         if ((esm[version] === 'EXPORTED' && !(version in res))
//             || esm[version] === 'DIRTY') {
//             res[version] = 'DIRTY'
//         }
//     }

//     return res
// }
