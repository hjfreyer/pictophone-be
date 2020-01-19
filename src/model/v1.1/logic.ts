import produce from 'immer'
import Action, { JoinGame } from './Action'
import Export, { PlayerGame } from './Export'
import State from './State'
import { mapValues } from '../../util'

import { Index as PreviousModel } from '../v1.0'

import { Diff, Item, Mapper, makeMappingDiffer } from '../../framework/incremental'
import { VERSION } from '.'



// Integration
// ===========
// export function initState(): State {
//     return {
//         version: 'v1.0',
//         kind: 'root',
//         players: {}
//     }
// }

// export function integrate(acc: State, action: Action): State {
//     switch (action.kind) {
//         case 'join_game':
//             return joinGame(acc, action)
//     }
// }

// function joinGame(game: State, action: JoinGame): State {
//     const players = game.players[action.gameId] || []
//     if (players.indexOf(action.playerId) !== -1) {
//         return game
//     }
//     return produce(game, game => {
//         game.players[action.gameId] = [...players, action.playerId]
//     })
// }

// export function getKey(x: State | Export): string[] {
//     switch (x.kind) {
//         case 'root':
//             return ['root']
//         case 'player_game':
//             return [x.playerId, x.gameId]
//     }
// }

// // Exports
// // =======
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


// Compatability
// =============

type PreviousAction = PreviousModel['Action']
type PreviousState = PreviousModel['State']

export function upgradeAction(action: PreviousAction): Action {
    return {
        ...action,
        version: 'v1.1',
    }
}

const upgradeStateMapper: Mapper<PreviousState, State> = (
    _path: string[], root: PreviousState): Item<State>[] => {

    const res: Item<State>[] = []
    for (const gameId in root.players) {
        res.push([[gameId], {
            version: VERSION,
            kind: "game",
            gameId,
            players: root.players[gameId],
        }])
    }
    return res
}

export const upgradeStateDiff = makeMappingDiffer(upgradeStateMapper)
