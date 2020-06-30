
import produce from 'immer';
import * as ixa from "ix/asynciterable";
import * as ixaop from "ix/asynciterable/operators";
import * as ix from "ix/iterable";
import * as ixop from "ix/iterable/operators";
import { Errors } from '..';
import { findItemAsync, getNewValue, getDocsInCollection } from '../base';
import * as db from '../db';
import * as diffs from '../diffs';
import * as fw from '../framework';
import { Diff, Item, item, Key, ItemIterable } from '../interfaces';
import { AnyAction, SavedAction } from '../model';
import * as model1_0 from '../model/1.0';
import * as model1_1 from '../model/1.1';
import { Action, Error, Game, MakeMoveAction } from '../model/1.1.1';
import { DocVersionSpec, VersionSpec, VersionSpecRequest } from '../model/base';
import * as util from '../util';
import { Option, option, Result, result } from '../util';
import { OperatorAsyncFunction } from 'ix/interfaces';

const GAME_SCHEMA = ['games']


export const REVISION: fw.Integrator<Errors> = {
    async getNeededReferenceIds(_db: db.Database, anyAction: AnyAction): Promise<VersionSpecRequest> {
        return {
            docs: [db.serializeDocPath(['games'], [anyAction.action.gameId])],
            collections: []
        }
    },

    async integrate(d: db.Database, savedAction: SavedAction): Promise<fw.IntegrationResult<Errors>> {
        const gameDiffOrError = result.from(await getGameDiffOrError(d, savedAction));
        if (gameDiffOrError.data.status === 'err') {
            return {
                result: toResult(gameDiffOrError),
                facetDiffs: {},
            }
        }
        const maybeDiff = gameDiffOrError.data.value;
        if (!maybeDiff.data.some) {
            return {
                result: {
                    '1.0': result.ok(null),
                    '1.1': result.ok(null),
                },
                facetDiffs: {},
            }
        }
        const diff = maybeDiff.data.value;
        const gameDocPath = db.serializeDocPath(GAME_SCHEMA, diff.key)
        return {
            result: toResult(gameDiffOrError),
            facetDiffs: {
                [gameDocPath]: fw.diffCollections(diff, gameToCollections)
            }
        }
    }
}

function gameToCollections(key: Key, game: Game): string[] {
    const playersToGamesWithShares = ix.from(PLAYERS_TO_GAMES.getShares(key, game)).pipe(
        ixop.map(({ key }) => db.serializeDocPath(PLAYERS_TO_GAMES.schema, key)),
    )

    return [...playersToGamesWithShares]
}

export async function getCollections(d: db.Database, docId: string, actionId: string): Promise<string[]> {
    const { key } = db.parseDocPath(docId);
    const maybeNewGame = option.from(await GAME.getState(d, key, actionId));
    return maybeNewGame.map(newGame => gameToCollections(key, newGame)).orElse(() => [])
}

function toResult<T>(newGameResult: Result<T, Error>): Errors {
    return {
        '1.0': result.from(newGameResult).map(() => null),
        '1.1': result.from(newGameResult).map(() => null),
        // '1.2': result.from(newGameResult).map(() => null),
    }
}

async function getGameDiffOrError(d: db.Database, savedAction: SavedAction):
    Promise<Result<Option<Diff<Game>>, Error>> {
    const action = convertAction(savedAction);
    const { gameId } = action;
    const oldGame = await fw.getPrimaryState(d, GAME, [gameId], savedAction.parents)

    const res = await integrateHelper(action, oldGame);

    return result.from(res)
        .map(newGame => diffs.newDiff([gameId], oldGame, option.some(newGame)))
}

const GAME: fw.PrimaryTable<Game> = {
    schema: ['games'],
    async getState(d: db.Database, key: Key, actionId: string): Promise<Option<Game>> {
        const savedAction = option.from(await fw.getAction(d, actionId)).unwrap();

        const maybeGameDiff = result.from(await getGameDiffOrError(d, savedAction)).unwrap();
        const gameDiff = option.from(maybeGameDiff).unwrap()
        if (util.lexCompare(gameDiff.key, key) !== 0) {
            throw new Error("Bad action ID")
        }
        return option.from(getNewValue(gameDiff)).map(item => item.value)

    }
}

const PLAYERS_TO_GAMES: fw.AggregationTable<Game, string, model1_1.GameList> = {
    schema: ['players-to-games'],
    getShares([gameId]: Key, game: Game): Iterable<Item<string>> {
        return ix.from(game.players).pipe(ixop.map(p => item([p.id], gameId)))
    },
    aggregateShares(_key: Key, shares: Iterable<string>): model1_1.GameList {
        return {
            gameIds: Array.from(shares)
        }
    }
}

export const LIVE_PLAYERS_TO_GAMES: fw.LiveTable<model1_1.GameList> = fw.liveAggregatedTable(
    GAME, PLAYERS_TO_GAMES);

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


export const PLAYER_GAMES1_0: fw.LiveTable<model1_0.PlayerGame> = fw.liveMappedTable(
    fw.livePrimaryTable(GAME), GAME_TO_PLAYER_GAMES1_0
)

export const PLAYER_GAMES1_1: fw.LiveTable<model1_1.PlayerGame> = fw.liveMappedTable(
    fw.livePrimaryTable(GAME), GAME_TO_PLAYER_GAMES1_1
)

export const COLLECTION_SCHEMATA = [
    PLAYERS_TO_GAMES.schema
]
