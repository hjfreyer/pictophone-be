
export type Action = JoinGame

export type JoinGame = {
    version: 'v1.0'
    kind: 'join_game'
    playerId: string
    gameId: string
}

export default Action
