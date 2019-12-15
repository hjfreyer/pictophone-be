import { strict as assert } from 'assert'
import {
    DowngradeableVersion,
    FIRST_VERSION,
    LAST_VERSION,
    NextVersion,
    Types,
    UpgradeableVersion,
    Version,
    VERSIONS,
} from '../model'
import Action from '../model/AnyAction'
import Export from '../model/AnyExport'
import State from '../model/AnyState'
import * as v0 from './0'
import * as v1_1_0 from './v1.1.0'
import * as v1_2_0 from './v1.2.0'

const MODULES = {
    0: v0,
    'v1.1.0': v1_1_0,
    'v1.2.0': v1_2_0,
}

function upgradeActionOnce(action: Types[UpgradeableVersion]['Action']): Action {
    switch (action.version) {
        case 0:
            return MODULES[NextVersion[action.version]].upgradeAction(action)
        case 'v1.1.0':
            return MODULES[NextVersion[action.version]].upgradeAction(action)
    }
}

export function upgradeAction(action: Action, version: Version): Action {
    while (true) {
        const srcIdx = VERSIONS.indexOf(action.version)
        const dstIdx = VERSIONS.indexOf(version)
        assert.notEqual(srcIdx, -1)
        assert.notEqual(dstIdx, -1)
        if (action.version === LAST_VERSION || dstIdx <= srcIdx) {
            return action
        }
        action = upgradeActionOnce(action)
    }
}

function upgradeStateOnce(gameId: string, state: Types[UpgradeableVersion]['State']): State {
    switch (state.version) {
        case 0:
            return MODULES[NextVersion[state.version]].upgradeState(gameId, state)
        case 'v1.1.0':
            return MODULES[NextVersion[state.version]].upgradeState(gameId, state)
    }
}

export function upgradeState(gameId: string, state: State, version: Version): State {
    while (true) {
        const srcIdx = VERSIONS.indexOf(state.version)
        const dstIdx = VERSIONS.indexOf(version)
        assert.notEqual(srcIdx, -1)
        assert.notEqual(dstIdx, -1)
        if (state.version === LAST_VERSION || dstIdx <= srcIdx) {
            return state
        }
        state = upgradeStateOnce(gameId, state)
    }
}

function downgradeStateOnce(state: Types[DowngradeableVersion]['State']): State {
    switch (state.version) {
        case 'v1.1.0':
            return MODULES[state.version].downgradeState(state)
        case 'v1.2.0':
            return MODULES[state.version].downgradeState(state)
    }
}

export function downgradeState(state: State, version: State['version']): State {
    while (true) {
        const srcIdx = VERSIONS.indexOf(state.version)
        const dstIdx = VERSIONS.indexOf(version)
        assert.notEqual(srcIdx, -1)
        assert.notEqual(dstIdx, -1)
        if (state.version === FIRST_VERSION || srcIdx <= dstIdx) {
            return state
        }
        state = downgradeStateOnce(state)
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
