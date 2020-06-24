
import produce from 'immer';
import * as ix from "ix/iterable";
import * as ixop from "ix/iterable/operators";
import * as ixa from "ix/asynciterable";
import * as ixaop from "ix/asynciterable/operators";
import { applyChangesSimple, diffToChange } from '../base';
import * as db from '../db';
import * as diffs from '../diffs';
import * as fw from '../framework';
import { Item, item, Key, Change, Diff } from '../interfaces';
import * as model1_0 from '../model/1.0';
import { validate as validate1_0 } from '../model/1.0.validator';
import * as model1_1 from '../model/1.1';
import { Error, Game, Action, MakeMoveAction } from '../model/1.1.1';
import { validate } from '../model/1.1.1.validator';
import { validate as validate1_1 } from '../model/1.1.validator';
import { AnyAction, ReferenceGroup, SavedAction } from '../model';
import * as util from '../util';
import { Defaultable, Option, option, Result, result } from '../util';
import { OptionData } from '../util/option';
import deepEqual from 'deep-equal';
import { UnifiedInterface } from '..';
import { validate as validateSchema } from '../model/index.validator'
import { dirname } from 'path';

export async function getAction(db: db.Database, actionId: string): Promise<Option<SavedAction>> {
    const data = await db.getRaw(actionId);
    return option.from(data).map(validateSchema('SavedAction'))
}

export async function getCurrentRefGroup(db: db.Database, refId: string): Promise<ReferenceGroup> {
    if (refId.endsWith("/*")) {
        const res: ReferenceGroup = {
            kind: 'collection',
            id: dirname(refId),
            members: {},
        }

        const collection = await db.tx.get(db.db.collection(dirname(refId)));
        for (const doc of collection.docs) {
            const ptr = validateSchema('Pointer')(doc.data())
            res.members[doc.id] = {
                kind: 'single',
                actionId: ptr.actionId,
            }
        }
        return res;
    } else {
        return option.from(await db.getRaw(refId))
            .map(validateSchema('Pointer'))
            .map((p): ReferenceGroup => ({ kind: 'single', actionId: p.actionId }))
            .orElse(() => ({ kind: 'none' }))
    }
}

export function gameKeyToRefId([gameId]: Key): string {
    return `games/${gameId}`
}

export function gameByPlayer1_0KeyToRefId([, gameId]: Key): string {
    return `games/${gameId}`
}

export function gameByPlayer1_1KeyToRefId([, gameId]: Key): string {
    return `games/${gameId}`
}

export function getNeededReferenceIds(action: AnyAction): string[] {
    return [`games/${action.gameId}`]
}

// export function gameByPlayer1_0NeededReferenceIds(action: AnyAction): string[] {
//     return [`games/${action.gameId}`]
// }

// export function gameByPlayer1_1NeededReferenceIds(action: AnyAction): string[] {
//     return [`games/${action.gameId}`]
// }

export async function getGameDiffs(db: db.Database, action: AnyAction, deps: Record<string, ReferenceGroup>): Promise<Diff<Game>[]> {
    const { gameId } = action;
    const oldGameRef = option.of(deps[`games/${gameId}`]).unwrap()
    const oldGame = await getGameState(db, oldGameRef, [gameId]);

    const newGameResult = integrateHelper(convertAction(action), oldGame);
    return result.from(newGameResult)
        .map((newGame: Game): Diff<Game>[] =>
            diffs.newDiff2([gameId], oldGame, option.some(newGame)).diffs)
        .orElse(() => [])
}

export async function getGameState(db: db.Database, ref: ReferenceGroup, [gameId]: Key): Promise<Option<Game>> {
    if (ref.kind === 'none') {
        return option.none()
    }
    if (ref.kind === 'collection') {
        throw new Error("Game is not a collection")
    }

    const savedAction = option.from(await getAction(db, ref.actionId)).unwrap();

    const gameDiffs = await getGameDiffs(db, savedAction.action, savedAction.parents);
    const gameDiff = gameDiffs.find(({ key: [diffGameId] }) => diffGameId === gameId);

    if (gameDiff === undefined) {
        throw new Error(`Action "${ref.actionId}" does not impact game "${gameId}"`);
    }

    return getNewValue(gameDiff)
}


export async function getGameByPlayer1_0Diffs(
    db: db.Database, action: AnyAction,
    deps: Record<string, ReferenceGroup>): Promise<Diff<model1_0.PlayerGame>[]> {
    return Array.from(ix.from(await getGameDiffs(db, action, deps)).pipe(
        diffs.mapDiffs(gameToPlayerGames1_0)
    ))
}

export async function getGameByPlayer1_1Diffs(
    db: db.Database, action: AnyAction,
    deps: Record<string, ReferenceGroup>): Promise<Diff<model1_1.PlayerGame>[]> {
    return Array.from(ix.from(await getGameDiffs(db, action, deps)).pipe(
        diffs.mapDiffs(gameToPlayerGames1_1)
    ))
}

function getNewValue<T>(d: Diff<T>): Option<T> {
    switch (d.kind) {
        case "add":
            return option.some(d.value)
        case "delete":
            return option.none()
        case "replace":
            return option.some(d.newValue)
    }
}

// export async function getGameState(db : db.Database, rg: ReferenceGroup, [gameId]:Key): Promise<Option<Game>> {
//     if (rg.kind === 'none') {
//         return option.none()
//     }
//     if (rg.kind === 'collection') {
//         throw new Error("Game is not a collection")
//     }
//     const {actionId} = rg;

// }

// export const REVISION: fw.Revision2<State> = {
//     id: '1.1.1',
//     validateAnnotation: validate('Annotation2'),

//     async integrate(action: AnyAction, inputs: fw.Input2<State>): Promise<fw.IntegrationResult2<State>> {
//         const gameParent = await inputs.getParent(`game:${action.gameId}`);
//         const oldGame = option.from(gameParent).map(s => result.fromData(s.game).unwrap());

//         const newGameResult = integrateHelper(convertAction(action), oldGame);

//         return result.from(newGameResult).split({
//             onErr: (err): fw.IntegrationResult2<State> => ({
//                 labels: [],
//                 state: { game: newGameResult.data }
//             }),
//             onOk: (newGame): fw.IntegrationResult2<State> => {
//                 return {
//                     labels: [`game:${action.gameId}`],
//                     state: { game: result.ok<Game, Error>(newGame).data }
//                 }
//             }
//         })
//     },

//     // async activateFacet(db: db.Database, label: string, maybeOldGame: OptionData<Game>, newGame: OptionData<Game>): Promise<void> {
//     //     const oldGame = option.fromData(maybeOldGame).withDefault(defaultGame1_1);

//     //     const gameDiff = diffs.newDiff([label], oldGame, option.fromData(newGame).withDefault(defaultGame1_1));

//     //     const gamesByPlayer1_0Diffs = diffs.from(gameDiff).map(gameToPlayerGames1_0).diffs;
//     //     const gamesByPlayer1_1Diffs = diffs.from(gameDiff).map(gameToPlayerGames1_1).diffs

//     //     const gamesByPlayer1_0 = db.open({
//     //         schema: ['players', 'games-gamesByPlayer-1.0'],
//     //         validator: validate1_0('PlayerGame'),
//     //     })
//     //     const gamesByPlayer1_1 = db.open({
//     //         schema: ['players', 'games-gamesByPlayer-1.1'],
//     //         validator: validate1_1('PlayerGame'),
//     //     })

//     //     applyChangesSimple(gamesByPlayer1_0, gamesByPlayer1_0Diffs.map(diffToChange));
//     //     applyChangesSimple(gamesByPlayer1_1, gamesByPlayer1_1Diffs.map(diffToChange))
//     // }
// }


// export function getUnifiedInterface(gameId: string, state: State): UnifiedInterface {
//     return {
//         '1.0': result.fromData(state.game).map(game => ({
//             playerGames: ix.toArray(gameToPlayerGames1_0([gameId], game))
//         })).data,
//         '1.1': result.fromData(state.game).map(game => ({
//             playerGames: ix.toArray(gameToPlayerGames1_1([gameId], game))
//         })).data,
//     }
// }

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
            return {
                ...a,
            }
    }
}

function convertAction(a: AnyAction): Action {
    switch (a.version) {
        case '1.0':
            return convertAction1_0(a)
        case '1.1':
            return a
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

function gameToPlayerGames1_1([gameId]: Key, game: Game): Iterable<Item<model1_1.PlayerGame>> {
    return ix.from(game.players).pipe(
        ixop.map(({ id }): Item<model1_1.PlayerGame> =>
            item([id, gameId], getPlayerGameExport1_1(game, id)))
    )
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

function gameToPlayerGames1_0(key: Key, value: Game): Iterable<Item<model1_0.PlayerGame>> {
    return ix.from(gameToPlayerGames1_1(key, value)).pipe(
        ixop.map(({ key, value: pg }: Item<model1_1.PlayerGame>): Item<model1_0.PlayerGame> => {
            return item(key, {
                ...pg,
                players: pg.players.map(p => p.id)
            })
        }),
    );
}
