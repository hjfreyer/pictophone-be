import Export from '../model/Export'
import { Transaction, Firestore } from '@google-cloud/firestore'
import State0 from '../model/State0'
import { ExportVersion } from '../model/base'
import exportState0to0 from './0-0'
import exportState0to1_0_0 from './0-v1.0.0'
import exportState0to1_1_0 from './0-v1.1.0'

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

function getExportPath(e: Export): string {
    switch (e.kind) {
        case 'player_game':
            return `versions/${e.version}/players/${e.playerId}/games/${e.gameId}`
    }
}

export interface Exporter {
    (gameId: string, state: State0): Export[]
}

export function getExporter(version: ExportVersion): Exporter {
    switch (version) {
        case '0': return exportState0to0
        case 'v1.0.0': return exportState0to1_0_0
        case 'v1.1.0': return exportState0to1_1_0
    }
}
