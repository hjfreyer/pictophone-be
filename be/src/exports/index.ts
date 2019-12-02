import Export from '../model/Export'
import { Transaction, Firestore } from '@google-cloud/firestore'

function getExportPath(e: Export): string {
    switch (e.kind) {
        case 'player_game':
            return `versions/${e.version}/players/${e.playerId}/games/${e.gameId}`
    }
}

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