
import * as history from './reducers/history';


export type HistoryProjection = {
//    games: {[id: string]: Game}
    playerGames: {[id: string]: PlayerGame}
}

//type Game = {};

type PlayerGame = {
    players: string[]
    state: history.Game['state']
}

export function projectHistory(acc : history.State): HistoryProjection {
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