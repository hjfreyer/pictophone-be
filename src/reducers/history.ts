
import produce from "immer"

import Action from '../types/Action';
import * as actions from '../types/Action';

export type History = {
    games: {[id: string]: Game}
};

export type Game = UnstartedGame | ActiveGame | FinishedGame;

type UnstartedGame = {
    state: 'UNSTARTED';
    playerIds: string[];
}

type ActiveGame = {
    state: 'ACTIVE';
    playerIds: string[];
    responses: string[][];
}

type FinishedGame = {
    state: 'FINISHED';
    playerIds: string[];
}

export function init(): History {
    return {
        games: {},
    };
}

export function reduce(acc: History, action: Action): History {
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