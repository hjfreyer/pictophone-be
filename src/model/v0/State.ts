
export type GameState = (UnstartedGameState | StartedGameState) 

export type UnstartedGameState = {
    state: 'UNSTARTED'
    players: {[playerId: string]: UnstartedGamePlayer}
    playerOrder: string[]
}

export type UnstartedGamePlayer = {
    id: string   
}

export type StartedGameState = {
    state: 'STARTED'
    players: {[playerId: string]: StartedGamePlayer}
    playerOrder: string[]
}

export type StartedGamePlayer = {
    id: string   
    submissions: Submission[]
}

export type Submission = {
    kind: 'word'
    word: string
} | {
    kind: 'drawing'
    drawingId: string
}

export type State = GameState & { version: '0', kind: 'game', gameId: string }

export default State
