
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

export type Submission = {
    kind: 'word'
    word: string
} | {
    kind: 'drawing'
    paths: [number, number][][]
}

export type PlayerGame = SimpleGame | PromptGame | FinishedGame

export type SimpleGame = {
    state: 'UNSTARTED' | 'FIRST_PROMPT' | 'WAITING_FOR_PROMPT'
    playerIds: string[]
}

export type PromptGame = {
    state: 'RESPOND_TO_PROMPT'
    playerIds: string[]
    prompt: Submission
}

export type FinishedGame = {
    state: 'GAME_OVER'
    playerIds: string[]
}
