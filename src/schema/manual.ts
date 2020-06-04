
import { readableFromDiffs, sortedDiffs, liveReplay, replayOrCheck } from '.'
import { applyChanges, diffToChange, validateLive } from '../base'
import * as db from '../db'
import { Live, Readable } from '../interfaces'
import * as model from '../model'
import { validate as validateModel } from '../model/index.validator'
import * as readables from '../readables'
import * as util from '../util'
import { Metadata, Outputs, IOSpec, CollectionId } from './interfaces'
import { validate as validateInterfaces } from './interfaces.validator'

export const COLLECTION_IDS = ['1.0.0', '1.0.1', '1.0.2', '1.1.0'] as ['1.0.0', '1.0.1', '1.0.2', '1.1.0']
export const PRIMARY_COLLECTION_ID = '1.0.2'
export const SECONDARY_COLLECTION_IDS = ['1.0.0', '1.0.1', '1.1.0'] as ['1.0.0', '1.0.1', '1.1.0']

export type Tables = {
    [C in CollectionId]: {
        meta: db.Table<Metadata[C]>
        live: {
            [T in keyof IOSpec[C]['live']]: db.Table<Live<IOSpec[C]['live'][T]>>
        }
        exports: {
            [T in keyof IOSpec[C]['exports']]: db.Table<Live<IOSpec[C]['exports'][T]>>
        }
    }
}

export type SideInputs = {
    [C in CollectionId]: {
        [T in keyof IOSpec[C]['live']]: Readable<IOSpec[C]['live'][T]>
    }
}

export async function liveReplaySecondaries(
    ts: Tables, integrators: Integrators, actionId: string, savedAction: model.SavedAction): Promise<void> {
    await liveReplay(SPEC['1.0.0'], ts, integrators, actionId, savedAction);
    await liveReplay(SPEC['1.0.1'], ts, integrators, actionId, savedAction);
    await liveReplay(SPEC['1.1.0'], ts, integrators, actionId, savedAction);
}

export async function replayAll(tx: db.TxRunner,
    integrators: Integrators,
    actionId: string, savedAction: model.SavedAction): Promise<void> {
    await replayOrCheck(SPEC['1.0.0'], tx, integrators, actionId, savedAction);
    await replayOrCheck(SPEC['1.0.1'], tx, integrators, actionId, savedAction);
    await replayOrCheck(SPEC['1.0.2'], tx, integrators, actionId, savedAction);
    await replayOrCheck(SPEC['1.1.0'], tx, integrators, actionId, savedAction);
}


type ToSchemaType<Live> = {
    [K in keyof Live]: string[]
}

export type SpecType = {
    [C in CollectionId]: SpecEntry<C, ToSchemaType<IOSpec[C]['live']>, Metadata[C], SideInputs[C], Outputs[C]>
}

export interface SpecEntry<C extends CollectionId, SchemaType, MetadataType, SideInputsType, OutputsType> {
    collectionId: C
    schemata: SchemaType
    selectMetadata(ts: Tables): db.Table<MetadataType>
    selectSideInputs(rs: SideInputs): SideInputsType
    selectIntegrator(integrators: Integrators): (action: model.AnyAction, inputs: SideInputsType) =>
        Promise<util.Result<OutputsType, model.AnyError>>
    replaySideInputs(metas: AsyncIterable<MetadataType>): SideInputsType
    emptyOutputs(): OutputsType
    outputToMetadata(outputs: OutputsType): MetadataType
    applyOutputs(ts: Tables, actionId: string, outputs: OutputsType): void
}

export const SPEC: SpecType = {
    '1.0.0': {
        collectionId: '1.0.0',
        schemata: {
            games: ["games-games-1.0.0"],
        },
        selectMetadata(ts: Tables) { return ts['1.0.0'].meta },
        selectSideInputs(rs: SideInputs) { return rs['1.0.0'] },
        selectIntegrator(integrators: Integrators) { return integrators['1.0.0'] },
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
        collectionId: '1.0.1',
        schemata: {
            games: ["games-games-1.0.1"],
            gamesByPlayer: ["players", "games-gamesByPlayer-1.0.1"],
        },
        selectMetadata(ts: Tables) { return ts['1.0.1'].meta },
        selectSideInputs(rs: SideInputs) { return rs['1.0.1'] },
        selectIntegrator(integrators: Integrators) { return integrators['1.0.1'] },
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
        collectionId: '1.0.2',
        schemata: {
            games: ["games-games-1.0.2"],
            gamesByPlayer: ["players", "games-gamesByPlayer-1.0.2"],
        },
        selectMetadata(ts: Tables) { return ts['1.0.2'].meta },
        selectSideInputs(rs: SideInputs) { return rs['1.0.2'] },
        selectIntegrator(integrators: Integrators) { return integrators['1.0.2'] },
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
            applyChanges(ts['1.0.2'].exports.gamesByPlayer, actionId, outputs.gamesByPlayer.map(diffToChange))
        },
    },
    '1.1.0': {
        collectionId: '1.1.0',
        schemata: {
            games: ["games-games-1.1.0"],
            gamesByPlayer: ["players", "games-gamesByPlayer-1.1.0"],
        },
        selectMetadata(ts: Tables) { return ts['1.1.0'].meta },
        selectSideInputs(rs: SideInputs) { return rs['1.1.0'] },
        selectIntegrator(integrators: Integrators) { return integrators['1.1.0'] },
        replaySideInputs(metas: AsyncIterable<Metadata['1.1.0']>): SideInputs['1.1.0'] {
            return {
                games: readableFromDiffs(metas, meta => meta.outputs.games, this.schemata.games),
                gamesByPlayer: readableFromDiffs(metas, meta => meta.outputs.gamesByPlayer, this.schemata.gamesByPlayer),
            };
        },
        emptyOutputs(): Outputs['1.1.0'] {
            return {
                games: [],
                gamesByPlayer: [],
            }
        },
        outputToMetadata(outputs: Outputs['1.1.0']): Metadata['1.1.0'] {
            return {
                outputs: {
                    games: util.sorted(outputs.games, (d1, d2) => util.lexCompare(d1.key, d2.key)),
                    gamesByPlayer: util.sorted(outputs.gamesByPlayer, (d1, d2) => util.lexCompare(d1.key, d2.key)),
                }
            }
        },
        applyOutputs(ts: Tables, actionId: string, outputs: Outputs['1.1.0']): void {
            ts['1.1.0'].meta.set([actionId], this.outputToMetadata(outputs));
            applyChanges(ts['1.1.0'].live.games, actionId, outputs.games.map(diffToChange))
            applyChanges(ts['1.1.0'].live.gamesByPlayer, actionId, outputs.gamesByPlayer.map(diffToChange))
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
            },
            exports: {},

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
            },
            exports: {},
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
            },
            exports: {
                gamesByPlayer: db.open({
                    schema: ['players', 'games-gamesByPlayer-1.0'],
                    validator: validateLive(validateModel('PlayerGame1_0'))
                })
            }
        },
        '1.1.0': {
            meta: db.open({
                schema: ['metadata-1.1.0'],
                validator: validateInterfaces('Metadata1_1_0')
            }),
            live: {
                games: db.open({
                    schema: SPEC['1.1.0'].schemata.games,
                    validator: validateLive(validateModel('Game1_1'))
                }),
                gamesByPlayer: db.open({
                    schema: SPEC['1.1.0'].schemata.gamesByPlayer,
                    validator: validateLive(validateModel('PlayerGame1_1'))
                })
            },
            exports: {}
        }
    }
}

export function readAll(ts: Tables): [Set<string>, SideInputs] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const res: SideInputs = {
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
        '1.1.0': {
            games: readables.tracked(ts['1.1.0'].live['games'], track),
            gamesByPlayer: readables.tracked(ts['1.1.0'].live['gamesByPlayer'], track),
        },
    }
    return [parentSet, res]
}

export type Integrators = {
    [K in CollectionId]: (action: model.AnyAction, inputs: SideInputs[K]) =>
        Promise<util.Result<Outputs[K], model.AnyError>>
}
