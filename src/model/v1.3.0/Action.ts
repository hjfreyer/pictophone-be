
const VERSION = 'v1.3.0'

type Base = {
    version: typeof VERSION
    playerId: string
    gameId: string
}

export type CreateGame = Base& {
    kind: 'create_game'
    shortCode: string
}
export type JoinGame = Base& {
    kind: 'join_game'

    /**
     * @minLength 0
     */
    displayName: string

    createIfNecessary: boolean
}

export type StartGame =Base&  {
    kind: 'start_game'
}

export type MakeMove = Base&{
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

export type Action =  CreateGame|JoinGame | StartGame | MakeMove

export default Action
