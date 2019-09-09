

export type History = {
    current: State
    previous: State
};

export type State = {
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
