import produce from 'immer'
import Action, { JoinGame } from './Action'
import Export, { PlayerGame } from './Export'
import State from './State'
import { mapValues } from '../../util'

import { Index as PreviousModel } from '../v1.0'

import { Diff, Item, Mapper, Enumerable, MappedEnumerable, TransposedEnumerable, Reactive, MappedReactive, TransposedReactive, Reducer, ReducedQueryable, Queryable, DowngradedQueryable } from '../../framework/incremental'
import { VERSION } from '.'
import { Op } from '../../framework/graph'
import validator from '../validator'



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

export function exportStateEnumerable(input: Enumerable<State>): Enumerable<Export> {
    return new TransposedEnumerable([0, 2, 1], new MappedEnumerable(new ExportMapper(), input))
}

export function exportStateReactive<S>(input: Reactive<S, State>): Reactive<S, Export> {
    return new TransposedReactive([0, 2, 1], new MappedReactive(new ExportMapper(), input))
}

export function exportState3Enumerable(input: Queryable<Export>): Enumerable<Export> {
    return new DowngradedQueryable(new ReducedQueryable(new HighlanderReducer(1), input))
}

export function exportState3Reactive<S>(input: Reactive<S, State>): Reactive<S, Export> {
    return new TransposedReactive([2, 1, 0], new MappedReactive(new ExportMapper(), input))
}

class ExportMapper implements Mapper<State, Export> {
    newDims = 1
    map(path: string[], state: State): Item<Export>[] {
        const [, gameId] = path
        const res: Item<Export>[] = []
        for (const playerId of state.players) {
            res.push([[playerId], {
                version: "v1.1",
                kind: 'player_game',
                playerId,
                gameId,
                players: state.players
            }])
        }
        return res
    }
}

function highlander<V>(baseKey: string[], items: Item<V>[]): V {
        if (items.length != 1) {
            throw new Error(`There can be only one; ${baseKey} had ${items.length}`)
        }
        return items[0][1]
    }
class HighlanderReducer<V> implements Reducer<V, V> {
    constructor(public reduceDims: number) { }

    reduce(baseKey: string[], items: Item<V>[]): V {
        if (items.length != 1) {
            throw new Error(`There can be only one; ${baseKey} had ${items.length}`)
        }
        return items[0][1]
    }
}

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

export function upgradeState<S>(input: Op<S, PreviousState>): Op<S, State> {
    const byUniverseGame: Op<S, State> = {
        kind: 'map',
        input,
        subSchema: ['game'],
        fn(_path: string[], root: PreviousState): Item<State>[] {
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
    }
    const byGameUniverse: Op<S, State> = {
        kind: 'transpose',
        input: byUniverseGame,
        permutation: [1, 0],
    }
    const sorted : Op<S, State> = {
        kind: 'sort',
        input: byGameUniverse,
        collectionId: 'v1.1-state-sort',
        validator: validator('v1.1', 'State'),
    }
    return {
        kind: 'reduce',
        input: sorted,
        newSchema: ['game'],
        fn: highlander
    }
}

export class UpgradeStateMapper implements Mapper<PreviousState, State> {
    newDims = 1

    map(_path: string[], root: PreviousState): Item<State>[] {

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
}
