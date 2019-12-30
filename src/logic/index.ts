import { strict as assert } from 'assert'
import { AnyAction, AnyExport, AnyState, DowngradeableVersion, FIRST_VERSION, PRIMARY_VERSION, NextVersion, Types, UpgradeableVersion, Version, VERSIONS, AnyDBRecord, LATEST_VERSION, PHASE, PrimaryAction, PrimaryState } from '../model'
import * as v0 from './0'
import * as v1_1_0 from './v1.1.0'
import * as v1_2_0 from './v1.2.0'
import * as v1_3_0 from './v1.3.0'

const MODULES = {
    '0': v0,
    'v1.1.0': v1_1_0,
    'v1.2.0': v1_2_0,
    'v1.3.0': v1_3_0,
}
const PRIMARY_MODULE = MODULES[PRIMARY_VERSION]

function upgradeActionOnce(action: Types[UpgradeableVersion]['Action']): AnyAction {
    switch (action.version) {
        case '0':
            return MODULES[NextVersion[action.version]].upgradeAction(action)
        case 'v1.1.0':
            return MODULES[NextVersion[action.version]].upgradeAction(action)
        case 'v1.2.0':
            return MODULES[NextVersion[action.version]].upgradeAction(action)
    }
}

export function upgradeAction(action: AnyAction): PrimaryAction {
    if (PHASE !== 'CURRENT' && action.version === LATEST_VERSION) {
        throw new Error('version not yet active: ' + action.version)
    }
    while (action.version !== PRIMARY_VERSION) {
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
        case 'v1.2.0':
            return MODULES[NextVersion[state.version]].upgradeState(state)
    }
}

export function upgradeState(state: AnyState): PrimaryState {
    while (state.version !== PRIMARY_VERSION) {
        if ((state.version as any) === LATEST_VERSION) {
            throw new Error('version not yet active: ' + state.version)
        }
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
        case 'v1.3.0':
            return MODULES[state.version].downgradeState(state)
    }
}

export const activeStates = activeStatesCurrentOrCurrentPrimary

function activeStatesCurrentOrCurrentPrimary(state: PrimaryState): AnyState[] {
    let s: AnyState = state
    const res: AnyState[] = [s]
    while (s.version !== FIRST_VERSION) {
        s = downgradeStateOnce(s)
        res.push(s)
    }

    return res
}

// function activeStatesPreviousPrimary(state: PrimaryState): AnyState[] {
//     let s: AnyState = state
//     const res: AnyState[] = [s]
//     while (s.version !== FIRST_VERSION) {
//         s = downgradeStateOnce(s)
//         res.push(s)
//     }

//     res.push(upgradeStateOnce(state))

//     return res
// }

export const initState = PRIMARY_MODULE.initState
export const integrate = PRIMARY_MODULE.integrate

export function getPath(r: AnyDBRecord): string {
    switch (r.kind) {
        case 'game':
            return `states/${r.version}/games/${r.gameId}`
        case 'player_game':
            return `versions/${r.version}/players/${r.playerId}/games/${r.gameId}`
        case 'short_code':
            return `derived/${r.version}/shortCodes/${r.shortCode}/games/${r.gameId}`
    }
}

export function exportState(state: AnyState): AnyExport[] {
    switch (state.version) {
        case '0': return MODULES[state.version].exportState(state)
        case 'v1.1.0': return MODULES[state.version].exportState(state)
        case 'v1.2.0': return MODULES[state.version].exportState(state)
        case 'v1.3.0': return MODULES[state.version].exportState(state)
    }
}
