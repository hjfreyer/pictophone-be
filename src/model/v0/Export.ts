
export type PlayerGame = (
    UnstartedGame
    | FirstPromptGame
    | WaitingForPromptGame
    | RespondToPromptGame
    | FinishedGame
)

type Base = {
    version: '0'
    kind: 'player_game'
    playerId: string
    gameId: string
}

export type UnstartedGame = {
    state: 'UNSTARTED'
    playerIds: string[]
}

export type FirstPromptGame = {
    state: 'FIRST_PROMPT'
    playerIds: string[]
}

export type WaitingForPromptGame = {
    state: 'WAITING_FOR_PROMPT'
    playerIds: string[]
}

export type RespondToPromptGame = {
    state: 'RESPOND_TO_PROMPT'
    playerIds: string[]
    prompt: Submission
}

export type FinishedGame = {
    state: 'GAME_OVER'
    playerIds: string[]
    series: Series[]
}

export type Series = {
    entries: SeriesEntry[]
}

export type SeriesEntry = {
    playerId: string
    submission: Submission
}

export type Submission = {
    kind: 'word'
    word: string
} | {
    kind: 'drawing'
    drawingId: string
}

export type Export = (Base & PlayerGame)
export default Export