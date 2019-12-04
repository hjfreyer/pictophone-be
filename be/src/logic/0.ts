import produce from 'immer'
import Action, { JoinGame, MakeMove, StartGame } from '../model/Action0'
import Export, { PlayerGame, Series } from '../model/Export0'
import State from '../model/State0'
import { mapValues } from '../util'

// Integration
// ===========
export function initState(): State {
    return {
        version: 0,
        kind: 'game_state',
        state: 'UNSTARTED',
        players: {},
        playerOrder: [],
    }
}

export function integrate(acc: State, action: Action): State {
    switch (action.kind) {
        case 'join_game':
            return produce(joinGame)(acc, action)
        case 'start_game':
            return produce(startGame)(acc, action)
        case 'make_move':
            return produce(makeMove)(acc, action)
    }
}

function joinGame(game: State, action: JoinGame) {
    if (game.state !== 'UNSTARTED') {
        return
    }

    if (game.playerOrder.indexOf(action.playerId) != -1) {
        return
    }

    game.players[action.playerId] = {
        id: action.playerId
    }
    game.playerOrder.push(action.playerId)
}

function startGame(game: State, action: StartGame): State {
    if (game.state !== 'UNSTARTED') {
        return game
    }
    if (game.playerOrder.length === 0) {
        return game
    }

    return {
        ...game,
        state: 'STARTED',
        players: mapValues(game.players, (_, v) => ({ ...v, submissions: [] }))
    }
}

function makeMove(game: State, action: MakeMove) {
    if (game.state !== 'STARTED') {
        return
    }
    const playerId = action.playerId
    if (!(playerId in game.players)) {
        return
    }

    const roundNum = Math.min(...Object.values(game.players).map(a => a.submissions.length))
    if (game.players[playerId].submissions.length !== roundNum) {
        return
    }

    // Game is over.
    if (roundNum === game.playerOrder.length) {
        return
    }

    if (roundNum % 2 === 0 && action.submission.kind === 'drawing') {
        return
    }
    if (roundNum % 2 === 1 && action.submission.kind === 'word') {
        return
    }

    game.players[playerId].submissions.push(action.submission)
}

// Exports
// =======
export function exportState(gameId: string, state: State): Export[] {
    return state.playerOrder.map(playerId => ({
        version: '0',
        kind: 'player_game',
        gameId,
        playerId,
        ...exportStateForPlayer(state, playerId)
    }))
}

function exportStateForPlayer(state: State, playerId: string): PlayerGame {
    if (state.state === 'UNSTARTED') {
        return {
            state: 'UNSTARTED',
            playerIds: state.playerOrder,
        }
    }

    const numPlayers = state.playerOrder.length
    const roundNum = Math.min(...Object.values(state.players).map(a => a.submissions.length))

    // Game is over.
    if (roundNum === numPlayers) {
        const series: Series[] = state.playerOrder.map(() => ({ entries: [] }))
        for (let rIdx = 0; rIdx < numPlayers; rIdx++) {
            for (let pIdx = 0; pIdx < numPlayers; pIdx++) {
                series[(pIdx + rIdx) % numPlayers].entries.push({
                    playerId: state.playerOrder[pIdx],
                    submission: state.players[state.playerOrder[pIdx]].submissions[rIdx]
                })
            }
        }

        return {
            state: 'GAME_OVER',
            playerIds: state.playerOrder,
            series,
        }
    }

    if (state.players[playerId].submissions.length === 0) {
        return {
            state: 'FIRST_PROMPT',
            playerIds: state.playerOrder,
        }
    }

    if (state.players[playerId].submissions.length === roundNum) {
        const playerIdx = state.playerOrder.indexOf(playerId)
        if (playerIdx === -1) {
            throw new Error('baad')
        }
        const nextPlayerIdx = (playerIdx + 1) % state.playerOrder.length
        return {
            state: 'RESPOND_TO_PROMPT',
            playerIds: state.playerOrder,
            prompt: state.players[state.playerOrder[nextPlayerIdx]].submissions[roundNum - 1]
        }
    }

    return {
        state: 'WAITING_FOR_PROMPT',
        playerIds: state.playerOrder,
    }
}
