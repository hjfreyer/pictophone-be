
import produce from 'immer';
import * as ixa from "ix/asynciterable";
import * as ixaop from "ix/asynciterable/operators";
import * as ix from "ix/iterable";
import * as ixop from "ix/iterable/operators";
import { getAction, Table, Errors } from '..';
import { findItemAsync, getNewValue, getDocsInCollection } from '../base';
import * as db from '../db';
import * as diffs from '../diffs';
import * as fw from '../framework';
import { Diff, Item, item, Key } from '../interfaces';
import { AnyAction, SavedAction } from '../model';
import * as model1_0 from '../model/1.0';
import * as model1_1 from '../model/1.1';
import { Action, Error, Game, MakeMoveAction } from '../model/1.1.1';
import { DocVersionSpec, VersionSpec, VersionSpecRequest } from '../model/base';
import * as util from '../util';
import { Option, option, Result, result } from '../util';


async function getResult(db: db.Database, savedAction: SavedAction): Promise<Errors> {
    const { gameId } = savedAction.action;
    const oldGameItem = await GAME.getState(db, [gameId], savedAction.parents);
    const oldGame = option.from(oldGameItem).map(item => item.value)
    const newGameResult = integrateHelper(convertAction(savedAction),
        oldGame);
    return {
        '1.0': result.from(newGameResult).map(() => null),
        '1.1': result.from(newGameResult).map(() => null),
    }
}

async function getGameDiffs(db: db.Database, savedAction: SavedAction): Promise<Diff<Game>[]> {
    const { gameId } = savedAction.action;
    const oldGameItem = await GAME.getState(db, [gameId], savedAction.parents);
    const oldGame = option.from(oldGameItem).map(item => item.value)
    const newGameResult = integrateHelper(convertAction(savedAction),
        oldGame);
    return result.from(newGameResult)
        .map((newGame: Game): Diff<Game>[] =>
            diffs.newDiff2([gameId], oldGame, option.some(newGame)).diffs)
        .orElse(() => [])
}



const GAME: Table<Game> = {
    async getState(d: db.Database, [gameId]: Key, version: VersionSpec): Promise<Option<Item<Game>>> {
        const docVersion = option.of(version.docs[db.serializeDocPath(['games'], [gameId])]).unwrap();
        if (!docVersion.exists) {
            return option.none()
        }

        const savedAction = option.from(await getAction(d, docVersion.actionId)).unwrap();

        const gameDiffs = await getGameDiffs(d, savedAction);
        if (gameDiffs.length !== 1) {
            throw new Error("weird output from getGameDiffs: " + JSON.stringify(gameDiffs))
        }

        return option.from(getNewValue(gameDiffs[0]))
    },
    async getLatestVersionRequest(_d: db.Database, key: Key): Promise<VersionSpecRequest> {
        return {
            docs: [db.serializeDocPath(['games'], key)],
            collections: []
        }
    }
}

export const PLAYER_GAME1_1: Table<model1_1.PlayerGame> = {
    async getState(d: db.Database, key: Key, version: VersionSpec): Promise<Option<Item<model1_1.PlayerGame>>> {
        const preimageKey = GAME_TO_PLAYER_GAMES1_1.preimage(key)
        const pgs = ixa.from(GAME.getState(d, preimageKey, version)).pipe(
            util.filterNoneAsync(),
            diffs.mapItemsAsync(GAME_TO_PLAYER_GAMES1_1)
        )

        return await findItemAsync(pgs, key)
    },

    async getLatestVersionRequest(_d: db.Database, key: Key): Promise<VersionSpecRequest> {
        const preimageKey = GAME_TO_PLAYER_GAMES1_1.preimage(key)

        return {
            docs: [db.serializeDocPath(GAME_TO_PLAYER_AND_GAME_inputSchema, preimageKey)],
            collections: []
        }
    }
}

const PLAYER_AND_GAME_TO_IN: Table<{}> = {
    async getLatestVersionRequest(_d: db.Database, key: Key): Promise<VersionSpecRequest> {
        return {
            docs: [
                db.serializeDocPath(['players', 'games'], key)
            ],
            collections: []
        }
    },
    async getState(d: db.Database, [playerId, gameId]: Key, version: VersionSpec): Promise<Option<Item<{}>>> {
        // NOTE: messing with the VersionSpec is weird, but I'm not sure what the right thing is yet.
        const transposedVersion: VersionSpec = {
            docs: {
                [db.serializeDocPath(['games'], [gameId])]: version.docs[db.serializeDocPath(['players', 'games'], [playerId, gameId])]
            },
            collections: [],
        }

        const maybeGame = option.from(await GAME.getState(d, [gameId], transposedVersion))

        return maybeGame
            .filter(({ value }) => value.players.some(p => p.id === playerId))
            .map(({ key: [itemGameId] }) => item([playerId, itemGameId], {}))
    }
}

async function PLAYER_AND_GAME_TO_IN_getDiffs(d: db.Database, savedAction: SavedAction): Promise<Diff<{}>[]> {
    return Array.from(ix.from(await getGameDiffs(d, savedAction)).pipe(
        diffs.mapDiffs(GAME_TO_PLAYER_AND_GAME),
    ))
}

export const PLAYER_TO_GAMES: Table<model1_1.GameList> = {
    async getLatestVersionRequest(_d: db.Database, key: Key): Promise<VersionSpecRequest> {
        return {
            docs: [],
            collections: [
                db.serializeCollectionPath({ schema: ['players'], key, collectionId: 'games' })
            ]
        }
    },
    getState(d: db.Database, [playerId]: Key, version: VersionSpec): Promise<Option<Item<model1_1.GameList>>> {
        const playerGameVersions = getDocsInCollection(version, { schema: ['players'], key: [playerId], collectionId: 'games' })
        const gamesByPlayer = ixa.from(playerGameVersions).pipe(
            ixaop.map(([pgKey,]) => PLAYER_AND_GAME_TO_IN.getState(d, pgKey, version)),
            util.filterNoneAsync(),
            ixaop.groupBy(({ key: [playerId,] }) => playerId,
                ({ key: [, gameId] }) => gameId,
                (playerId: string, games: Iterable<string>) => item(
                    [playerId],
                    { gameIds: Array.from(ix.from(games).pipe(ixop.orderBy(gameId => gameId))) }
                ))
        );

        return option.fromAsyncIterable(gamesByPlayer)
    }
}

//  async function getGamesForPlayerDiffs(
//     db: db.Database, savedAction: SavedAction): Promise<Diff<{}>[]> {
//     return Array.from(ix.from(await getGameDiffs(db, savedAction)).pipe(
//         diffs.mapDiffs(GAME_TO_PLAYER_AND_GAME)
//     ))
// }

// Key: [playerId, gameId]
// async function getGamesForPlayerShardState(db: db.Database, [playerId, gameId]: Key, verison: VersionSpec): Promise<boolean> {
//     const maybeGame = await GAME.getState(db, [gameId], verison)

//     return ixa.from(GAME.getState(db, verison)).pipe(
//         ixaop.flatMap(({ key, value }) => ixa.from(gameToGamesForPlayer(key, value)))
//     )
// }



//  async function getGameByPlayer1_0Diffs(
//     db: db.Database, action: AnyAction,
//     deps: Record<string, ReferenceGroup>): Promise<Diff<model1_0.PlayerGame>[]> {
//     return Array.from(ix.from(await getGameDiffs(db, action, deps)).pipe(
//         diffs.mapDiffs(gameToPlayerGames1_0)
//     ))
// }

//  function getGamesByPlayer1_0State(db: db.Database, ref: ReferenceGroup): ItemIterable<model1_0.PlayerGame> {
//     return ixa.from(GAME.getState(db, ref)).pipe(
//         util.filterNoneAsync(),
//         ixaop.flatMap(({ key, value }) => ixa.from(gameToPlayerGames1_0(key, value)))
//     )
// }


//  function getGamesByPlayer1_0Placement([playerId, gameId]: Key): string {
//     return `players/${playerId}/games-1.0/${gameId}`
// }


//  function getGamesByPlayer1_1State(db: db.Database, ref: ReferenceGroup): ItemIterable<model1_1.PlayerGame> {
//     return ixa.from(GAME.getState(db, ref)).pipe(
//         util.filterNoneAsync(),
//         ixaop.flatMap(({ key, value }) => ixa.from(gameToPlayerGames1_1(key, value)))
//     )
// }

//  function getGamesByPlayer1_1Placement([playerId, gameId]: Key): string {
//     return `players/${playerId}/games-1.1/${gameId}`
// }

//  async function getGameByPlayer1_1Diffs(
//     db: db.Database, action: AnyAction,
//     deps: Record<string, ReferenceGroup>): Promise<Diff<model1_1.PlayerGame>[]> {
//     return Array.from(ix.from(await getGameDiffs(db, action, deps)).pipe(
//         diffs.mapDiffs(gameToPlayerGames1_1)
//     ))
// }


//  async function GAME.getState(db : db.Database, rg: ReferenceGroup, [gameId]:Key): Promise<Option<Game>> {
//     if (rg.kind === 'none') {
//         return option.none()
//     }
//     if (rg.kind === 'collection') {
//         throw new Error("Game is not a collection")
//     }
//     const {actionId} = rg;

// }

export const REVISION: fw.Integrator<Errors> = {
    async getNeededReferenceIds(_db: db.Database, anyAction: AnyAction): Promise<VersionSpecRequest> {
        return {
            docs: [db.serializeDocPath(['games'], [anyAction.action.gameId])],
            collections: []
        }
    },

    async integrate(d: db.Database, savedAction: SavedAction): Promise<fw.IntegrationResult<Errors>> {
        const gameDiffs = await getGameDiffs(d, savedAction);
        const gamesForPlayerDiffs = await PLAYER_AND_GAME_TO_IN_getDiffs(d, savedAction);
        const result = await getResult(d, savedAction);
        return {
            result,
            impactedReferenceIds: [
                ...gameDiffs.map(({ key }) => db.serializeDocPath(['games'], key)),
                ...gamesForPlayerDiffs.map(({ key }) => db.serializeDocPath(['players', 'games'], key)),
            ]
        }
    }
}

function defaultGame1_1(): Game {
    return {
        state: 'UNSTARTED',
        players: [],
    }
}

function convertAction1_0(a: model1_0.Action): Action {
    switch (a.kind) {
        case 'join_game':
            return {
                kind: 'join_game',
                gameId: a.gameId,
                playerId: a.playerId,
                playerDisplayName: a.playerId,
            }
        case 'start_game':
        case 'make_move':
            return a
    }
}

function convertAction(a: SavedAction): Action {
    switch (a.version) {
        case '1.0':
            return convertAction1_0(a.action)
        case '1.1':
            return a.action
    }
}

function integrateHelper(a: Action, maybeGame: Option<Game>):
    util.Result<Game, Error> {
    const game = option.from(maybeGame).orElse(defaultGame1_1);
    switch (a.kind) {
        case 'join_game':
            if (game.state !== 'UNSTARTED') {
                return result.err({
                    version: '1.0',
                    status: 'GAME_ALREADY_STARTED',
                    status_code: 400,
                    gameId: a.gameId,
                })
            }

            if (game.players.some(p => p.id === a.playerId)) {
                return result.ok(game)
            }
            return result.ok({
                ...game,
                players: [...game.players, {
                    id: a.playerId,
                    displayName: a.playerDisplayName,
                }]
            });

        case 'start_game':
            if (game.state === 'STARTED') {
                return result.ok(game)
            }
            return result.ok({
                state: 'STARTED',
                players: game.players.map(p => ({
                    ...p,
                    submissions: [],
                })),
            })
        case 'make_move':
            return makeMove(maybeGame, a)
    }
}

function makeMove(maybeGame: Option<Game>, action: MakeMoveAction): util.Result<Game, Error> {
    const game = option.from(maybeGame).orElse(defaultGame1_1);
    const playerId = action.playerId

    if (game.state !== 'STARTED') {
        return result.err({
            version: '1.0',
            status: 'GAME_NOT_STARTED',
            status_code: 400,
            gameId: action.gameId,
        })
    }

    const player = findById(game.players, playerId)

    if (player === null) {
        return result.err({
            version: '1.0',
            status: 'PLAYER_NOT_IN_GAME',
            status_code: 403,
            gameId: action.gameId,
            playerId: action.playerId,
        })
    }

    const roundNum = Math.min(...game.players.map(p => p.submissions.length))
    if (player.submissions.length !== roundNum) {
        return result.err({
            version: '1.0',
            status: 'MOVE_PLAYED_OUT_OF_TURN',
            status_code: 400,
            gameId: action.gameId,
            playerId: action.playerId,
        })
    }

    if (roundNum === game.players.length) {
        return result.err({
            version: '1.0',
            status: 'GAME_IS_OVER',
            status_code: 400,
            gameId: action.gameId,
        })
    }

    if (roundNum % 2 === 0 && action.submission.kind === 'drawing') {
        return result.err({
            version: '1.0',
            status: 'INCORRECT_SUBMISSION_KIND',
            status_code: 400,
            wanted: 'word',
            got: 'drawing',
        })
    }
    if (roundNum % 2 === 1 && action.submission.kind === 'word') {
        return result.err({
            version: '1.0',
            status: 'INCORRECT_SUBMISSION_KIND',
            status_code: 400,
            wanted: 'word',
            got: 'drawing',
        })
    }

    return result.ok(produce(game, game => {
        findById(game.players, playerId)!.submissions.push(action.submission)
    }))
}

function findById<T extends { id: string }>(ts: T[], id: string): T | null {
    return ts.find(t => t.id === id) || null
}

const GAME_TO_PLAYER_GAMES1_1: diffs.Mapper<Game, model1_1.PlayerGame> = {
    map([gameId]: Key, game: Game): Iterable<Item<model1_1.PlayerGame>> {
        return ix.from(game.players).pipe(
            ixop.map(({ id }): Item<model1_1.PlayerGame> =>
                item([id, gameId], getPlayerGameExport1_1(game, id)))
        )
    },

    preimage([playerId, gameId]: Key): Key {
        return [gameId]
    }
}

function getPlayerGameExport1_1(game: Game, playerId: string): model1_1.PlayerGame {
    if (game.state === 'UNSTARTED') {
        const sanitizedPlayers: model1_1.ExportedPlayer[] = game.players.map(p => ({
            id: p.id,
            displayName: p.displayName,
        }))
        return {
            state: 'UNSTARTED',
            players: sanitizedPlayers,
        }
    }

    // Repeated because TS isn't smart enough to understand this code works whether 
    // the game is started or not.
    const sanitizedPlayers: model1_1.ExportedPlayer[] = game.players.map(p => ({
        id: p.id,
        displayName: p.displayName,
    }))

    const numPlayers = game.players.length
    const roundNum = Math.min(...game.players.map(p => p.submissions.length))

    // Game is over.
    if (roundNum === numPlayers) {
        const series: model1_0.ExportedSeries[] = game.players.map(() => ({ entries: [] }))
        for (let rIdx = 0; rIdx < numPlayers; rIdx++) {
            for (let pIdx = 0; pIdx < numPlayers; pIdx++) {
                series[(pIdx + rIdx) % numPlayers].entries.push({
                    playerId: game.players[pIdx].id,
                    submission: game.players[pIdx].submissions[rIdx]
                })
            }
        }

        return {
            state: 'GAME_OVER',
            players: sanitizedPlayers,
            series,
        }
    }

    const player = findById(game.players, playerId)!;
    if (player.submissions.length === 0) {
        return {
            state: 'FIRST_PROMPT',
            players: sanitizedPlayers,
        }
    }

    if (player.submissions.length === roundNum) {
        const playerIdx = game.players.findIndex(p => p.id === playerId)
        if (playerIdx === -1) {
            throw new Error('baad')
        }
        const nextPlayerIdx = (playerIdx + 1) % game.players.length
        return {
            state: 'RESPOND_TO_PROMPT',
            players: sanitizedPlayers,
            prompt: game.players[nextPlayerIdx].submissions[roundNum - 1]
        }
    }

    return {
        state: 'WAITING_FOR_PROMPT',
        players: sanitizedPlayers,
    }
}

export const GAME_TO_PLAYER_GAMES1_0: diffs.Mapper<Game, model1_0.PlayerGame> = diffs.composeMappers(GAME_TO_PLAYER_GAMES1_1, {
    map(key: Key, pg: model1_1.PlayerGame): Iterable<Item<model1_0.PlayerGame>> {
        return [item(key, {
            ...pg,
            players: pg.players.map(p => p.id)
        })]
    },
    preimage(key) { return key }
})


const GAME_TO_PLAYER_AND_GAME: diffs.Mapper<Game, {}> = {
    map([gameId]: Key, value: Game): Iterable<Item<{}>> {
        return ix.from(value.players).pipe(
            ixop.map(player => item([player.id, gameId], {}))
        );
    },
    preimage([, gameId]: Key): Key { return [gameId] }
}
const GAME_TO_PLAYER_AND_GAME_inputSchema = ['games']
