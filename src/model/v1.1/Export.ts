
const VERSION = 'v1.1'


export type PlayerGame = {
    version: typeof VERSION
    kind: 'player_game'
    playerId: string
    gameId: string

    players: string[]
}

export type Export = PlayerGame
export default Export