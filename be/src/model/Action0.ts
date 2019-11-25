
import { Submission } from './base'

export type Action0 = JoinGame | StartGame | MakeMove

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

export default Action0
