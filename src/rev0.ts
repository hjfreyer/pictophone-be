import { DirectoryOp, OpBuilder, Readables } from "./framework/graph_builder";
import * as read from './framework/read';
import { Changes, Result } from "./framework/revision";
import { Action1_0, Game1_0 } from "./model";

export interface StateSpec {
    game: Game1_0
}

export interface IntermediateSpec { }

export interface DerivedSpec {
    gamesByPlayer: Game1_0
}

export function derive(): DirectoryOp<StateSpec, IntermediateSpec, DerivedSpec> {
    return {
        gamesByPlayer: OpBuilder.load<StateSpec, IntermediateSpec, 'game'>('game', ['game'])
            .indexBy(['player'], (_, g) => g.players.map(p => [p]))
            .reindex(['player', 'game'])
            .build()
    };
}

export async function integrate(action: Action1_0, sources: Readables<StateSpec>,  intermediates: Readables<IntermediateSpec>): Promise<Result<{}, StateSpec>> {
    const game = await read.getOrDefault(sources.game, [action.gameId], defaultGame())
    const newGame = integrateHelper(action, game);
    return {
        response: {},
        changes: {
            game: [{ kind: 'set', key: [action.gameId], value: newGame }]
        }
    }
}


function defaultGame(): Game1_0 {
    return {
        players: [],
    }
}

function integrateHelper(a: Action1_0, game: Game1_0): Game1_0 {
    switch (a.kind) {
        case 'join_game':
            if (game.players.indexOf(a.playerId) !== -1) {
                return game
            }
            return {
                ...game,
                players: [...game.players, a.playerId],
            }
    }
}

