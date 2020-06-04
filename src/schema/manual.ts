
import { readableFromDiffs, sortedDiffs } from '.'
import { applyChanges, diffToChange, validateLive } from '../base'
import * as db from '../db'
import { Live, Readable } from '../interfaces'
import * as model from '../model'
import { validate as validateModel } from '../model/index.validator'
import * as readables from '../readables'
import * as util from '../util'
import { Metadata, Outputs, SideInputs } from './interfaces'
import { validate as validateInterfaces } from './interfaces.validator'

export const COLLECTION_IDS = ['1.0.0', '1.0.1', '1.0.2'] as ['1.0.0', '1.0.1', '1.0.2']
export const PRIMARY_COLLECTION_ID = '1.0.2'
export const SECONDARY_COLLECTION_IDS = ['1.0.0', '1.0.1'] as ['1.0.0', '1.0.1']

export type Tables = {
    '1.0.0': {
        meta: db.Table<Metadata['1.0.0']>
        live: {
            games: db.Table<Live<model.Game1_0>>
        }
    },
    '1.0.1': {
        meta: db.Table<Metadata['1.0.1']>
        live: {
            games: db.Table<Live<model.Game1_0>>
            gamesByPlayer: db.Table<Live<model.PlayerGame1_0>>
        }
    },
    '1.0.2': {
        meta: db.Table<Metadata['1.0.2']>
        live: {
            games: db.Table<Live<model.Game1_0>>
            gamesByPlayer: db.Table<Live<model.PlayerGame1_0>>
        }
    },
}

export type Readables = {
    '1.0.0': {
        games: Readable<model.Game1_0>
    }
    '1.0.1': {
        games: Readable<model.Game1_0>
        gamesByPlayer: Readable<model.PlayerGame1_0>
    }
    '1.0.2': {
        games: Readable<model.Game1_0>
        gamesByPlayer: Readable<model.PlayerGame1_0>
    }
}

export const SPEC = {
    '1.0.0': {
        schemata: {
            games: ["games-games-1.0.0"],

        },
        replaySideInputs(metas: AsyncIterable<Metadata['1.0.0']>): SideInputs['1.0.0'] {
            return {
                games: readableFromDiffs(metas, meta => meta.outputs.games, this.schemata.games),
            }
        },
        emptyOutputs(): Outputs['1.0.0'] {
            return {
                games: [],
            }
        },
        outputToMetadata(outputs: Outputs['1.0.0']): Metadata['1.0.0'] {
            return {
                outputs: {
                    games: sortedDiffs(outputs.games),
                }
            }
        },
        applyOutputs(ts: Tables, actionId: string, outputs: Outputs['1.0.0']): void {
            ts['1.0.0'].meta.set([actionId], this.outputToMetadata(outputs));
            applyChanges(ts['1.0.0'].live.games, actionId, outputs.games.map(diffToChange))
        },
    },
    '1.0.1': {
        schemata: {
            games: ["games-games-1.0.1"],
            gamesByPlayer: ["players", "games-gamesByPlayer-1.0.1"],
        },
        replaySideInputs(metas: AsyncIterable<Metadata['1.0.1']>): SideInputs['1.0.1'] {
            return {
                games: readableFromDiffs(metas, meta => meta.outputs.games, this.schemata.games),
                gamesByPlayer: readableFromDiffs(metas, meta => meta.outputs.gamesByPlayer, this.schemata.gamesByPlayer),
            };
        },
        emptyOutputs(): Outputs['1.0.1'] {
            return {
                games: [],
                gamesByPlayer: [],
            }
        },
        outputToMetadata(outputs: Outputs['1.0.1']): Metadata['1.0.1'] {
            return {
                outputs: {
                    games: util.sorted(outputs.games, (d1, d2) => util.lexCompare(d1.key, d2.key)),
                    gamesByPlayer: util.sorted(outputs.gamesByPlayer, (d1, d2) => util.lexCompare(d1.key, d2.key)),
                }
            }
        },
        applyOutputs(ts: Tables, actionId: string, outputs: Outputs['1.0.1']): void {
            ts['1.0.1'].meta.set([actionId], this.outputToMetadata(outputs));
            applyChanges(ts['1.0.1'].live.games, actionId, outputs.games.map(diffToChange))
            applyChanges(ts['1.0.1'].live.gamesByPlayer, actionId, outputs.gamesByPlayer.map(diffToChange))
        },
    },
    '1.0.2': {
        schemata: {
            games: ["games-games-1.0.2"],
            gamesByPlayer: ["players", "games-gamesByPlayer-1.0.2"],
        },
        replaySideInputs(metas: AsyncIterable<Metadata['1.0.2']>): SideInputs['1.0.2'] {
            return {
                games: readableFromDiffs(metas, meta => meta.outputs.games, this.schemata.games),
                gamesByPlayer: readableFromDiffs(metas, meta => meta.outputs.gamesByPlayer, this.schemata.gamesByPlayer),
            };
        },
        emptyOutputs(): Outputs['1.0.2'] {
            return {
                games: [],
                gamesByPlayer: [],
            }
        },
        outputToMetadata(outputs: Outputs['1.0.2']): Metadata['1.0.2'] {
            return {
                outputs: {
                    games: util.sorted(outputs.games, (d1, d2) => util.lexCompare(d1.key, d2.key)),
                    gamesByPlayer: util.sorted(outputs.gamesByPlayer, (d1, d2) => util.lexCompare(d1.key, d2.key)),
                }
            }
        },
        applyOutputs(ts: Tables, actionId: string, outputs: Outputs['1.0.2']): void {
            ts['1.0.2'].meta.set([actionId], this.outputToMetadata(outputs));
            applyChanges(ts['1.0.2'].live.games, actionId, outputs.games.map(diffToChange))
            applyChanges(ts['1.0.2'].live.gamesByPlayer, actionId, outputs.gamesByPlayer.map(diffToChange))
        },
    },
}

export function openAll(db: db.Database): Tables {
    return {
        '1.0.0': {
            meta: db.open({
                schema: ['metadata-1.0.0'],
                validator: validateInterfaces('Metadata1_0_0')
            }),
            live: {
                games: db.open({
                    schema: SPEC['1.0.0'].schemata.games,
                    validator: validateLive(validateModel('Game1_0'))
                })
            }
        },
        '1.0.1': {
            meta: db.open({
                schema: ['metadata-1.0.1'],
                validator: validateInterfaces('Metadata1_0_1')
            }),
            live: {
                games: db.open({
                    schema: SPEC['1.0.1'].schemata.games,
                    validator: validateLive(validateModel('Game1_0'))
                }),
                gamesByPlayer: db.open({
                    schema: SPEC['1.0.1'].schemata.gamesByPlayer,
                    validator: validateLive(validateModel('PlayerGame1_0'))
                })
            }
        },
        '1.0.2': {
            meta: db.open({
                schema: ['metadata-1.0.2'],
                validator: validateInterfaces('Metadata1_0_2')
            }),
            live: {
                games: db.open({
                    schema: SPEC['1.0.2'].schemata.games,
                    validator: validateLive(validateModel('Game1_0'))
                }),
                gamesByPlayer: db.open({
                    schema: SPEC['1.0.2'].schemata.gamesByPlayer,
                    validator: validateLive(validateModel('PlayerGame1_0'))
                })
            }
        }
    }
}

export function readAll(ts: Tables): [Set<string>, Readables] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const res: Readables = {
        '1.0.0': {
            games: readables.tracked(ts['1.0.0'].live['games'], track),
        },
        '1.0.1': {
            games: readables.tracked(ts['1.0.1'].live['games'], track),
            gamesByPlayer: readables.tracked(ts['1.0.1'].live['gamesByPlayer'], track),
        },
        '1.0.2': {
            games: readables.tracked(ts['1.0.2'].live['games'], track),
            gamesByPlayer: readables.tracked(ts['1.0.2'].live['gamesByPlayer'], track),
        },
    }
    return [parentSet, res]
}

export interface Integrators {
    '1.0.0': (action: model.AnyAction, inputs: SideInputs['1.0.0']) =>
        Promise<util.Result<Outputs['1.0.0'], model.AnyError>>
    '1.0.1': (action: model.AnyAction, inputs: SideInputs['1.0.1']) =>
        Promise<util.Result<Outputs['1.0.1'], model.AnyError>>
    '1.0.2': (action: model.AnyAction, inputs: SideInputs['1.0.2']) =>
        Promise<util.Result<Outputs['1.0.2'], model.AnyError>>
}
