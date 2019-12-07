
export type Action = JoinGame | StartGame | MakeMove

export type JoinGame = {
    version: 0
    kind: 'join_game'
    playerId: string
    gameId: string
}

export type StartGame = {
    version: 0
    kind: 'start_game'
    playerId: string
    gameId: string
}

export type MakeMove = {
    version: 0
    kind: 'make_move'
    playerId: string
    gameId: string
    submission: Submission
}

export type Submission = {
    kind: 'word'
    word: string
} | {
    kind: 'drawing'
    drawingId: string
}

export default Action
