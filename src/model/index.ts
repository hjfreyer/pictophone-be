
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

export type AnyAction = Action1_0
