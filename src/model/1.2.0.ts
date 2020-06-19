import { Item } from "../interfaces"
import { Reference } from "../schema"
import { OptionData } from "../util/option"
import { ResultData } from "../util/result"
import * as fw from '../framework'

export interface CreateGameAction {
    kind: 'create_game'
    gameId: string
    shortCode: string
}

export interface JoinGameAction {
    kind: 'join_game'
    gameId: string
    playerId: string
    playerDisplayName: string
    createIfNecessary: boolean
}

export interface StartGameAction {
    kind: 'start_game'
    gameId: string
    playerId: string
}

export type MakeMoveAction = {
    kind: 'make_move'
    gameId: string
    playerId: string
    submission: Submission
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
}

export interface UnstartedGame {
    state: 'UNSTARTED'
    players: UnstartedGamePlayer[]
    shortCode: string
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

export type ShortCode = {}

export interface State {
    game: ResultData<Game, Error>
}

export type Annotation2 = fw.Annotation2<State>
