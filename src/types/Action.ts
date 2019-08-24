type Action = JoinGameAction | StartGameAction;

type JoinGameAction = {
    kind: 'join_game',
    playerId: string,
    gameId: string,
};

type StartGameAction = {
    kind: 'start_game',
    playerId: string,
    gameId: string,
}

export default Action;