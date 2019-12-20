import { strict as assert } from 'assert'
import { AnyAction, AnyExport, AnyState, DowngradeableVersion, FIRST_VERSION, LAST_VERSION, NextVersion, Types, UpgradeableVersion, Version, VERSIONS } from '../model'
import * as v0 from './0'
import * as v1_1_0 from './v1.1.0'
import * as v1_2_0 from './v1.2.0'

const MODULES = {
    '0': v0,
    'v1.1.0': v1_1_0,
    'v1.2.0': v1_2_0,
}

function upgradeActionOnce(action: Types[UpgradeableVersion]['Action']): AnyAction {
    switch (action.version) {
        case '0':
            return MODULES[NextVersion[action.version]].upgradeAction(action)
        case 'v1.1.0':
            return MODULES[NextVersion[action.version]].upgradeAction(action)
    }
}

export function upgradeAction(action: AnyAction, version: Version): AnyAction {
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

function upgradeStateOnce(gameId: string, state: Types[UpgradeableVersion]['State']): AnyState {
    switch (state.version) {
        case '0':
            return MODULES[NextVersion[state.version]].upgradeState(gameId, state)
        case 'v1.1.0':
            return MODULES[NextVersion[state.version]].upgradeState(gameId, state)
    }
}

export function upgradeState(gameId: string, state: AnyState, version: Version): AnyState {
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

function downgradeStateOnce(state: Types[DowngradeableVersion]['State']): AnyState {
    switch (state.version) {
        case 'v1.1.0':
            return MODULES[state.version].downgradeState(state)
        case 'v1.2.0':
            return MODULES[state.version].downgradeState(state)
    }
}

export function downgradeState(state: AnyState, version: AnyState['version']): AnyState {
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

export function migrateState(gameId: string, state: AnyState, version: AnyState['version']): AnyState {
    return upgradeState(gameId, downgradeState(state, version), version)
}

export function initState(version: AnyState['version'], gameId: string): AnyState {
    switch (version) {
        case '0':
            return MODULES[version].initState()
        default:
            return MODULES[version].initState(gameId)
    }
}

export function integrate(state: AnyState, action: AnyAction): AnyState {
    // TODO: Static checks to ensure state and action are the same version, 
    // and type assertions on the output to match.
    switch (state.version) {
        case '0':
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

export function getExportPath(e: AnyExport): string {
    switch (e.kind) {
        case 'player_game':
            return `versions/${e.version}/players/${e.playerId}/games/${e.gameId}`
    }
}

export function exportState(gameId: string, state: AnyState): AnyExport[] {
    switch (state.version) {
        case '0': return MODULES[state.version].exportState(gameId, state)
        case 'v1.1.0': return MODULES[state.version].exportState(state)
        case 'v1.2.0': return MODULES[state.version].exportState(state)
    }
}
