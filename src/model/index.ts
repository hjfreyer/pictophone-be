// Base

// v1.0

export interface JoinGameAction1_0 {
    version: '1.0'
    kind: 'join_game'
    gameId: string
    playerId: string
}

export type Action1_0 = JoinGameAction1_0

export interface Game1_0 {
    players: string[]
}

export type State1_0 = Game1_0

// v1.1

export interface CreateGameAction1_1 {
    version: '1.1'
    kind: 'create_game'
    gameId: string
    shortCode: string
}

export interface JoinGameAction1_1 {
    version: '1.1'
    kind: 'join_game'
    gameId: string
    playerId: string

    createIfNecessary?: boolean
}

export type Action1_1 = CreateGameAction1_1 | JoinGameAction1_1

export interface UncreatedGame1_1 {
    state: 'UNCREATED'
}

export interface CreatedGame1_1 {
    state: 'CREATED'
    players: string[]
    shortCode: string
}

export type Game1_1 = UncreatedGame1_1 | CreatedGame1_1

export type AnyAction = Action1_0 | Action1_1
