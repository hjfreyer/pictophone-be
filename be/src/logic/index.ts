import { strict as assert } from 'assert'
import Action from '../model/Action'
import Export from '../model/Export'
import State from '../model/State'
import * as v0 from './0'
import * as v1_1_0 from './v1.1.0'

export const STATE_VERSIONS: State['version'][] = [0, 'v1.1.0']

const MODULES = {
    0: v0,
    'v1.1.0': v1_1_0
}

export function upgradeAction(action: Action, version: Action['version']): Action {
    if (action.version === 0 && version === 'v1.1.0') {
        return v1_1_0.upgradeAction(action)
    }
    return action

}

export function migrateState(gameId: string, state: State, version: State['version']): State {
    if (state.version === version) {
        return state
    }
    if (state.version === 0) {
        assert.equal(version, 'v1.1.0')
        return v1_1_0.upgradeState(gameId, state)
    } else {
        assert.equal(version, 0)
        return v1_1_0.downgradeState(state)
    }
}

export function upgradeState(gameId: string, state: State, version: State['version']): State {
    const srcVersionIdx = STATE_VERSIONS.indexOf(state.version)
    const dstVersionIdx = STATE_VERSIONS.indexOf(version)
    return srcVersionIdx < dstVersionIdx ? migrateState(gameId, state, version) : state
}

export function initState(version: State['version'], gameId: string): State {
    switch (version) {
        case 0:
            return MODULES[version].initState()
        default:
            return MODULES[version].initState(gameId)
    }
}

export function integrate(state: State, action: Action): State {
    // TODO: Static checks to ensure state and action are the same version, 
    // and type assertions on the output to match.
    switch (state.version) {
        case 0:
            if (state.version !== action.version) {
                throw new Error('versions must agree')
            }
            return MODULES[state.version].integrate(state, action)
        case 'v1.1.0':
            if (state.version !== action.version) {
                throw new Error('versions must agree')
            }
            return MODULES[state.version].integrate(state, action)
    }
}

export function getExportPath(e: Export): string {
    switch (e.kind) {
        case 'player_game':
            return `versions/${e.version}/players/${e.playerId}/games/${e.gameId}`
    }
}

export function exportState(gameId: string, state: State): Export[] {
    switch (state.version) {
        case 0: return MODULES[state.version].exportState(gameId, state)
        default: return MODULES[state.version].exportState(state)
    }
}
