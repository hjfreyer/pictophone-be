
import produce from "immer"

import * as proto from './proto/1.0.0.validator';
import * as types from './types.validator';

export function init(): types.History {
    return {
        games: {},
    };
}

export function reduce(acc: types.History, action: proto.Action): types.History {
    switch (action.kind) {
        case "join_game": return produce(joinGame)(acc, action);
        // case "start_game": return produce(startGame)(acc, action);
        // case "make_move": return produce(makeMove)(acc, action);
    }
}

function joinGame(acc: types.History, action: proto.JoinGame): void {
    if (!(action.gameId in acc.games)) {
        acc.games[action.gameId] = {
            //            state: 'UNSTARTED',
            playerIds: [action.playerId],
        };
        return;
    }

    const game = acc.games[action.gameId];

    if (game.playerIds.indexOf(action.playerId) != -1) {
        return;
    }

    game.playerIds.push(action.playerId);
}

// function startGame(acc: History, action: actions.StartGame): void {
//     if (!(action.gameId in acc.games)) {
//         return;
//     }

//     const game = acc.games[action.gameId];
//     if (game.playerIds.indexOf(action.playerId) == -1) {
//         return;
//     }

//     if (game.playerIds.length < 2) {
//         return;
//     }

//     acc.games[action.gameId] = {
//         state: 'ACTIVE',
//         playerIds: game.playerIds,
//         responses: [],
//     }
// }

// function makeMove(acc: History, action: actions.MakeMove): void {
// }

export function view(history: types.History): types.HistoryView {
    const res: types.HistoryView = {
        playerGames: {}
    }
    for (const gameId in history.games) {
        const game = history.games[gameId];

        for (const playerId of game.playerIds) {
            res.playerGames[playerId][gameId] = {
                playerIds: game.playerIds,
                //state: game.state,
            };
        }
    }

    return res;
}