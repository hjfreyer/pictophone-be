
import produce from 'immer';
import * as ix from "ix/iterable";
import * as ixop from "ix/iterable/operators";
import * as ixa from "ix/asynciterable";
import * as ixaop from "ix/asynciterable/operators";
import { applyChangesSimple, diffToChange, getActionId } from '../base';
import * as db from '../db';
import * as diffs from '../diffs';
import * as fw from '../framework';
import { Item, item, Key, Change, Diff } from '../interfaces';
import * as model1_0 from '../model/1.0';
import { validate as validate1_0 } from '../model/1.0.validator';
import * as model1_1 from '../model/1.1';
import { Error, Game, Action, MakeMoveAction, ShortCode, StartedGame, State } from '../model/1.2.0';
import { validate } from '../model/1.2.0.validator';
import { validate as validate1_1 } from '../model/1.1.validator';
import { AnyAction, SavedAction } from '../schema';
import * as util from '../util';
import { Defaultable, Option, option, Result, result } from '../util';
import { OptionData, OptionView } from '../util/option';
import { ResultView } from '../util/result';
import deepEqual from 'deep-equal';
import { UnifiedInterface } from '..';
import { validate as validateSchema } from '../schema/interfaces.validator'
import * as readables from '../readables';

type IntegrationResult =
    fw.IntegrationResult2<State>;

type MaybeLiveAction = {
    kind: 'live'
    action: Action
} | {
    kind: 'replay'
    actionId: string
}

export async function commitAction(db: db.Database, anyAction: AnyAction): Promise<SavedAction> {
    const action = convertAction(anyAction)
    const res = await getNewGameOrError(db, { kind: 'live', action: action })
    const parentList = await ixa.toArray(ixa.from(res.labelsQueried).pipe(
        ixaop.map(label => getParent(db, { kind: 'live', action }, label)),
        util.filterNoneAsync(),
        ixaop.orderBy(actionId => actionId)
    ))

    const facets = await getFacets(db, { kind: 'live', action })

    const actionsTable = db.open({
        schema: ['actions'],
        validator: validateSchema('SavedAction')
    })

    const savedAction: SavedAction = { parents: parentList, action: anyAction };
    const actionId = getActionId(savedAction);

    actionsTable.set([actionId], savedAction)
    // annotationsTable.set([actionId], { labels, parents: labelToParent, state })
    // const oldStates: Record<string, Option<TState>> = {};

    const labelsTable = db.open({
        schema: [`labels-1.2.0`],
        validator: validateSchema('Reference')
    })
    for (const label of facets) {
        // const oldFetched = option.of(ix.find(fetched, f => f.label === label)).expect("No blind writes");
        //oldStates[label] = oldFetched.state;
        labelsTable.set([label], { actionId });
    }

    return savedAction
}


export async function getAction(db: db.Database, actionId: string): Promise<Option<SavedAction>> {
    return await readables.getOption(db.open({
        schema: ['actions'],
        validator: validateSchema('SavedAction')
    }), [actionId])
}

export async function getParent(db: db.Database, action: MaybeLiveAction, facetId: string): Promise<Option<string>> {
    if (action.kind === 'live') {
        const labelsTable = db.open({
            schema: [`labels-1.2.0`],
            validator: validateSchema('Reference')
        })
        return option.from(await readables.getOption(labelsTable, [facetId])).map(x => x.actionId)
    } else {
        const savedAction = option.from(await getAction(db, action.actionId)).unwrap();

        const orderedParentsWithFacets = ixa.from(savedAction.parents).pipe(
            ixaop.orderByDescending(actionId => actionId),
            ixaop.map(async actionId => ({ actionId, facets: await getFacets(db, { kind: 'replay', actionId }) }))
        )

        return option.of(await ixa.first(orderedParentsWithFacets, ({ facets }) => facets.indexOf(facetId) !== -1)).map(
            x => x.actionId
        )
    }
}

export async function getNewGameOrError(db: db.Database, maybeAction: MaybeLiveAction): Promise<IntRes> {
    const action = maybeAction.kind === 'live'
        ? maybeAction.action
        : convertAction(option.from(await getAction(db, maybeAction.actionId)).unwrap().action);

    const gameParentId = await getParent(db, maybeAction, `game:${action.gameId}`);
    const oldGame = await option.from(gameParentId).andThenAsync(
        actionId => getGameState(db, { kind: 'replay', actionId }, action.gameId))

    const queried = [`game:${action.gameId}`]

    const internalIsShortCodeUsed = async (sc: string): Promise<boolean> => {
        queried.push(`shortCode:${sc}`);
        const shortCodeParent = await getParent(db, maybeAction, `shortCode:${sc}`);
        return (await option.from(shortCodeParent).andThenAsync(
            actionId => getShortCodeState(db, { kind: 'replay', actionId }, sc)
        )).data.some;
    }

    const res = await helper(action, oldGame, internalIsShortCodeUsed);

    return {
        labelsQueried: queried,
        gameId: action.gameId,
        oldGame,
        newGame: res
    };
}

export interface IntRes {
    labelsQueried: string[]
    gameId: string
    oldGame: Option<Game>
    newGame: Result<Game, Error>
}

export async function getGameDiffs(db: db.Database, maybeAction: MaybeLiveAction): Promise<Diff<Game>[]> {
    const { gameId, oldGame, newGame } = await getNewGameOrError(db, maybeAction)

    return result.from(newGame).map(newGame => diffs.newDiff2([gameId], oldGame, option.some(newGame)).diffs).orElse(() => [])
}

export async function getGameState(db: db.Database, action: MaybeLiveAction, gameId: string): Promise<Option<Game>> {
    // Illegal to call for an action that doesn't touch the state.
    const diff = option.of(ix.find(await getGameDiffs(db, action),
        ({ key: [diffGameId] }) => diffGameId === gameId)).unwrap();

    switch (diff.kind) {
        case 'add':
            return option.some(diff.value)
        case 'replace':
            return option.some(diff.newValue)
        case 'delete':
            return option.none()
    }
}

// async function getGameStates(actionId : Option<string>, action: Action): Promise<Item<Game>[]> {
//     return Array.from(ix.from(await getGameDiffs(actionId, action)).pipe(
//         ixop.flatMap(diff => {
//             switch (diff.kind) {
//                 case 'add':
//                     return [{key: diff.key, value: diff.value}]
//                 case 'replace':
//                     return [{key: diff.key, value: diff.newValue}]
//                 case 'delete':
//                     return []
//             }
//         })
//     ));
// }

export async function getShortCodeDiffs(db: db.Database, action: MaybeLiveAction): Promise<Diff<ShortCode>[]> {
    return Array.from(ix.from(await getGameDiffs(db, action)).pipe(
        diffs.mapDiffs(gameToShortCodes)
    ))
}

export async function getShortCodeState(db: db.Database, action: MaybeLiveAction, shortCode: string): Promise<Option<ShortCode>> {
    // Illegal to call for an action that doesn't touch the state.
    const diff = option.of(ix.find(await getShortCodeDiffs(db, action),
        ({ key: [diffId] }) => diffId === shortCode)).unwrap();

    switch (diff.kind) {
        case 'add':
            return option.some(diff.value)
        case 'replace':
            return option.some(diff.newValue)
        case 'delete':
            return option.none()
    }
}


export async function getFacets(db: db.Database, action: MaybeLiveAction): Promise<string[]> {
    const gameFacets = (await getGameDiffs(db, action)).map(({ key: [sc] }) => `game:${sc}`)
    const scFacets = (await getShortCodeDiffs(db, action)).map(({ key: [sc] }) => `shortCode:${sc}`)
    return [...gameFacets, ...scFacets]
}

// async function getShortCodeStates(actionId : Option<string>, action: Action): Promise<Item<ShortCode>[]> {
//     return Array.from(ix.from(await getShortCodeDiffs(actionId, action)).pipe(
//         ixop.flatMap(diff => {
//             switch (diff.kind) {
//                 case 'add':
//                     return [{key: diff.key, value: diff.value}]
//                 case 'replace':
//                     return [{key: diff.key, value: diff.newValue}]
//                 case 'delete':
//                     return []
//             }
//         })
//     ));
// }


async function getGame(inputs: fw.Input2<State>, gameId: string): Promise<OptionView<Game>> {
    return option.from(await inputs.getParent(`game:${gameId}`))
        .map(state => result.fromData(state.game).unwrap())
}

// function setGame(States: Record<string, OptionData<State>>, gameId: string, game: Option<Game>): void {
//     States[`game:${gameId}`] = game.data;
// }

async function isShortCodeUsed(inputs: fw.Input2<State>, shortCodeId: string): Promise<boolean> {
    return option.from(await inputs.getParent(`shortCode:${shortCodeId}`))
        .map(state => {
            const game = result.fromData(state.game).unwrap();
            return game.state === 'UNSTARTED' && game.shortCode === shortCodeId;
        }).orElse(() => false)
}

// function setShortCode(States: Record<string, OptionData<State>>, shortCodeId: string, sc: Option<ShortCode>): void {
//     States[`shortCode:${shortCodeId}`] = sc.data;
// }

export const REVISION: fw.Revision2<State> = {
    id: '1.2.0',
    validateAnnotation: validate('Annotation2'),

    async integrate(anyAction: AnyAction, inputs: fw.Input2<State>): Promise<IntegrationResult> {
        const maybeOldGame = await getGame(inputs, anyAction.gameId);

        const res = await helper(convertAction(anyAction), maybeOldGame, sc => isShortCodeUsed(inputs, sc));
        if (res.data.status === 'err') {
            return { labels: [], state: { game: res.data } }
        }
        const newGame = res.data.value;

        const oldShortCode = maybeOldGame.andThen(oldGame => {
            return oldGame.state === 'UNSTARTED' && oldGame.shortCode !== ""
                ? option.some(oldGame.shortCode)
                : option.none<string>()
        })
        const newShortCode = newGame.state === 'UNSTARTED' && newGame.shortCode !== ""
            ? option.some(newGame.shortCode)
            : option.none<string>()

        const labels: string[] = [`game:${anyAction.gameId}`];

        if (!deepEqual(oldShortCode.data, newShortCode.data)) {
            const changedShortCodes = ix.toArray(ix.of(oldShortCode, newShortCode).pipe(util.filterNone()))
            await Promise.all(changedShortCodes.map(sc => isShortCodeUsed(inputs, sc)))
            labels.push(...changedShortCodes.map(sc => `shortCode:${sc}`));
        }

        return { labels, state: { game: result.ok<Game, Error>(newGame).data } }
    },

    // async activateState(db: db.Database, label: string, maybeOldGame: OptionData<State>, newGame: OptionData<State>): Promise<void> {
    //     // const oldGame = option.fromData(maybeOldGame).withDefault(defaultGame1_1);

    //     // const gameDiff = diffs.newDiff([label], oldGame, option.fromData(newGame).withDefault(defaultGame1_1));

    //     // const gamesByPlayer1_0Diffs = diffs.from(gameDiff).map(gameToPlayerGames1_0).diffs;
    //     // const gamesByPlayer1_1Diffs = diffs.from(gameDiff).map(gameToPlayerGames1_1).diffs

    //     // const gamesByPlayer1_0 = db.open({
    //     //     schema: ['players', 'games-gamesByPlayer-1.0'],
    //     //     validator: validate1_0('PlayerGame'),
    //     // })
    //     // const gamesByPlayer1_1 = db.open({
    //     //     schema: ['players', 'games-gamesByPlayer-1.1'],
    //     //     validator: validate1_1('PlayerGame'),
    //     // })

    //     // applyChangesSimple(gamesByPlayer1_0, gamesByPlayer1_0Diffs.map(diffToChange));
    //     // applyChangesSimple(gamesByPlayer1_1, gamesByPlayer1_1Diffs.map(diffToChange))
    // }
}

function convertError1_0(err: Error): model1_0.Error {
    switch (err.version) {
        case '1.0':
            return err
        case '1.2':
            return {
                version: 'UNKNOWN',
                true_version: err.version,
                status: "UNKNOWN ERROR",
                status_code: err.status_code,
            }
    }
}

function convertError1_1(err: Error): model1_1.Error {
    return convertError1_0(err)
}

export function getUnifiedInterface(gameId: string, state: State): UnifiedInterface {
    return {
        '1.0': result.fromData(state.game).map(game => ({
            playerGames: ix.toArray(gameToPlayerGames1_0([gameId], game))
        })).mapErr(convertError1_0).data,
        '1.1': result.fromData(state.game).map(game => ({
            playerGames: ix.toArray(gameToPlayerGames1_1([gameId], game))
        })).mapErr(convertError1_1).data,
    }
}

function gameToShortCodes(gameId: Key, game: Game): Item<ShortCode>[] {
    if (game.state !== 'UNSTARTED' || game.shortCode === '') {
        return []
    }
    return [{ key: [game.shortCode], value: {} }]
}

async function helper(a: Action, maybeOldGame: Option<Game>, isShortCodeUsed: (shortCode: string) => Promise<boolean>): Promise<ResultView<Game, Error>> {

    switch (a.kind) {
        case 'create_game': {
            if (maybeOldGame.data.some) {
                return result.err({
                    version: '1.2',
                    status: 'GAME_ALREADY_EXISTS',
                    status_code: 400,
                    gameId: a.gameId,
                })
            }
            if (await isShortCodeUsed(a.shortCode)) {
                return result.err({
                    version: '1.2',
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
                        version: '1.2',
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

// function defaultGame1_1(): Game {
//     return {
//         state: 'UNSTARTED',
//         players: [],
//     }
// }

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

function convertAction(a: AnyAction): Action {
    switch (a.version) {
        case '1.0':
            return convertAction1_0(a)
        case '1.1':
            return convertAction1_1(a)
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
