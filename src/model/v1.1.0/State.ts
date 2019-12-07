
export type GameState = (UnstartedGameState | StartedGameState) 

type Base = {
    version: 'v1.1.0'
    kind: 'game'
    gameId: string
    playerOrder: string[]
    displayNames: Record<string, string>   
}

export type UnstartedGameState = Base & {
    state: 'UNSTARTED'
}

export type StartedGameState = Base & {
    state: 'STARTED'
    submissions: Record<string, Submission[]>
}

export type Submission = {
    kind: 'word'
    word: string
} | {
    kind: 'drawing'
    drawingId: string
}

export type State = GameState

export default State