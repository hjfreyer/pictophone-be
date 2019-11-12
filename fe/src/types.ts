
export type GameLog = {
    lastTimestamp: any
    entries: GameLogEntry[]
}

export type GameLogEntry = {
    timestamp: any
    action: Action
}

export type Action = JoinGame | StartGame | MakeMove;

export type JoinGame = {
    kind: 'join_game'
    playerId: string
    gameId: string
}

export type StartGame = {
    kind: 'start_game'
    playerId: string
    gameId: string
}

export type MakeMove = {
    kind: 'make_move'
    playerId: string
    gameId: string
    submission: Submission
}

export type Point = {
    x: number,
    y: number,
}

export type Path = {
    points: Point[]
}

export type Drawing = {
    paths: Path[]
}

export type Submission = {
    kind: 'word'
    word: string
} | {
    kind: 'drawing'
    drawing: Drawing
}

export type PlayerGame = (
    UnstartedGame
    | FirstPromptGame
    | WaitingForPromptGame
    | RespondToPromptGame
    | FinishedGame
)

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