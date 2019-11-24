
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

export type State = GameState & { kind: 'game_state' }

export function initState(): State {
    return {
        kind: 'game_state',
        state: 'UNSTARTED',
        players: {},
        playerOrder: [],
    }
}

export default State
