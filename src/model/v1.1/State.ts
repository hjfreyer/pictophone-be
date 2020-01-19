
const VERSION = 'v1.1'

export type State = {
    version: typeof VERSION,
    kind: 'game',
    gameId: string
    players: string[]
}

export default State
