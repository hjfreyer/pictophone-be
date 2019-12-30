import produce from 'immer'
import { Index as PreviousIndex, VERSION as PREVIOUS_VERSION } from '../model/v1.2.0'
import { Index, VERSION } from '../model/v1.3.0'
import { JoinGame, MakeMove, StartGame, CreateGame } from '../model/v1.3.0/Action'
import { PlayerGame, PlayerMap, Series, ShortCode } from '../model/v1.3.0/Export'
import { mapValues } from '../util'
import { AnyDBRecord } from '../model'

type PreviousAction = PreviousIndex['Action']
type PreviousState = PreviousIndex['State']

type Action = Index['Action']
type State = Index['State']
type Export = Index['Export']

// Integration
// ===========
export function initState(gameId: string): State {
    return {
        version: VERSION,
        kind: 'game',
        gameId,
        state: 'UNCREATED',
    }
}

export function integrate(states: { [path: string]: AnyDBRecord[] }, action: Action): State {
    const statePath = `states/${action.version}/games/${action.gameId}`

    let state: State
    if (states[statePath].length === 0) {
        state = initState(action.gameId)
    } else {
        const rec = states[statePath][0]
        if (rec.version !== VERSION || rec.kind !== 'game') {
            throw new Error('bad state')
        }
        state = rec
    }

    switch (action.kind) {
        case 'create_game':
            const scPath = `derived/${action.version}/shortCodes/${action.shortCode}/games`
            return createGame(state, action, states[scPath].length > 0)
        case 'join_game':
            return joinGame(state, action)
        case 'start_game':
            return startGame(state, action)
        case 'make_move':
            return makeMove(state, action)
    }
}

function createGame(game: State, action: CreateGame, scUsed: boolean): State {
    if (game.state !== 'UNCREATED') {
        return game
    }
    if (scUsed) {
        return game
    }

    return {
        version: "v1.3.0",
        kind: "game",
        state: 'UNSTARTED',
        gameId: game.gameId,
        shortCode: action.shortCode,
        playerOrder: [],
        displayNames: {},
    }
}

function joinGame(game: State, action: JoinGame): State {
    if (game.state === 'UNCREATED') {
        if (!action.createIfNecessary) {
            return game
        }
        return {
            version: "v1.3.0",
            kind: "game",
            state: 'UNSTARTED',
            gameId: game.gameId,
            shortCode: '',
            playerOrder: [action.playerId],
            displayNames: {
                [action.playerId]: action.displayName,
            },
        }
    }

    if (game.state !== 'UNSTARTED') {
        return game
    }

    if (game.playerOrder.indexOf(action.playerId) !== -1) {
        return game
    }

    return produce(game, game => {
        game.displayNames[action.playerId] = action.displayName
        game.playerOrder.push(action.playerId)
    })
}

function startGame(game: State, action: StartGame): State {
    if (game.state !== 'UNSTARTED') {
        return game
    }
    if (game.playerOrder.length === 0) {
        return game
    }

    return {
        version: VERSION,
        kind: 'game',
        gameId: game.gameId,
        state: 'STARTED',
        playerOrder: game.playerOrder,
        displayNames: game.displayNames,
        submissions: mapValues(game.displayNames, () => []),
    }
}

function makeMove(game: State, action: MakeMove): State {
    if (game.state !== 'STARTED') {
        return game
    }
    const playerId = action.playerId
    if (game.playerOrder.indexOf(playerId) === -1) {
        return game
    }

    const roundNum = Math.min(...Object.values(game.submissions).map(s => s.length))
    if (game.submissions[playerId].length !== roundNum) {
        return game
    }

    // Game is over.
    if (roundNum === game.playerOrder.length) {
        return game
    }

    if (roundNum % 2 === 0 && action.submission.kind === 'drawing') {
        return game
    }
    if (roundNum % 2 === 1 && action.submission.kind === 'word') {
        return game
    }

    return produce(game, game => {
        game.submissions[playerId].push(action.submission)
    })
}

// Export
// ======
export function exportState(state: State): Export[] {
    switch (state.state) {
        case 'UNCREATED':
            return []
        case 'UNSTARTED':
            const exports: Export[] = []
            if (state.shortCode.length > 0) {
                exports.push({
                    version: VERSION,
                    kind: 'short_code',
                    gameId: state.gameId,
                    shortCode: state.shortCode,
                })
            }

            // TODO: DRY
            exports.push(...state.playerOrder.map((playerId): Export => ({
                version: VERSION,
                kind: 'player_game',
                playerId,
                gameId: state.gameId,
                ...exportStateForPlayer(state, playerId)
            })))

            return exports
        case 'STARTED':
            return state.playerOrder.map((playerId): Export => ({
                version: VERSION,
                kind: 'player_game',
                playerId,
                gameId: state.gameId,
                ...exportStateForPlayer(state, playerId)
            }))
    }
}

function exportStateForPlayer(state: State, playerId: string): PlayerGame {
    if (state.state === 'UNCREATED') {
        throw new Error('bad code?')
    }

    const players: PlayerMap = {}
    for (const id of state.playerOrder) {
        players[id] = { displayName: state.displayNames[id] }
    }

    if (state.state === 'UNSTARTED') {
        return {
            state: 'UNSTARTED',
            players,
            playerOrder: state.playerOrder,
        }
    }

    const numPlayers = state.playerOrder.length
    const roundNum = Math.min(...Object.values(state.submissions).map(a => a.length))

    // Game is over.
    if (roundNum === numPlayers) {
        const series: Series[] = state.playerOrder.map(() => ({ entries: [] }))
        for (let rIdx = 0; rIdx < numPlayers; rIdx++) {
            for (let pIdx = 0; pIdx < numPlayers; pIdx++) {
                series[(pIdx + rIdx) % numPlayers].entries.push({
                    playerId: state.playerOrder[pIdx],
                    submission: state.submissions[state.playerOrder[pIdx]][rIdx]
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

    if (state.submissions[playerId].length === 0) {
        return {
            state: 'FIRST_PROMPT',
            playerOrder: state.playerOrder,
            players,
        }
    }

    if (state.submissions[playerId].length === roundNum) {
        const playerIdx = state.playerOrder.indexOf(playerId)
        if (playerIdx === -1) {
            throw new Error('baad')
        }
        const nextPlayerIdx = (playerIdx + 1) % state.playerOrder.length
        return {
            state: 'RESPOND_TO_PROMPT',
            players,
            playerOrder: state.playerOrder,
            prompt: state.submissions[state.playerOrder[nextPlayerIdx]][roundNum - 1]
        }
    }

    return {
        state: 'WAITING_FOR_PROMPT',
        players,
        playerOrder: state.playerOrder,
    }
}

// Transform
// =========
export function upgradeState(state: PreviousState): State {
    switch (state.state) {
        case 'UNSTARTED':
            return {
                ...state,
                version: VERSION,
                shortCode: '',
            }
        case 'STARTED':
            return {
                ...state,
                version: VERSION
            }
    }

}

export function downgradeState(state: State): PreviousState {
    switch (state.state) {
        case 'UNCREATED':
            return {
                version: PREVIOUS_VERSION,
                kind: 'game',
                gameId: state.gameId,
                state: 'UNSTARTED',
                playerOrder: [],
                displayNames: {},
            }
        case 'UNSTARTED':
            return {
                version: PREVIOUS_VERSION,
                kind: state.kind,
                gameId: state.gameId,
                state: state.state,
                playerOrder: state.playerOrder,
                displayNames: state.displayNames,
            }
        case 'STARTED':
            return {
                version: PREVIOUS_VERSION,
                kind: state.kind,
                gameId: state.gameId,
                state: state.state,
                playerOrder: state.playerOrder,
                displayNames: state.displayNames,
                submissions: state.submissions,
            }
    }
}

export function upgradeAction(action: PreviousAction): Action {
    switch (action.kind) {
        case 'join_game':
            return {
                version: VERSION,
                kind: action.kind,
                gameId: action.gameId,
                playerId: action.playerId,
                displayName: action.displayName,
                createIfNecessary: true,
            }
        case 'start_game':
            return {
                version: VERSION,
                kind: action.kind,
                gameId: action.gameId,
                playerId: action.playerId,
            }
        case 'make_move':
            return {
                version: VERSION,
                kind: action.kind,
                gameId: action.gameId,
                playerId: action.playerId,
                submission: action.submission
            }
    }
}
