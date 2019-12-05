
type Base = {
    version: 'v1.2.0'
    playerId: string
    gameId: string
}

export type JoinGame = Base & {
    kind: 'join_game'

    /**
     * @minLength 0
     */
    displayName: string
}

export type StartGame = Base & {
    kind: 'start_game'
}

export type MakeMove = Base & {
    kind: 'make_move'
    submission: Submission
}

export type Submission = {
    kind: 'word'
    word: string
} | {
    kind: 'drawing'
    drawingId: string
}

export type Action = JoinGame | StartGame | MakeMove

export default Action
