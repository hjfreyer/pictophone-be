
import produce from 'immer';
import * as ix from "ix/iterable";
import * as ixop from "ix/iterable/operators";
import * as ixa from "ix/asynciterable";
import * as ixaop from "ix/asynciterable/operators";
import { applyChangesSimple, diffToChange, getActionId, getNewValue, getDocsInCollection, findItem, findItemAsync } from '../base';
import * as db from '../db';
import * as diffs from '../diffs';
import * as fw from '../framework';
import { Item, item, Key, Change, Diff, ItemIterable } from '../interfaces';
import * as model1_0 from '../model/1.0';
import { validate as validate1_0 } from '../model/1.0.validator';
import * as model1_1 from '../model/1.1';
import * as model1_2 from '../model/1.2';
import { Error, Game, Action, MakeMoveAction, ShortCode, StartedGame } from '../model/1.2.0';
import { validate } from '../model/1.2.0.validator';
import { validate as validate1_1 } from '../model/1.1.validator';
import * as util from '../util';
import { Defaultable, Option, option, Result, result } from '../util';
import { OptionData, OptionView } from '../util/option';
import { ResultView } from '../util/result';
import deepEqual from 'deep-equal';
import { UnifiedInterface, } from '..';
import { validate as validateBase } from '../model/base.validator'
import { validate as validateSchema } from '../model/index.validator'
import * as readables from '../readables';
import admin from 'firebase-admin'
import { strict as assert } from 'assert';
import { dirname } from 'path';
import { VersionSpec, VersionSpecRequest, DocVersionSpec } from '../model/base'
import { group } from 'console';

const GAME_SCHEMA = ['games']
const SHORT_CODE_SCHEMA = ['shortCodes']
const GAME_SHORT_CODE_SCHEMA = ['games', 'shortCodes']
const PLAYER_GAME_SCHEMA = ['players', 'games']

const SHORT_CODES_TO_GAME_SCHEMA = ['short-codes-to-games']
const PLAYERS_TO_GAMES_SCHEMA = ['players-to-games']


export type AnyAction = {
    version: '1.0'
    action: model1_0.Action
} | {
    version: '1.1'
    action: model1_1.Action
} | {
    version: '1.2'
    action: model1_2.Action
}

export type SavedAction = AnyAction & { parents: VersionSpec }

export type Errors = {
    '1.0': Result<null, model1_0.Error>,
    '1.1': Result<null, model1_1.Error>,
    '1.2': Result<null, model1_2.Error>,
}

export const REVISION: fw.Integrator<Errors> = {
    async getNeededReferenceIds(_db: db.Database, anyAction: AnyAction): Promise<VersionSpecRequest> {
        const action = convertAction(anyAction)
        const docs = [db.serializeDocPath(GAME_SCHEMA, [action.gameId])];
        if (action.kind === 'create_game' && action.shortCode !== '') {
            return {
                docs,
                collections: [
                    db.serializeDocPath(
                        SHORT_CODE.schema,
                        [action.shortCode])]
            }
        } else {
            return { docs, collections: [] }
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
                    '1.2': result.ok(null),
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
    const shortCodesWithShares = ix.from(SHORT_CODE.getShares(key, game)).pipe(
        ixop.map(({ key }) => db.serializeDocPath(SHORT_CODE.schema, key)),
    )

    const playersToGamesWithShares = ix.from(PLAYERS_TO_GAMES.getShares(key, game)).pipe(
        ixop.map(({ key }) => db.serializeDocPath(PLAYERS_TO_GAMES.schema, key)),
    )

    return [...shortCodesWithShares, ...playersToGamesWithShares]
}

export async function getCollections(d: db.Database, docId: string, actionId: string): Promise<string[]> {
    const { key } = db.parseDocPath(docId);
    const maybeNewGame = option.from(await GAME.getState(d, key, actionId));
    return maybeNewGame.map(newGame => gameToCollections(key, newGame)).orElse(() => [])
}

export async function getFacetExports(d: db.Database, facetId: string, actionId: string): Promise<Record<string, unknown>> {
    const { key } = db.parseDocPath(facetId)
    const maybeGame = await GAME.getState(d, key, actionId)
    if (!maybeGame.data.some) {
        return {}
    }
    const game = maybeGame.data.value;

    const res: Record<string, unknown> = {};
    for await (const { key: subKey, value } of GAME_TO_PLAYER_GAMES1_0.map(key, game)) {
        res[db.serializeDocPath(['players', 'games-1.0'], subKey)] = value
    }

    for await (const { key: subKey, value } of GAME_TO_PLAYER_GAMES1_1.map(key, game)) {
        res[db.serializeDocPath(['players', 'games-1.1'], subKey)] = value
    }
    for await (const { key: subKey, value } of PLAYERS_TO_GAMES.getShares(key, game)) {
        res[db.serializeDocPath(['players-to-games'], subKey)] = value
    }
    return res
}


function toResult<T>(newGameResult: Result<T, Error>): Errors {
    return {
        '1.0': result.from(newGameResult).map(() => null).mapErr(convertError1_0),
        '1.1': result.from(newGameResult).map(() => null).mapErr(convertError1_0),
        '1.2': result.from(newGameResult).map(() => null),
    }
}

async function getGameDiffOrError(d: db.Database, savedAction: SavedAction):
    Promise<Result<Option<Diff<Game>>, Error>> {
    const action = convertAction(savedAction);
    const { gameId } = action;
    const oldGame = await fw.getPrimaryState(d, GAME, [gameId], savedAction.parents)

    const internalIsShortCodeUsed = async (sc: string): Promise<boolean> => {
        const scState = await fw.getAggregatedState(
            d, GAME, SHORT_CODE, [sc], savedAction.parents)

        return scState.data.some
    }

    const res = await helper(action, oldGame, internalIsShortCodeUsed);

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
    },
}

const SHORT_CODE: fw.AggregationTable<Game, ShortCode, ShortCode> = {
    schema: ['short-codes-to-games'],

    getShares([gameId]: Key, game: Game): Iterable<Item<ShortCode>> {
        if (game.state !== 'UNSTARTED' || game.shortCode === '') {
            return []
        }
        return [{ key: [game.shortCode], value: { usedBy: gameId } }]
    },

    aggregateShares(_key: Key, shares: Iterable<ShortCode>): ShortCode {
        const maybeValue = option.fromIterable(shares);
        return maybeValue.unwrap()
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

function convertError1_0(error: Error): model1_0.Error {
    switch (error.status) {
        case 'GAME_NOT_FOUND':
        case 'GAME_ALREADY_EXISTS':
        case 'SHORT_CODE_IN_USE':
            return {
                status: "UNKNOWN",
                status_code: error.status_code,
                error,
            }
        default:
            return error
    }
}

async function helper(a: Action, maybeOldGame: Option<Game>, isShortCodeUsed: (shortCode: string) => Promise<boolean>): Promise<Result<Game, Error>> {
    switch (a.kind) {
        case 'create_game': {
            if (maybeOldGame.data.some) {
                return result.err({
                    status: 'GAME_ALREADY_EXISTS',
                    status_code: 400,
                    gameId: a.gameId,
                })
            }
            if (await isShortCodeUsed(a.shortCode)) {
                return result.err({
                    status: 'SHORT_CODE_IN_USE',
                    status_code: 400,
                    shortCode: a.shortCode,
                })
            }

            // Game doesn't exist, short code is free. We're golden!
            return result.ok({
                state: 'UNSTARTED',
                players: [],
                shortCode: a.shortCode,
            })
        }
        case 'join_game': {
            if (!maybeOldGame.data.some) {
                if (a.createIfNecessary) {
                    return result.ok({
                        state: 'UNSTARTED',
                        players: [{
                            id: a.playerId,
                            displayName: a.playerDisplayName,
                        }],
                        shortCode: '',
                    });

                } else {
                    return result.err({
                        status: 'GAME_NOT_FOUND',
                        status_code: 404,
                        gameId: a.gameId,
                    })
                }
            }
            const game = maybeOldGame.data.value;

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
        }
        case 'start_game':
            if (!maybeOldGame.data.some) {
                return result.err({
                    version: '1.2',
                    status: 'GAME_NOT_FOUND',
                    status_code: 404,
                    gameId: a.gameId,
                })
            }
            const game = maybeOldGame.data.value;

            if (!game.players.some(p => p.id === a.playerId)) {
                return result.err({
                    version: '1.0',
                    status: 'PLAYER_NOT_IN_GAME',
                    status_code: 403,
                    gameId: a.gameId,
                    playerId: a.playerId,
                })
            }

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
            if (!maybeOldGame.data.some || maybeOldGame.data.value.state !== 'STARTED') {
                return result.err({
                    version: '1.0',
                    status: 'GAME_NOT_STARTED',
                    status_code: 400,
                    gameId: a.gameId,
                })
            }

            return makeMove(maybeOldGame.data.value, a)
    }
}

function makeMove(game: StartedGame, action: MakeMoveAction): ResultView<Game, Error> {
    const playerId = action.playerId

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

function convertAction1_0(a: model1_0.Action): Action {
    switch (a.kind) {
        case 'join_game':
            return {
                kind: 'join_game',
                gameId: a.gameId,
                playerId: a.playerId,
                playerDisplayName: a.playerId,
                createIfNecessary: true
            }
        case 'start_game':
        case 'make_move':
            return {
                ...a,
            }
    }
}

function convertAction1_1(a: model1_1.Action): Action {
    switch (a.kind) {
        case 'join_game':
            return {
                kind: 'join_game',
                gameId: a.gameId,
                playerId: a.playerId,
                playerDisplayName: a.playerDisplayName,
                createIfNecessary: true
            }
        case 'start_game':
        case 'make_move':
            return {
                ...a,
            }
    }
}

function convertAction1_2(a: model1_2.Action): Action {
    switch (a.kind) {
        case 'join_game':
            return {
                kind: 'join_game',
                gameId: a.gameId,
                playerId: a.playerId,
                playerDisplayName: a.playerDisplayName,
                createIfNecessary: false
            }
        case 'create_game':
        case 'start_game':
        case 'make_move':
            return a
    }
}

function convertAction(a: AnyAction): Action {
    switch (a.version) {
        case '1.0':
            return convertAction1_0(a.action)
        case '1.1':
            return convertAction1_1(a.action)
        case '1.2':
            return convertAction1_2(a.action)
    }
}

function findById<T extends { id: string }>(ts: T[], id: string): T | null {
    return ts.find(t => t.id === id) || null
}

const GAME_TO_PLAYER_GAMES1_1: fw.Mapper<Game, model1_1.PlayerGame> = {
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

// function gameToPlayerGames1_0(key: Key, value: Game): Iterable<Item<model1_0.PlayerGame>> {
//     return ix.from(gameToPlayerGames1_1(key, value)).pipe(
//         ixop.map(({ key, value: pg }: Item<model1_1.PlayerGame>): Item<model1_0.PlayerGame> => {
//             return item(key, {
//                 ...pg,
//                 players: pg.players.map(p => p.id)
//             })
//         }),
//     );
// }
export const GAME_TO_PLAYER_GAMES1_0: fw.Mapper<Game, model1_0.PlayerGame> = fw.composeMappers(GAME_TO_PLAYER_GAMES1_1, {
    map(key: Key, pg: model1_1.PlayerGame): Iterable<Item<model1_0.PlayerGame>> {
        return [item(key, {
            ...pg,
            players: pg.players.map(p => p.id)
        })]
    },
    preimage(key) { return key }
})

export const COLLECTION_SCHEMATA = [
    SHORT_CODE.schema,
    PLAYERS_TO_GAMES.schema
]
