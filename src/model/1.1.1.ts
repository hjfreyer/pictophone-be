import { ResultData } from "../util/result"
import { OptionData } from "../util/option"
import { Item } from "../interfaces"
import { Reference } from "../schema"

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

export type State = {
    gameId: string
    game: Game
}

export interface Facets {
    games: Item<Game>[]
}

export interface Annotations {
    parents: Item<Reference>[]
    facets: Facets
}


