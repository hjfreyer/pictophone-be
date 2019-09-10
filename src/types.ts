export type Action = JoinGame | StartGame | MakeMove;

export type JoinGame = {
    kind: 'join_game'
    playerId: string
    gameId: string
};

export type StartGame = {
    kind: 'start_game'
    playerId: string
    gameId: string
}

export type MakeMove = {
  kind: 'make_move';
  playerId: string;
  gameId: string;
  word: string;
};

export type History = {
    games: {[id: string]: Game}
};

export type Game = UnstartedGame | ActiveGame | FinishedGame;

export type UnstartedGame = {
    state: 'UNSTARTED';
    playerIds: string[];
}

export type ActiveGame = {
    state: 'ACTIVE';
    playerIds: string[];
    responses: string[][];
}

export type FinishedGame = {
    state: 'FINISHED';
    playerIds: string[];
}

export type Log = {
    views: {[collectionId: string]: number}
}

export type Entry = {
    body: string
}

export type HistoryProjection = {
    playerGames: {[id: string]: PlayerGame}
}

export type PlayerGame = {
    players: string[]
    state: Game['state']
}
