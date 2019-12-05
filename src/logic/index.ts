import { strict as assert } from 'assert'
import Action from '../model/Action'
import Export from '../model/Export'
import State from '../model/State'
import * as v0 from './0'
import * as v1_1_0 from './v1.1.0'
import * as v1_2_0 from './v1.2.0'

export const STATE_VERSIONS: State['version'][] = [0, 'v1.1.0', 'v1.2.0']

const MODULES = {
    0: v0,
    'v1.1.0': v1_1_0,
    'v1.2.0': v1_2_0,
}

export function upgradeAction(action: Action, version: Action['version']): Action {
    while (true) {
        const srcIdx = STATE_VERSIONS.indexOf(action.version)
        const dstIdx = STATE_VERSIONS.indexOf(version)
        assert.notEqual(srcIdx, -1)
        assert.notEqual(dstIdx, -1)
        if (dstIdx <= srcIdx) {
            return action
        }
        switch (action.version) {
            case 0:
                action = MODULES['v1.1.0'].upgradeAction(action)
                break
            case 'v1.1.0':
                action = MODULES['v1.2.0'].upgradeAction(action)
                break
            case 'v1.2.0':
                throw new Error('whaa')
        }
    }
}

export function upgradeState(gameId: string, state: State, version: State['version']): State {
    while (true) {
        const srcIdx = STATE_VERSIONS.indexOf(state.version)
        const dstIdx = STATE_VERSIONS.indexOf(version)
        assert.notEqual(srcIdx, -1)
        assert.notEqual(dstIdx, -1)
        if (dstIdx <= srcIdx) {
            return state
        }
        switch (state.version) {
            case 0:
                state = MODULES['v1.1.0'].upgradeState(gameId, state)
                break
            case 'v1.1.0':
                state = MODULES['v1.2.0'].upgradeState(gameId, state)
                break
            case 'v1.2.0':
                throw new Error('whaa')
        }
    }
}

export function downgradeState(state: State, version: State['version']): State {
    while (true) {
        const srcIdx = STATE_VERSIONS.indexOf(state.version)
        const dstIdx = STATE_VERSIONS.indexOf(version)
        assert.notEqual(srcIdx, -1)
        assert.notEqual(dstIdx, -1)
        if (srcIdx <= dstIdx) {
            return state
        }
        switch (state.version) {
            case 0:
                throw new Error('whaa')
            case 'v1.1.0':
                state = MODULES[state.version].downgradeState(state)
                break
            case 'v1.2.0':
                state = MODULES[state.version].downgradeState(state)
                break
        }
    }
}

export function migrateState(gameId: string, state: State, version: State['version']): State {
    return upgradeState(gameId, downgradeState(state, version), version)
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
        case 'v1.2.0':
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
        case 'v1.1.0': return MODULES[state.version].exportState(state)
        case 'v1.2.0': return MODULES[state.version].exportState(state)
    }
}
