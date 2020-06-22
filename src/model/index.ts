// Base

import { Action as Action1_0, Error as Error1_0 } from './1.0'
import { Action as Action1_1, Error as Error1_1 } from './1.1'
import { Action as Action1_2, Error as Error1_2 } from './1.2'

export type AnyAction = Action1_0 | Action1_1 | Action1_2
export type AnyError = Error1_0 | Error1_1 | Error1_2

export type SavedAction = {
    parents: Record<string, ReferenceGroup>
    action: AnyAction
}

export type ReferenceGroup = {
    kind: 'leaf'
    actionId: string
} | {
    kind: 'node'
    subfacets: Record<string, ReferenceGroup>
} | {
    kind: 'nil'
}

// export interface NumberValue {
//     value: number
// }

// export interface LiveUnknown {
//     actionId: string
//     value: unknown
// }

// export type Diff<V> = {
//     key: string[]
//     kind: 'add'
//     value: V
// } | {
//     key: string[]
//     kind: 'delete'
//     value: V
// } | {
//     key: string[]
//     kind: 'replace'
//     oldValue: V
//     newValue: V
// }

// // 1.0

// export interface JoinGameAction1_0 {
//     version: '1.0'
//     kind: 'join_game'
//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @pattern ^[a-zA-Z0-9_-]*$
//      */
//     gameId: string

//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @pattern ^[a-zA-Z0-9_-]*$
//      */
//     playerId: string
// }

// export interface StartGameAction1_0 {
//     version: '1.0'
//     kind: 'start_game'

//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @pattern ^[a-zA-Z0-9_-]*$
//      */
//     gameId: string

//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @pattern ^[a-zA-Z0-9_-]*$
//      */
//     playerId: string
// }

// export type MakeMoveAction1_0 = {
//     version: '1.0'
//     kind: 'make_move'
//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @pattern ^[a-zA-Z0-9_-]*$
//      */
//     gameId: string

//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @pattern ^[a-zA-Z0-9_-]*$
//      */
//     playerId: string
//     submission: ActionSubmission1_0
// }

// export type ActionSubmission1_0 = {
//     kind: 'word'

//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @contentMediaType text/plain
//      */
//     word: string
// } | {
//     kind: 'drawing'
//     drawingId: string
// }

// export type Action1_0 = JoinGameAction1_0 | StartGameAction1_0 | MakeMoveAction1_0

// export interface UnstartedGame1_0 {
//     state: 'UNSTARTED'
//     players: string[]
// }

// export interface StartedGame1_0 {
//     state: 'STARTED'
//     players: string[]
//     submissions: Record<string, StateSubmission1_0[]>
// }

// export type StateSubmission1_0 = {
//     kind: 'word'
//     word: string
// } | {
//     kind: 'drawing'
//     drawingId: string
// }

// export type Game1_0 = UnstartedGame1_0 | StartedGame1_0

// export type Error1_0 = {
//     version: '1.0'
//     status: 'GAME_NOT_STARTED'
//     gameId: string
// } | {
//     version: '1.0'
//     status: 'PLAYER_NOT_IN_GAME'
//     gameId: string
//     playerId: string
// } | {
//     version: '1.0'
//     status: 'MOVE_PLAYED_OUT_OF_TURN'
//     gameId: string
//     playerId: string
// } | {
//     version: '1.0'
//     status: 'GAME_IS_OVER'
//     gameId: string
// } | {
//     version: '1.0'
//     status: 'INCORRECT_SUBMISSION_KIND'
//     wanted: ActionSubmission1_0['kind']
//     got: ActionSubmission1_0['kind']
// } | {
//     version: '1.0'
//     status: 'GAME_ALREADY_STARTED'
//     gameId: string
// }

// export type BoringPlayerGame1_0 = {
//     state: 'UNSTARTED' | 'FIRST_PROMPT' | 'WAITING_FOR_PROMPT'
//     players: string[]
// }

// export type RespondToPromptPlayerGame1_0 = {
//     state: 'RESPOND_TO_PROMPT'
//     players: string[]
//     prompt: ActionSubmission1_0
// }

// export type FinishedPlayerGame1_0 = {
//     state: 'GAME_OVER'
//     players: string[]
//     series: ExportedSeries1_0[]
// }

// export type ExportedSeries1_0 = {
//     entries: ExportedSeriesEntry1_0[]
// }

// export type ExportedSeriesEntry1_0 = {
//     playerId: string
//     submission: ActionSubmission1_0
// }

// export type PlayerGame1_0 = BoringPlayerGame1_0 | RespondToPromptPlayerGame1_0 | FinishedPlayerGame1_0

// // 1.1

// export interface JoinGameAction1_1 {
//     version: '1.1'
//     kind: 'join_game'
//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @pattern ^[a-zA-Z0-9_-]*$
//      */
//     gameId: string

//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @pattern ^[a-zA-Z0-9_-]*$
//      */
//     playerId: string

//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @contentMediaType text/plain
//      */
//     playerDisplayName: string
// }

// export interface StartGameAction1_1 {
//     version: '1.1'
//     kind: 'start_game'

//     /**
//  * @minLength 1
//  * @maxLength 1024
//  * @pattern ^[a-zA-Z0-9_-]*$
//  */
//     gameId: string

//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @pattern ^[a-zA-Z0-9_-]*$
//      */
//     playerId: string
// }

// export type MakeMoveAction1_1 = {
//     version: '1.1'
//     kind: 'make_move'
//     /**
//  * @minLength 1
//  * @maxLength 1024
//  * @pattern ^[a-zA-Z0-9_-]*$
//  */
//     gameId: string

//     /**
//      * @minLength 1
//      * @maxLength 1024
//      * @pattern ^[a-zA-Z0-9_-]*$
//      */
//     playerId: string
//     submission: ActionSubmission1_0
// }

// export type Action1_1 = JoinGameAction1_1 | StartGameAction1_1 | MakeMoveAction1_1

// export interface UnstartedGame1_1 {
//     state: 'UNSTARTED'
//     players: UnstartedGamePlayer1_1[]
// }

// export interface UnstartedGamePlayer1_1 {
//     id: string,
//     displayName: string,
// }

// export interface StartedGame1_1 {
//     state: 'STARTED'
//     players: StartedGamePlayer1_1[]
// }

// export interface StartedGamePlayer1_1 {
//     id: string,
//     displayName: string,
//     submissions: StateSubmission1_0[]
// }

// export type Game1_1 = UnstartedGame1_1 | StartedGame1_1

// export type Error1_1 = Error1_0

// export type BoringPlayerGame1_1 = {
//     state: 'UNSTARTED' | 'FIRST_PROMPT' | 'WAITING_FOR_PROMPT'
//     players: ExportedPlayer1_1[]
// }

// export type RespondToPromptPlayerGame1_1 = {
//     state: 'RESPOND_TO_PROMPT'
//     players: ExportedPlayer1_1[]
//     prompt: ActionSubmission1_0
// }

// export type FinishedPlayerGame1_1 = {
//     state: 'GAME_OVER'
//     players: ExportedPlayer1_1[]
//     series: ExportedSeries1_0[]
// }

// export interface ExportedPlayer1_1 {
//     id: string
//     displayName: string
// }

// export type PlayerGame1_1 = BoringPlayerGame1_1 | RespondToPromptPlayerGame1_1 | FinishedPlayerGame1_1
