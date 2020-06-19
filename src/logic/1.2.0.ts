
import produce from 'immer';
import * as ix from "ix/iterable";
import * as ixop from "ix/iterable/operators";
import { applyChangesSimple, diffToChange } from '../base';
import * as db from '../db';
import * as diffs from '../diffs';
import * as fw from '../framework';
import { Item, item, Key } from '../interfaces';
import * as model1_0 from '../model/1.0';
import { validate as validate1_0 } from '../model/1.0.validator';
import * as model1_1 from '../model/1.1';
import { Facet, Error, Game, Action, MakeMoveAction, ShortCode, StartedGame } from '../model/1.2.0';
import { validate } from '../model/1.2.0.validator';
import { validate as validate1_1 } from '../model/1.1.validator';
import { AnyAction } from '../schema';
import * as util from '../util';
import { Defaultable, Option, option, Result, result } from '../util';
import { OptionData, OptionView } from '../util/option';
import { ResultView } from '../util/result';
import deepEqual from 'deep-equal';

type IntegrationResult =
    fw.IntegrationResult<Result<null, Error>, Facet>;


async function getGame(inputs: fw.Input<Facet>, gameId: string): Promise<OptionView<Game>> {
    const facet = option.from(await inputs.getFacet(`game:${gameId}`));
    return facet.map(validate('Game'))
}

function setGame(facets: Record<string, OptionData<Facet>>, gameId: string, game: Option<Game>): void {
    facets[`game:${gameId}`] = game.data;
}

async function getShortCode(inputs: fw.Input<Facet>, shortCodeId: string): Promise<OptionView<ShortCode>> {
    const facet = option.from(await inputs.getFacet(`shortCode:${shortCodeId}`));
    return facet.map(validate('ShortCode'))
}

function setShortCode(facets: Record<string, OptionData<Facet>>, shortCodeId: string, sc: Option<ShortCode>): void {
    facets[`shortCode:${shortCodeId}`] = sc.data;
}

export const REVISION: fw.Revision<Result<null, Error>, Facet> = {
    id: '1.2.0',
    validateAnnotation: validate('Annotations'),

    async integrate(anyAction: AnyAction, inputs: fw.Input<Facet>): Promise<IntegrationResult> {
        const maybeOldGame = await getGame(inputs, anyAction.gameId);

        const res = await helper(convertAction(anyAction), maybeOldGame, inputs);
        if (res.data.status === 'err') {
            return { result: result.err(res.data.error), facets: {} }
        }
        const newGame = res.data.value;

        const gameDiffs = diffs.newDiff2([anyAction.gameId], maybeOldGame, option.some(newGame));
        const shortCodeDiffs = gameDiffs.map(gameToShortCodes);

        const facets: Record<string, OptionData<Facet>> = {};
        for (const diff of gameDiffs.diffs) {
            switch (diff.kind) {
                case 'add':
                    setGame(facets, diff.key[0], option.some(diff.value))
                    break
                case 'delete':
                    setGame(facets, diff.key[0], option.none())
                    break
                case 'replace':
                    setGame(facets, diff.key[0], option.some(diff.newValue))
                    break
            }
        }
        for (const diff of shortCodeDiffs.diffs) {
            switch (diff.kind) {
                case 'add':
                    setShortCode(facets, diff.key[0], option.some(diff.value))
                    break
                case 'delete':
                    setShortCode(facets, diff.key[0], option.none())
                    break
                case 'replace':
                    setShortCode(facets, diff.key[0], option.some(diff.newValue))
                    break
            }
        }


        return { result: result.ok(null), facets }
        //     const maybeNewGameOrError = integrateHelper(convertAction(action), oldGame);
        //     return result.from(maybeNewGameOrError).split({
        //         onErr: (err): IntegrationResult => ({
        //             facets: {},
        //             result: result.err(err),
        //         }),
        //         onOk: (maybeNewGame) => {
        //             return option.from(maybeNewGame).split({
        //                 onNone: (): IntegrationResult => ({
        //                     facets: {},
        //                     result: result.ok(null)
        //                 }),
        //                 onSome(newGame): IntegrationResult {
        //                     return {
        //                         facets: { [action.gameId]: option.some(newGame).data },
        //                         result: result.ok(null)
        //                     }
        //                 }
        //             })
        //         }
        //     })
    },

    async activateFacet(db: db.Database, label: string, maybeOldGame: OptionData<Facet>, newGame: OptionData<Facet>): Promise<void> {
        // const oldGame = option.fromData(maybeOldGame).withDefault(defaultGame1_1);

        // const gameDiff = diffs.newDiff([label], oldGame, option.fromData(newGame).withDefault(defaultGame1_1));

        // const gamesByPlayer1_0Diffs = diffs.from(gameDiff).map(gameToPlayerGames1_0).diffs;
        // const gamesByPlayer1_1Diffs = diffs.from(gameDiff).map(gameToPlayerGames1_1).diffs

        // const gamesByPlayer1_0 = db.open({
        //     schema: ['players', 'games-gamesByPlayer-1.0'],
        //     validator: validate1_0('PlayerGame'),
        // })
        // const gamesByPlayer1_1 = db.open({
        //     schema: ['players', 'games-gamesByPlayer-1.1'],
        //     validator: validate1_1('PlayerGame'),
        // })

        // applyChangesSimple(gamesByPlayer1_0, gamesByPlayer1_0Diffs.map(diffToChange));
        // applyChangesSimple(gamesByPlayer1_1, gamesByPlayer1_1Diffs.map(diffToChange))
    }
}

function gameToShortCodes(gameId: Key, game: Game): Item<ShortCode>[] {
    if (game.state !== 'UNSTARTED' || game.shortCode === '') {
        return []
    }
    return [{ key: [game.shortCode], value: {} }]
}

async function helper(a: Action, maybeOldGame: Option<Game>, inputs: fw.Input<Facet>): Promise<ResultView<Game, Error>> {

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
            const maybeShortCode = await getShortCode(inputs, a.shortCode);
            if (maybeShortCode.data.some) {
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

function gameToPlayerGames([gameId]: Key, game: Game): Iterable<Item<model1_1.PlayerGame>> {
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
    return ix.from(gameToPlayerGames(key, value)).pipe(
        ixop.map(({ key, value: pg }: Item<model1_1.PlayerGame>): Item<model1_0.PlayerGame> => {
            return item(key, {
                ...pg,
                players: pg.players.map(p => p.id)
            })
        }),
    );
}
