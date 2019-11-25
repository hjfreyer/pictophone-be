
import { Submission } from './base'

export type GameState = (UnstartedGameState | StartedGameState) 

type UnstartedGameState = {
    state: 'UNSTARTED'
    players: {[playerId: string]: UnstartedGamePlayer}
    playerOrder: string[]
}

type UnstartedGamePlayer = {
    id: string   
}

type StartedGameState = {
    state: 'STARTED'
    players: {[playerId: string]: StartedGamePlayer}
    playerOrder: string[]
}

type StartedGamePlayer = {
    id: string   
    submissions: Submission[]
}

export type State0 = GameState & { version: 0, kind: 'game_state' }

export function initState0(): State0 {
    return {
        version: 0,
        kind: 'game_state',
        state: 'UNSTARTED',
        players: {},
        playerOrder: [],
    }
}

export default State0
