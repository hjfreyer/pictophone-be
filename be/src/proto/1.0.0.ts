export type Action = JoinGame //| StartGame | MakeMove;

export type JoinGame = {
    kind: 'join_game'
    playerId: string
    gameId: string
};

// export type StartGame = {
//     kind: 'start_game'
//     playerId: string
//     gameId: string
// }

// export type MakeMove = {
//   kind: 'make_move';
//   playerId: string;
//   gameId: string;
//   word: string;
// };

// export type Projection = {
//     playerGames: {[id: string]: PlayerGame}
// }

// export type PlayerGame = {
//     playerIds: string[]
//     state: 'UNSTARTED'|'ACTIVE' | 'FINISHED';
// }

export type PlayerGame = {
    playerIds: string[]
}