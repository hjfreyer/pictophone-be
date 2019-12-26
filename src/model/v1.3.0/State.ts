
const VERSION = 'v1.3.0'

type Base = {
    version: typeof VERSION
    kind: 'game'
    gameId: string
}

export type UncreatedGameState = Base & {
    state: 'UNCREATED'
}

type CreatedBase = Base & {
    playerOrder: string[]
    displayNames: Record<string, string>
}

export type UnstartedGameState = CreatedBase & {
    state: 'UNSTARTED'
}

export type StartedGameState = CreatedBase & {
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

export type State = UncreatedGameState | UnstartedGameState | StartedGameState

export default State
