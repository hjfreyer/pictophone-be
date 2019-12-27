import { strict as assert } from 'assert'
import { AnyAction, AnyExport, AnyState, DowngradeableVersion, FIRST_VERSION, CURRENT_VERSION, NextVersion, Types, UpgradeableVersion, Version, VERSIONS, AnyRecord, CurrentAction, CurrentState } from '../model'
import * as v0 from './0'
import * as v1_1_0 from './v1.1.0'
import * as v1_2_0 from './v1.2.0'

const MODULES = {
    '0': v0,
    'v1.1.0': v1_1_0,
    'v1.2.0': v1_2_0,
}
const CURRENT_MODULE = MODULES[CURRENT_VERSION]

function upgradeActionOnce(action: Types[UpgradeableVersion]['Action']): AnyAction {
    switch (action.version) {
        case '0':
            return MODULES[NextVersion[action.version]].upgradeAction(action)
        case 'v1.1.0':
            return MODULES[NextVersion[action.version]].upgradeAction(action)
    }
}

export function upgradeAction(action: AnyAction): CurrentAction {
    while (action.version !== CURRENT_VERSION) {
        action = upgradeActionOnce(action)
    }
    return action
}

function upgradeStateOnce(state: Types[UpgradeableVersion]['State']): AnyState {
    switch (state.version) {
        case '0':
            return MODULES[NextVersion[state.version]].upgradeState(state)
        case 'v1.1.0':
            return MODULES[NextVersion[state.version]].upgradeState(state)
    }
}

export function upgradeState(state: AnyState): CurrentState {
    while (state.version !== CURRENT_VERSION) {
        state = upgradeStateOnce(state)
    }
    return state
}

function downgradeStateOnce(state: Types[DowngradeableVersion]['State']): AnyState {
    switch (state.version) {
        case 'v1.1.0':
            return MODULES[state.version].downgradeState(state)
        case 'v1.2.0':
            return MODULES[state.version].downgradeState(state)
    }
}

export function downgradeState(state: CurrentState): AnyState[] {
    let s: AnyState =state
    const res = []
    while (s.version !== FIRST_VERSION) {
        s = downgradeStateOnce(s)
        res.push(s)
    }
    return res
}

export function initState(gameId: string): CurrentState {
    return CURRENT_MODULE.initState(gameId)
}

export function integrate(state: CurrentState, action: CurrentAction): CurrentState {
    return CURRENT_MODULE.integrate(state, action)
}

export function getPath(r: AnyRecord): string {
    switch (r.kind) {
        case 'game':
            return `states/${r.version}/games/${r.gameId}`
        case 'player_game':
            return `versions/${r.version}/players/${r.playerId}/games/${r.gameId}`
    }
}

export function exportState(state: AnyState): AnyExport[] {
    switch (state.version) {
        case '0': return MODULES[state.version].exportState(state)
        case 'v1.1.0': return MODULES[state.version].exportState(state)
        case 'v1.2.0': return MODULES[state.version].exportState(state)
    }
}
