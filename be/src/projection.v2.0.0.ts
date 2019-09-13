
import * as history from './history';

import * as types from './types';
import { Projection2_0, PlayerGame2_0 } from './types';
export { Projection2_0, PlayerGame2_0 };

export function init(): Projection2_0 {
    return {
        playerGames: {},
    };
}

export function projectHistory(acc: history.History): Projection2_0 {
    const res: Projection2_0 = {
        playerGames: {},
    };
    for (const gid in acc.games) {
        const game = acc.games[gid];

        for (const pid of game.playerIds) {
            res.playerGames[`players/${pid}/games/${gid}`] = {
                players: game.playerIds,
                state: game.state,
            };
        }
    }

    return res;
}

function projectGame(g: types.Game, playerId: string): PlayerGame2_0 {
    if (g.state === 'UNSTARTED' || g.state === 'FINISHED') {
        return {
            playerIds: g.playerIds,
            state: 'UNSTARTED',
        }
    }
    g.responses
}