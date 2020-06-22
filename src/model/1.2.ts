

export interface CreateGameAction {
    version: '1.2'
    kind: 'create_game'

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
    shortCode: string
}

export interface JoinGameAction {
    version: '1.2'
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
    version: '1.2'
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
    version: '1.2'
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

export type Submission = {
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

export type Action = CreateGameAction | JoinGameAction | StartGameAction | MakeMoveAction

export type Error = {
    version: '1.0'
    status: 'GAME_NOT_STARTED'
    status_code: 400
    gameId: string
} | {
    version: '1.0'
    status: 'PLAYER_NOT_IN_GAME'
    status_code: 403
    gameId: string
    playerId: string
} | {
    version: '1.0'
    status: 'MOVE_PLAYED_OUT_OF_TURN'
    status_code: 400
    gameId: string
    playerId: string
} | {
    version: '1.0'
    status: 'GAME_IS_OVER'
    status_code: 400
    gameId: string
} | {
    version: '1.0'
    status: 'INCORRECT_SUBMISSION_KIND'
    status_code: 400
    wanted: 'word' | 'drawing'
    got: 'word' | 'drawing'
} | {
    version: '1.0'
    status: 'GAME_ALREADY_STARTED'
    status_code: 400
    gameId: string
} | {
    version: '1.2'
    status: 'GAME_NOT_FOUND'
    status_code: 404
    gameId: string
} | {
    version: '1.2'
    status: 'GAME_ALREADY_EXISTS'
    status_code: 400
    gameId: string
} | {
    version: '1.2'
    status: 'SHORT_CODE_IN_USE'
    status_code: 400
    shortCode: string
} | {
    version: 'UNKNOWN'
    true_version: string
    status: string
    status_code: number
}

export type BoringPlayerGame = {
    state: 'UNSTARTED' | 'FIRST_PROMPT' | 'WAITING_FOR_PROMPT'
    players: ExportedPlayer[]
}

export type RespondToPromptPlayerGame = {
    state: 'RESPOND_TO_PROMPT'
    players: ExportedPlayer[]
    prompt: Submission
}

export type FinishedPlayerGame = {
    state: 'GAME_OVER'
    players: ExportedPlayer[]
    series: ExportedSeries[]
}

export type ExportedSeries = {
    entries: ExportedSeriesEntry[]
}

export type ExportedSeriesEntry = {
    playerId: string
    submission: Submission
}

export interface ExportedPlayer {
    id: string
    displayName: string
}

export type PlayerGame = BoringPlayerGame | RespondToPromptPlayerGame | FinishedPlayerGame
