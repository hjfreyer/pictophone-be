
import produce from "immer"

import Action from '../types/Action';
import * as actions from '../types/Action';

import {History, Game, State, validate} from '../types/history.validator';

export {History, Game, State, validate};

export function init(): History {
    return {
        current: initState(),
        previous: initState(),
    };
}

export function initState(): State {
    return {
        games: {},
    };
}

export function reduce(acc: History, action: Action): History {
    return {
        previous: acc.current,
        current: reduceState(acc.current, action),
    }
}

export function reduceState(acc: State, action: Action): State {
    switch (action.kind) {
    case "join_game": return produce(joinGame)(acc, action);
    case "start_game": return produce(startGame)(acc, action);
    case "make_move": return produce(makeMove)(acc, action);
    }
}

function joinGame(acc: State, action: actions.JoinGame): void {
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

function startGame(acc: State, action: actions.StartGame): void {
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

function makeMove(acc: State, action: actions.MakeMove): void {
}