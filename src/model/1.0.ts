
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
    submission: ActionSubmission
}

export type ActionSubmission = {
    kind: 'word'

    /**
     * @minLength 1
     * @maxLength 1024
     * @contentMediaType text/plain
     */
    word: string
} | {
    kind: 'drawing'
    drawingId: string
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
} | {
    status: 'UNKNOWN'
    status_code: number
    error: unknown
}

export type BoringPlayerGame = {
    state: 'UNSTARTED' | 'FIRST_PROMPT' | 'WAITING_FOR_PROMPT'
    players: string[]
}

export type RespondToPromptPlayerGame = {
    state: 'RESPOND_TO_PROMPT'
    players: string[]
    prompt: ActionSubmission
}

export type FinishedPlayerGame = {
    state: 'GAME_OVER'
    players: string[]
    series: ExportedSeries[]
}

export type ExportedSeries = {
    entries: ExportedSeriesEntry[]
}

export type ExportedSeriesEntry = {
    playerId: string
    submission: ActionSubmission
}

export type PlayerGame = BoringPlayerGame | RespondToPromptPlayerGame | FinishedPlayerGame

export interface GameList {
    gameIds: string[]
}
