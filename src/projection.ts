
import * as history from './history';

import {HistoryProjection, PlayerGame} from './types';
export {HistoryProjection, PlayerGame};


export function projectHistory(acc : history.History): HistoryProjection {
    const res : HistoryProjection = {
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