
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
import * as model1_2 from '../model/1.2';
import { Error, Game, Action, MakeMoveAction, ShortCode, StartedGame } from '../model/1.2.0';
import { validate } from '../model/1.2.0.validator';
import { validate as validate1_1 } from '../model/1.1.validator';
import { AnyAction, SavedAction } from '../model';
import * as util from '../util';
import { Defaultable, Option, option, Result, result } from '../util';
import { OptionData, OptionView } from '../util/option';
import { ResultView } from '../util/result';
import deepEqual from 'deep-equal';
import { UnifiedInterface } from '..';
import { ReferenceGroup } from '../model';
import { validate as validateSchema } from '../model/index.validator'
import * as readables from '../readables';
import admin from 'firebase-admin'
import { strict as assert } from 'assert';


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

    console.log(JSON.stringify(res.newGame, undefined, 2))

    const affectedFacets = await getEffectedFacets(db, { kind: 'live', action })

    const savedAction: SavedAction = { parents: res.parents, action: anyAction };
    const actionId = getActionId(savedAction);

    db.tx.set(db.db.doc(actionId), savedAction)

    for (const label of affectedFacets) {
        if (label.length === 1) {

            const [facetId] = label;
            const ref: ReferenceGroup = {
                kind: 'leaf',
                actionId,
            }
            const labelPath = `labels-1.2.0/${facetId}`
            db.tx.set(db.db.doc(labelPath), ref)
        } else if (label.length === 2) {
            const [first, second] = label;
            const labelPath = `labels-1.2.0/${first}`
            const ref: ReferenceGroup = {
                kind: 'node',
                subfacets: {
                    [second]: { kind: 'leaf', actionId }
                }
            }
            db.tx.set(db.db.doc(labelPath), ref, { merge: true })
        } else {
            throw new Error('wtf')
        }
    }

    return savedAction
}


export async function getAction(db: db.Database, actionId: string): Promise<Option<SavedAction>> {
    const data = await db.getRaw(actionId);
    return option.from(data).map(validateSchema('SavedAction'))
}

export async function getParents(db: db.Database, action: MaybeLiveAction, facetId: string): Promise<ReferenceGroup> {
    if (action.kind === 'live') {
        const labelsTable = db.open({
            schema: [`labels-1.2.0`],
            validator: validateSchema('ReferenceGroup')
        })
        return option.from(await readables.getOption(labelsTable, [facetId])).orElse(() => ({ kind: 'nil' }))
    } else {
        const savedAction = option.from(await getAction(db, action.actionId)).unwrap();
        return option.of(savedAction.parents[facetId]).expect("Illegal parent get");
    }
}

export async function getSingleParent(db: db.Database, maybeAction: MaybeLiveAction, facetId: string): Promise<Option<string>> {
    return extractSingleParent(await getParents(db, maybeAction, facetId));
}

export function extractSingleParent(rg: ReferenceGroup): Option<string> {
    switch (rg.kind) {
        case 'nil':
            return option.none()
        case 'leaf':
            return option.some(rg.actionId)
        case 'node':
            throw new Error("facet may only have a single head")

    }
}

export async function getNewGameOrError(db: db.Database, maybeAction: MaybeLiveAction): Promise<IntRes> {
    const action = maybeAction.kind === 'live'
        ? maybeAction.action
        : convertAction(option.from(await getAction(db, maybeAction.actionId)).unwrap().action);

    const parents: Record<string, ReferenceGroup> = {}
    parents[`game:${action.gameId}`] = await getParents(db, maybeAction, `game:${action.gameId}`)

    const oldGame = await getGameState(db, parents[`game:${action.gameId}`], action.gameId);

    const internalIsShortCodeUsed = async (sc: string): Promise<boolean> => {
        parents[`shortCode:${sc}`] = await getParents(db, maybeAction, `shortCode:${sc}`)
        return (await getShortCodeState(db, parents[`shortCode:${sc}`], sc)).data.some
    }

    const res = await helper(action, oldGame, internalIsShortCodeUsed);

    return {
        parents,
        gameId: action.gameId,
        oldGame,
        newGame: res
    };
}

export interface IntRes {
    parents: Record<string, ReferenceGroup>,
    gameId: string
    oldGame: Option<Game>
    newGame: Result<Game, Error>
}

export async function getGameDiffs(db: db.Database, maybeAction: MaybeLiveAction): Promise<Diff<Game>[]> {
    const { gameId, oldGame, newGame } = await getNewGameOrError(db, maybeAction)

    return result.from(newGame).map(newGame => diffs.newDiff2([gameId], oldGame, option.some(newGame)).diffs).orElse(() => [])
}

export async function getGameState(db: db.Database, ref: ReferenceGroup, gameId: string): Promise<Option<Game>> {
    if (ref.kind === "nil") {
        return option.none()
    }
    if (ref.kind === 'node') {
        throw new Error("GameState is not an aggregation")
    }
    const { gameId: newGameId, newGame } = await getNewGameOrError(db, { kind: 'replay', actionId: ref.actionId })

    if (gameId !== newGameId) {
        throw new Error(`Action "${ref.actionId}" impacts game "${newGameId}", not "${gameId}"`)
    }
    if (newGame.data.status === 'err') {
        throw new Error(`Action "${ref.actionId}" yields an error, not a game: ${JSON.stringify(newGame.data.error)}"`)
    }
    return option.some(newGame.data.value);
}

function gameToPlayerToMemberGames([gameId]: Key, game: Game): Item<{}>[] {
    return Array.from(ix.from(game.players).pipe(
        ixop.map(p => ({ key: [p.id, gameId], value: {} }))
    ));
}

function gameToShortCodeFragments([gameId]: Key, game: Game): Item<{}>[] {
    if (game.state !== 'UNSTARTED' || game.shortCode === '') {
        return []
    }
    return [{ key: [game.shortCode, gameId], value: {} }]
}

function aggregateShortCodeFragments(fragments: Iterable<Item<{}>>): Iterable<Item<{}>> {
    return ix.from(fragments).pipe(
        ixop.groupBy(
            ({ key: [shortCodeId,] }) => shortCodeId,
            item => item,
            (shortCodeId: string, fragments: Iterable<Item<{}>>): Iterable<Item<{}>> => {
                return ix.isEmpty(fragments) ? ix.empty() : ix.of(item([shortCodeId], {}))
            }
        ),
        ixop.concatAll()
    )
}

export async function getShortCodeState(db: db.Database, ref: ReferenceGroup, shortCodeId: string): Promise<Option<ShortCode>> {
    if (ref.kind === "nil") {
        return option.none()
    }
    if (ref.kind === 'leaf') {
        throw new Error("ShortCode is an aggregation")
    }

    const gameStates = ixa.from(Object.entries(ref.subfacets)).pipe(
        ixaop.map(async ([subFacetId, subFacetRef]) => {
            if (!subFacetId.startsWith("game:")) {
                throw new Error(`bogus subfacet: ${subFacetId}`)
            }
            const gameId = subFacetId.replace("game:", "")
            return { key: [gameId], value: option.from(await getGameState(db, subFacetRef, gameId)).expect("Why was there a nil ref in a node?") }
        })
    )
    const shortCodeFragmentStates = await ixa.toArray(gameStates.pipe(
        ixaop.flatMap(({ key, value: game }) => ixa.from(gameToShortCodeFragments(key, game)))
    ))
    const shortCodeStates = Array.from(aggregateShortCodeFragments(shortCodeFragmentStates))
    if (shortCodeStates.length === 0) {
        return option.none()
    }
    if (1 < shortCodeStates.length || shortCodeStates[0].key[0] !== shortCodeId) {
        throw new Error("Aggregation did something weird")
    }
    return option.some(shortCodeStates[0].value)
}

export async function getShortCodeFragmentDiffs(db: db.Database, action: MaybeLiveAction): Promise<Diff<ShortCode>[]> {
    return Array.from(ix.from(await getGameDiffs(db, action)).pipe(
        diffs.mapDiffs(gameToShortCodeFragments)
    ))
}

export async function getGamesByPlayerIndexDiffs(db: db.Database, action: MaybeLiveAction): Promise<Diff<{}>[]> {
    return Array.from(ix.from(await getGameDiffs(db, action)).pipe(
        diffs.mapDiffs(gameToPlayerToMemberGames)
    ))
}

// export async function getShortCodeAndGameState(db: db.Database, action: MaybeLiveAction, shortCode: string, gameId: string): Promise<Option<ShortCode>> {
//     // Illegal to call for an action that doesn't touch the state.
//     const diff = option.of(ix.find(await getShortCodeFragmentDiffs(db, action),
//         ({ key: [diffId,] }) => diffId === shortCode)).unwrap();

//     switch (diff.kind) {
//         case 'add':
//             return option.some(diff.value)
//         case 'replace':
//             return option.some(diff.newValue)
//         case 'delete':
//             return option.none()
//     }
// }

export async function getEffectedFacets(db: db.Database, action: MaybeLiveAction): Promise<Key[]> {
    const gameFacets = (await getGameDiffs(db, action)).map(({ key: [gameId] }) => [`game:${gameId}`])
    const scFacets = (await getShortCodeFragmentDiffs(db, action)).map(
        ({ key: [scId, gameId] }) => [`shortCode:${scId}`, `game:${gameId}`])
    const pgFacets = (await getGamesByPlayerIndexDiffs(db, action)).map(
        ({ key: [playerId, gameId] }) => [`player:${playerId}`, `game:${gameId}`])
    return [...gameFacets, ...scFacets, ...pgFacets]
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
// export function getGamesForPlayerByAction([gameId]: Key, game : Game): Iterable<Item<string[]>> {
// return ix.from(game.players).pipe(
//     ixop.map(    player => {key: player.id, value: [gameId]})
// )
//     for (const player of game.players) {

//     }
// }

// export async function getGamesForPlayerByAction(db: db.Database, action: MaybeLiveAction): Promise<string[]> {
//     ix.from(await getGameDiffs(db, action))
//         .pipe(
//             ixop.map(getNewValue),
//             util.filterNone(),
//         )


//     .map(({ key: [sc] }) => `game:${sc}`)
//     const scFacets = (await getShortCodeDiffs(db, action)).map(({ key: [sc] }) => `shortCode:${sc}`)
//     return [...gameFacets, ...scFacets]
// }

// export async function getGamesForPlayer(db: db.Database, playerId: string): Promise<string[]> {
//     const gameFacets = (await getGameDiffs(db, action)).map(({ key: [sc] }) => `game:${sc}`)
//     const scFacets = (await getShortCodeDiffs(db, action)).map(({ key: [sc] }) => `shortCode:${sc}`)
//     return [...gameFacets, ...scFacets]
// }

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


// async function getGame(inputs: fw.Input2<State>, gameId: string): Promise<OptionView<Game>> {
//     return option.from(await inputs.getParent(`game:${gameId}`))
//         .map(state => result.fromData(state.game).unwrap())
// }

// function setGame(States: Record<string, OptionData<State>>, gameId: string, game: Option<Game>): void {
//     States[`game:${gameId}`] = game.data;
// }

// async function isShortCodeUsed(inputs: fw.Input2<State>, shortCodeId: string): Promise<boolean> {
//     return option.from(await inputs.getParent(`shortCode:${shortCodeId}`))
//         .map(state => {
//             const game = result.fromData(state.game).unwrap();
//             return game.state === 'UNSTARTED' && game.shortCode === shortCodeId;
//         }).orElse(() => false)
// }

// function setShortCode(States: Record<string, OptionData<State>>, shortCodeId: string, sc: Option<ShortCode>): void {
//     States[`shortCode:${shortCodeId}`] = sc.data;
// }

// export const REVISION: fw.Revision2<State> = {
//     id: '1.2.0',
//     validateAnnotation: validate('Annotation2'),

//     async integrate(anyAction: AnyAction, inputs: fw.Input2<State>): Promise<IntegrationResult> {
//         const maybeOldGame = await getGame(inputs, anyAction.gameId);

//         const res = await helper(convertAction(anyAction), maybeOldGame, sc => isShortCodeUsed(inputs, sc));
//         if (res.data.status === 'err') {
//             return { labels: [], state: { game: res.data } }
//         }
//         const newGame = res.data.value;

//         const oldShortCode = maybeOldGame.andThen(oldGame => {
//             return oldGame.state === 'UNSTARTED' && oldGame.shortCode !== ""
//                 ? option.some(oldGame.shortCode)
//                 : option.none<string>()
//         })
//         const newShortCode = newGame.state === 'UNSTARTED' && newGame.shortCode !== ""
//             ? option.some(newGame.shortCode)
//             : option.none<string>()

//         const labels: string[] = [`game:${anyAction.gameId}`];

//         if (!deepEqual(oldShortCode.data, newShortCode.data)) {
//             const changedShortCodes = ix.toArray(ix.of(oldShortCode, newShortCode).pipe(util.filterNone()))
//             await Promise.all(changedShortCodes.map(sc => isShortCodeUsed(inputs, sc)))
//             labels.push(...changedShortCodes.map(sc => `shortCode:${sc}`));
//         }

//         return { labels, state: { game: result.ok<Game, Error>(newGame).data } }
//     },

//     // async activateState(db: db.Database, label: string, maybeOldGame: OptionData<State>, newGame: OptionData<State>): Promise<void> {
//     //     // const oldGame = option.fromData(maybeOldGame).withDefault(defaultGame1_1);

//     //     // const gameDiff = diffs.newDiff([label], oldGame, option.fromData(newGame).withDefault(defaultGame1_1));

//     //     // const gamesByPlayer1_0Diffs = diffs.from(gameDiff).map(gameToPlayerGames1_0).diffs;
//     //     // const gamesByPlayer1_1Diffs = diffs.from(gameDiff).map(gameToPlayerGames1_1).diffs

//     //     // const gamesByPlayer1_0 = db.open({
//     //     //     schema: ['players', 'games-gamesByPlayer-1.0'],
//     //     //     validator: validate1_0('PlayerGame'),
//     //     // })
//     //     // const gamesByPlayer1_1 = db.open({
//     //     //     schema: ['players', 'games-gamesByPlayer-1.1'],
//     //     //     validator: validate1_1('PlayerGame'),
//     //     // })

//     //     // applyChangesSimple(gamesByPlayer1_0, gamesByPlayer1_0Diffs.map(diffToChange));
//     //     // applyChangesSimple(gamesByPlayer1_1, gamesByPlayer1_1Diffs.map(diffToChange))
//     // }
// }

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

// export function getUnifiedInterface(gameId: string, state: State): UnifiedInterface {
//     return {
//         '1.0': result.fromData(state.game).map(game => ({
//             playerGames: ix.toArray(gameToPlayerGames1_0([gameId], game))
//         })).mapErr(convertError1_0).data,
//         '1.1': result.fromData(state.game).map(game => ({
//             playerGames: ix.toArray(gameToPlayerGames1_1([gameId], game))
//         })).mapErr(convertError1_1).data,
//     }
// }


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
        case '1.2':
            return convertAction1_2(a)
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
