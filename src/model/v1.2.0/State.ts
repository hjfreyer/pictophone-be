
const VERSION = 'v1.2.0'

export type GameState = (UnstartedGameState | StartedGameState) 

type Base = {
    version: typeof VERSION
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
