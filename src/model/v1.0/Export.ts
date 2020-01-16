

export type PlayerGame = {
    version: 'v1.0'
    kind: 'player_game'
    playerId: string
    gameId: string

    players: string[]
}

export type Export = PlayerGame
export default Export