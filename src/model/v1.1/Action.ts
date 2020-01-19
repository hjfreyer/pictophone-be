
export type Action = JoinGame

const VERSION = 'v1.1'

export type JoinGame = {
    version: typeof VERSION
    kind: 'join_game'
    playerId: string
    gameId: string
}

export default Action
