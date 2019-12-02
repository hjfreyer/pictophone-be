import State0 from '../model/State0'
import Export, { PlayerGame, PlayerMap, Series } from '../model/Export1_1_0'
import { mapValues } from '../util'

export default function exportState(gameId: string, state: State0): Export[] {
    return state.playerOrder.map(playerId => ({
        version: 'v1.1.0',
        kind: 'player_game',
        playerId,
        gameId,
        ...exportStateForPlayer(state, playerId)
    }))
}

function exportStateForPlayer(state: State0, playerId: string): PlayerGame {
    const players: PlayerMap = mapValues(state.players, (_, { id }) => ({
        id,
        displayName: id,
    }))

    if (state.state === 'UNSTARTED') {
        return {
            state: 'UNSTARTED',
            players,
            playerOrder: state.playerOrder,
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
            players,
            playerOrder: state.playerOrder,
            series,
        }
    }

    if (state.players[playerId].submissions.length === 0) {
        return {
            state: 'FIRST_PROMPT',
            playerOrder: state.playerOrder,
            players,
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
            players,
            playerOrder: state.playerOrder,
            prompt: state.players[state.playerOrder[nextPlayerIdx]].submissions[roundNum - 1]
        }
    }

    return {
        state: 'WAITING_FOR_PROMPT',
        players,
        playerOrder: state.playerOrder,
    }
}