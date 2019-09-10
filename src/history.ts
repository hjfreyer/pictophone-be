
import produce from "immer"

import * as actions from './actions';

import {History, Game, validate} from './types.validator';

export {History, Game, validate};

export function init(): History {
    return {
        games: {},
    };
}

export function reduce(acc: History, action: actions.Action): History {
    switch (action.kind) {
    case "join_game": return produce(joinGame)(acc, action);
    case "start_game": return produce(startGame)(acc, action);
    case "make_move": return produce(makeMove)(acc, action);
    }
}

function joinGame(acc: History, action: actions.JoinGame): void {
    if (!(action.gameId in acc.games)) {
        acc.games[action.gameId] = {
            state: 'UNSTARTED',
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

function startGame(acc: History, action: actions.StartGame): void {
    if (!(action.gameId in acc.games)) {
        return;
    }

    const game = acc.games[action.gameId];
    if (game.playerIds.indexOf(action.playerId) == -1) {
        return;
    }

    if (game.playerIds.length < 2) {
        return;
    }

    acc.games[action.gameId] = {
        state: 'ACTIVE',
        playerIds: game.playerIds,
        responses: [],
    }
}

function makeMove(acc: History, action: actions.MakeMove): void {
}