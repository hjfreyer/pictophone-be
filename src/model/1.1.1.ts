
export interface JoinGameAction {
    kind: 'join_game'
    /**
     * @minLength 1
     * @maxLength 1024
     * @pattern ^[a-zA-Z0-9_-]*$
     */
    gameId: string

    /**
     * @minLength 1
     * @maxLength 1024
     * @pattern ^[a-zA-Z0-9_-]*$
     */
    playerId: string

    /**
     * @minLength 1
     * @maxLength 1024
     * @contentMediaType text/plain
     */
    playerDisplayName: string
}

export interface StartGameAction {
    kind: 'start_game'

    /**
     * @minLength 1
     * @maxLength 1024
     * @pattern ^[a-zA-Z0-9_-]*$
     */
    gameId: string

    /**
     * @minLength 1
     * @maxLength 1024
     * @pattern ^[a-zA-Z0-9_-]*$
     */
    playerId: string
}

export type MakeMoveAction = {
    kind: 'make_move'
    /**
     * @minLength 1
     * @maxLength 1024
     * @pattern ^[a-zA-Z0-9_-]*$
     */
    gameId: string

    /**
     * @minLength 1
     * @maxLength 1024
     * @pattern ^[a-zA-Z0-9_-]*$
     */
    playerId: string
    submission: Submission
}

export type Action = JoinGameAction | StartGameAction | MakeMoveAction

export type Error = {
    status: 'GAME_NOT_STARTED'
    status_code: 400
    gameId: string
} | {
    status: 'PLAYER_NOT_IN_GAME'
    status_code: 403
    gameId: string
    playerId: string
} | {
    status: 'MOVE_PLAYED_OUT_OF_TURN'
    status_code: 400
    gameId: string
    playerId: string
} | {
    status: 'GAME_IS_OVER'
    status_code: 400
    gameId: string
} | {
    status: 'INCORRECT_SUBMISSION_KIND'
    status_code: 400
    wanted: 'word' | 'drawing'
    got: 'word' | 'drawing'
} | {
    status: 'GAME_ALREADY_STARTED'
    status_code: 400
    gameId: string
}

export interface UnstartedGame {
    state: 'UNSTARTED'
    players: UnstartedGamePlayer[]
}

export interface UnstartedGamePlayer {
    id: string,
    displayName: string,
}

export interface StartedGame {
    state: 'STARTED'
    players: StartedGamePlayer[]
}

export interface StartedGamePlayer {
    id: string,
    displayName: string,
    submissions: Submission[]
}

export type Submission = {
    kind: 'word'
    word: string
} | {
    kind: 'drawing'
    drawingId: string
}

export type Game = UnstartedGame | StartedGame
