import produce from 'immer'
import Action, { JoinGame } from './Action'
import Export, { PlayerGame } from './Export'
import State from './State'
import { mapValues } from '../../util'
import { Item } from '../../framework/incremental'
import { Op } from '../../framework/graph'

// Integration
// ===========
export function initState(): State {
    return {
        version: 'v1.0',
        kind: 'root',
        players: {}
    }
}

export function integrate(acc: State, action: Action): State {
    switch (action.kind) {
        case 'join_game':
            return joinGame(acc, action)
    }
}

function joinGame(game: State, action: JoinGame): State {
    const players = game.players[action.gameId] || []
    if (players.indexOf(action.playerId) !== -1) {
        return game
    }
    return produce(game, game => {
        game.players[action.gameId] = [...players, action.playerId]
    })
}

export function getKey(x: State | Export): string[] {
    switch (x.kind) {
        case 'root':
            return ['root']
        case 'player_game':
            return [x.playerId, x.gameId]
    }
}

// Exports
// =======
// export function exportState(state: State): Export[] {
//     const res: Export[] = []
//     for (const gameId in state.players) {
//         for (const playerId of state.players[gameId]) {
//             res.push({
//                 version: "v1.0",
//                 kind: "player_game",
//                 gameId: gameId,
//                 playerId,
//                 players: state.players['gameId'],
//             })
//         }
//     }
//     return res
// }

export class ExportMapper {
    newDims = 2
    map(path: string[], state: State): Item<Export>[] {
        const res: Item<Export>[] = []
        for (const gameId in state.players) {
            for (const playerId of state.players[gameId]) {
                res.push([[playerId, gameId], {
                    version: "v1.0",
                    kind: 'player_game',
                    playerId,
                    gameId,
                    players: state.players[gameId]
                }])
            }
        }
        return res
    }
}

export function exportMapper<S>(input: Op<S, State>): Op<S, Export> {
    return {
        kind: 'map',
        input,
        subSchema: ['player', 'game'],
        fn(_path: string[], state: State): Item<Export>[] {
            const res: Item<Export>[] = []
            for (const gameId in state.players) {
                for (const playerId of state.players[gameId]) {
                    res.push([[playerId, gameId], {
                        version: "v1.0",
                        kind: 'player_game',
                        playerId,
                        gameId,
                        players: state.players[gameId]
                    }])
                }
            }
            return res
        }
    }
}
//     newDims = 2
//     map(path: string[], state: State): Item<Export>[] {
//         const res: Item<Export>[] = []
//         for (const gameId in state.players) {
//             for (const playerId of state.players[gameId]) {
//                 res.push([[playerId, gameId], {
//                     version: "v1.0",
//                     kind: 'player_game',
//                     playerId,
//                     gameId,
//                     players: state.players[gameId]
//                 }])
//             }
//         }
//         return res
//     }
// }

