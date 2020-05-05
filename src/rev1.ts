import { DirectoryOp, OpBuilder, Readables } from "./framework/graph_builder";
import * as read from './framework/read';
import { Changes, Result } from "./framework/revision";
import { Action1_1, Game1_1, UncreatedGame1_1, CreatedGame1_1 } from "./model";

export interface StateSpec {
    game: Game1_1
}

export interface IntermediateSpec {
    shortCodeInUse: {}
}

export interface DerivedSpec {
    gamesByPlayer: Game1_1
}

export function derive(): DirectoryOp<StateSpec, DerivedSpec> {
    return {
        gamesByPlayer: OpBuilder.load<StateSpec, 'game'>('game', ['game'])
            .narrow((_, g): g is CreatedGame1_1 => g.state === 'CREATED')
            .indexBy(['player'], (_, g) => g.players.map(p => [p]))
            .reindex(['player', 'game'])
            .build()
    };
}

export function deriveIntermediate(): DirectoryOp<StateSpec, IntermediateSpec> {
    return {
        gamesByPlayer: OpBuilder.load<StateSpec, 'game'>('game', ['game'])
        //     .narrow((_, g): g is CreatedGame1_1 => g.state === 'CREATED')
        //     .indexBy(['player'], (_, g) => g.players.map(p => [p]))
        //     .reindex(['player', 'game'])
        //     .build()
    };
}

export async function integrate(action: Action1_1, sources: Readables<StateSpec>, intermediates: Readables<IntermediateSpec>): Promise<Result<{}, StateSpec>> {
    const newGame = await integrateHelper(action, sources, intermediates);
    if (newGame === null) {
        return {
            response: {},
            changes: {
                game: []
            }
        }
    }
    else {
        return {
            response: {},
            changes: {
                game: [{ kind: 'set', key: [action.gameId], value: newGame }]
            }
        }
    }
}

async function integrateHelper(a: Action1_1, sources: Readables<StateSpec>, intermediates: Readables<IntermediateSpec>): Promise<Game1_1 | null> {
    const game = await read.getOrDefault(sources.game, [a.gameId], defaultGame())
    switch (a.kind) {
        case 'create_game':
            if (game.state !== 'UNCREATED') {
                // Don't create already created game.
                return game
            }
            const shortCodeInUse = await read.get(intermediates.shortCodeInUse, [a.shortCode])
            if (shortCodeInUse !== null) {
                return null
            }
            return {
                state: 'CREATED',
                players: [],
                shortCode: a.shortCode,
            }
        case 'join_game':
            if (game.state === 'UNCREATED') {
                if (a.createIfNecessary) {
                    return {
                        state: 'CREATED',
                        players: [a.playerId],
                        shortCode: ''
                    }
                } else {
                    return null
                }
            }

            if (game.players.indexOf(a.playerId) !== -1) {
                return game
            }
            return {
                ...game,
                players: [...game.players, a.playerId],
            }
    }
}


function defaultGame(): UncreatedGame1_1 {
    return {
        state: 'UNCREATED'
    }
}
