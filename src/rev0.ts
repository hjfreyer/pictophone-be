import { Game1_0, Action1_0 } from "./model";
import {  InputOps, OutputOps, Diffs, Readables, InitialRevision } from "./framework/revision";
import * as read from './framework/read';

export interface Sources {
    game: Game1_0
}

export interface Derived { }

function defaultGame(): Game1_0 {
    return {
        players: [],
    }
}

function integrate(a: Action1_0, game: Game1_0): Game1_0 {
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

class Rev0 implements InitialRevision<Action1_0, Sources, Derived> {
    derive(): OutputOps<Sources, Derived> {
        return {};
    }

    async integrate(action: Action1_0, sources: Readables<Sources>): Promise<Diffs<Sources>> {
        const game = await read.getOrDefault(sources.game, [action.gameId], defaultGame())
        const newGame = integrate(action, game);
        return {
            game: [{ kind: 'add', key: [action.gameId], value: newGame }]
        }
    }
}


const R: InitialRevision<Action1_0, Sources, Derived> = new Rev0()
export default R