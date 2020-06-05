// DON'T EDIT THIS FILE, IT IS AUTO GENERATED

import { Integrators, liveReplay, readableFromDiffs, replayOrCheck, SideInputs, sortedDiffs, SpecType, Tables, copyTable } from '.'
import { applyChanges, diffToChange, validateLive } from '../base'
import * as db from '../db'
import * as model from '../model'
import { validate as validateModel } from '../model/index.validator'
import * as readables from '../readables'
import { Metadata, Outputs } from './interfaces'
import { validate as validateInterfaces } from './interfaces.validator'

export const PRIMARY_COLLECTION_ID = "1.0.2";
export const SECONDARY_COLLECTION_IDS = ["1.0.0", "1.0.1", "1.1.0", "1.1.1"] as ["1.0.0", "1.0.1", "1.1.0", "1.1.1"];
export const COLLECTION_IDS =
    ["1.0.0", "1.0.1", "1.0.2", "1.1.0", "1.1.1"] as
    ["1.0.0", "1.0.1", "1.0.2", "1.1.0", "1.1.1"];


export async function liveReplaySecondaries(
    ts: Tables, integrators: Integrators, actionId: string, savedAction: model.SavedAction): Promise<void> {
    await liveReplay(SPEC["1.0.0"], ts, integrators, actionId, savedAction);
    await liveReplay(SPEC["1.0.1"], ts, integrators, actionId, savedAction);
    await liveReplay(SPEC["1.1.0"], ts, integrators, actionId, savedAction);
    await liveReplay(SPEC["1.1.1"], ts, integrators, actionId, savedAction);
}

export async function replayAll(
    tx: db.TxRunner, integrators: Integrators,
    actionId: string, savedAction: model.SavedAction): Promise<void> {
    await replayOrCheck(SPEC["1.0.0"], tx, integrators, actionId, savedAction);
    await replayOrCheck(SPEC["1.0.1"], tx, integrators, actionId, savedAction);
    await replayOrCheck(SPEC["1.0.2"], tx, integrators, actionId, savedAction);
    await replayOrCheck(SPEC["1.1.0"], tx, integrators, actionId, savedAction);
    await replayOrCheck(SPEC["1.1.1"], tx, integrators, actionId, savedAction);
}

export async function reexportAll(tx: db.TxRunner): Promise<void> {
    await copyTable(tx,
        (db) => openAll(db)["1.0.2"].live["gamesByPlayer"],
        (db) => openAll(db)["1.0.2"].exports["gamesByPlayer"])
    await copyTable(tx,
        (db) => openAll(db)["1.1.0"].live["gamesByPlayer"],
        (db) => openAll(db)["1.1.0"].exports["gamesByPlayer"])
}

export const SPEC: SpecType = {
    "1.0.0": {
        collectionId: "1.0.0",
        schemata: {
            live: {
                "games": ["games-games-1.0.0"],
            },
            exports: {
            }
        },
        selectMetadata(ts: Tables) { return ts[this.collectionId].meta },
        selectSideInputs(rs: SideInputs) { return rs[this.collectionId] },
        selectIntegrator(integrators: Integrators) { return integrators[this.collectionId] },
        replaySideInputs(metas: AsyncIterable<Metadata["1.0.0"]>): SideInputs["1.0.0"] {
            return {
                "games": readableFromDiffs(metas, meta => meta.outputs["games"], this.schemata.live["games"]),
            }
        },
        emptyOutputs(): Outputs["1.0.0"] {
            return {
                "games": [],
            }
        },
        outputToMetadata(outputs: Outputs["1.0.0"]): Metadata["1.0.0"] {
            return {
                outputs: {
                    "games": sortedDiffs(outputs["games"]),
                }
            }
        },
        applyOutputs(ts: Tables, actionId: string, outputs: Outputs["1.0.0"]): void {
            ts[this.collectionId].meta.set([actionId], this.outputToMetadata(outputs));
            applyChanges(ts[this.collectionId].live["games"], actionId, outputs["games"].map(diffToChange))
        },
    },
    "1.0.1": {
        collectionId: "1.0.1",
        schemata: {
            live: {
                "games": ["games-games-1.0.1"],
                "gamesByPlayer": ["players", "games-gamesByPlayer-1.0.1"],
            },
            exports: {
            }
        },
        selectMetadata(ts: Tables) { return ts[this.collectionId].meta },
        selectSideInputs(rs: SideInputs) { return rs[this.collectionId] },
        selectIntegrator(integrators: Integrators) { return integrators[this.collectionId] },
        replaySideInputs(metas: AsyncIterable<Metadata["1.0.1"]>): SideInputs["1.0.1"] {
            return {
                "games": readableFromDiffs(metas, meta => meta.outputs["games"], this.schemata.live["games"]),
                "gamesByPlayer": readableFromDiffs(metas, meta => meta.outputs["gamesByPlayer"], this.schemata.live["gamesByPlayer"]),
            }
        },
        emptyOutputs(): Outputs["1.0.1"] {
            return {
                "games": [],
                "gamesByPlayer": [],
            }
        },
        outputToMetadata(outputs: Outputs["1.0.1"]): Metadata["1.0.1"] {
            return {
                outputs: {
                    "games": sortedDiffs(outputs["games"]),
                    "gamesByPlayer": sortedDiffs(outputs["gamesByPlayer"]),
                }
            }
        },
        applyOutputs(ts: Tables, actionId: string, outputs: Outputs["1.0.1"]): void {
            ts[this.collectionId].meta.set([actionId], this.outputToMetadata(outputs));
            applyChanges(ts[this.collectionId].live["games"], actionId, outputs["games"].map(diffToChange))
            applyChanges(ts[this.collectionId].live["gamesByPlayer"], actionId, outputs["gamesByPlayer"].map(diffToChange))
        },
    },
    "1.0.2": {
        collectionId: "1.0.2",
        schemata: {
            live: {
                "games": ["games-games-1.0.2"],
                "gamesByPlayer": ["players", "games-gamesByPlayer-1.0.2"],
            },
            exports: {
                "gamesByPlayer": ["players", "games-gamesByPlayer-1.0"],
            }
        },
        selectMetadata(ts: Tables) { return ts[this.collectionId].meta },
        selectSideInputs(rs: SideInputs) { return rs[this.collectionId] },
        selectIntegrator(integrators: Integrators) { return integrators[this.collectionId] },
        replaySideInputs(metas: AsyncIterable<Metadata["1.0.2"]>): SideInputs["1.0.2"] {
            return {
                "games": readableFromDiffs(metas, meta => meta.outputs["games"], this.schemata.live["games"]),
                "gamesByPlayer": readableFromDiffs(metas, meta => meta.outputs["gamesByPlayer"], this.schemata.live["gamesByPlayer"]),
            }
        },
        emptyOutputs(): Outputs["1.0.2"] {
            return {
                "games": [],
                "gamesByPlayer": [],
            }
        },
        outputToMetadata(outputs: Outputs["1.0.2"]): Metadata["1.0.2"] {
            return {
                outputs: {
                    "games": sortedDiffs(outputs["games"]),
                    "gamesByPlayer": sortedDiffs(outputs["gamesByPlayer"]),
                }
            }
        },
        applyOutputs(ts: Tables, actionId: string, outputs: Outputs["1.0.2"]): void {
            ts[this.collectionId].meta.set([actionId], this.outputToMetadata(outputs));
            applyChanges(ts[this.collectionId].live["games"], actionId, outputs["games"].map(diffToChange))
            applyChanges(ts[this.collectionId].live["gamesByPlayer"], actionId, outputs["gamesByPlayer"].map(diffToChange))
            applyChanges(ts[this.collectionId].exports["gamesByPlayer"], actionId, outputs["gamesByPlayer"].map(diffToChange))
        },
    },
    "1.1.0": {
        collectionId: "1.1.0",
        schemata: {
            live: {
                "games": ["games-games-1.1.0"],
                "gamesByPlayer": ["players", "games-gamesByPlayer-1.1.0"],
            },
            exports: {
                "gamesByPlayer": ["players", "games-gamesByPlayer-1.1"],
            }
        },
        selectMetadata(ts: Tables) { return ts[this.collectionId].meta },
        selectSideInputs(rs: SideInputs) { return rs[this.collectionId] },
        selectIntegrator(integrators: Integrators) { return integrators[this.collectionId] },
        replaySideInputs(metas: AsyncIterable<Metadata["1.1.0"]>): SideInputs["1.1.0"] {
            return {
                "games": readableFromDiffs(metas, meta => meta.outputs["games"], this.schemata.live["games"]),
                "gamesByPlayer": readableFromDiffs(metas, meta => meta.outputs["gamesByPlayer"], this.schemata.live["gamesByPlayer"]),
            }
        },
        emptyOutputs(): Outputs["1.1.0"] {
            return {
                "games": [],
                "gamesByPlayer": [],
            }
        },
        outputToMetadata(outputs: Outputs["1.1.0"]): Metadata["1.1.0"] {
            return {
                outputs: {
                    "games": sortedDiffs(outputs["games"]),
                    "gamesByPlayer": sortedDiffs(outputs["gamesByPlayer"]),
                }
            }
        },
        applyOutputs(ts: Tables, actionId: string, outputs: Outputs["1.1.0"]): void {
            ts[this.collectionId].meta.set([actionId], this.outputToMetadata(outputs));
            applyChanges(ts[this.collectionId].live["games"], actionId, outputs["games"].map(diffToChange))
            applyChanges(ts[this.collectionId].live["gamesByPlayer"], actionId, outputs["gamesByPlayer"].map(diffToChange))
            applyChanges(ts[this.collectionId].exports["gamesByPlayer"], actionId, outputs["gamesByPlayer"].map(diffToChange))
        },
    },
    "1.1.1": {
        collectionId: "1.1.1",
        schemata: {
            live: {
                "games": ["games-games-1.1.1"],
                "gamesByPlayer1_1": ["players", "games-gamesByPlayer1_1-1.1.1"],
                "gamesByPlayer1_0": ["players", "games-gamesByPlayer1_0-1.1.1"],
            },
            exports: {
            }
        },
        selectMetadata(ts: Tables) { return ts[this.collectionId].meta },
        selectSideInputs(rs: SideInputs) { return rs[this.collectionId] },
        selectIntegrator(integrators: Integrators) { return integrators[this.collectionId] },
        replaySideInputs(metas: AsyncIterable<Metadata["1.1.1"]>): SideInputs["1.1.1"] {
            return {
                "games": readableFromDiffs(metas, meta => meta.outputs["games"], this.schemata.live["games"]),
                "gamesByPlayer1_1": readableFromDiffs(metas, meta => meta.outputs["gamesByPlayer1_1"], this.schemata.live["gamesByPlayer1_1"]),
                "gamesByPlayer1_0": readableFromDiffs(metas, meta => meta.outputs["gamesByPlayer1_0"], this.schemata.live["gamesByPlayer1_0"]),
            }
        },
        emptyOutputs(): Outputs["1.1.1"] {
            return {
                "games": [],
                "gamesByPlayer1_1": [],
                "gamesByPlayer1_0": [],
            }
        },
        outputToMetadata(outputs: Outputs["1.1.1"]): Metadata["1.1.1"] {
            return {
                outputs: {
                    "games": sortedDiffs(outputs["games"]),
                    "gamesByPlayer1_1": sortedDiffs(outputs["gamesByPlayer1_1"]),
                    "gamesByPlayer1_0": sortedDiffs(outputs["gamesByPlayer1_0"]),
                }
            }
        },
        applyOutputs(ts: Tables, actionId: string, outputs: Outputs["1.1.1"]): void {
            ts[this.collectionId].meta.set([actionId], this.outputToMetadata(outputs));
            applyChanges(ts[this.collectionId].live["games"], actionId, outputs["games"].map(diffToChange))
            applyChanges(ts[this.collectionId].live["gamesByPlayer1_1"], actionId, outputs["gamesByPlayer1_1"].map(diffToChange))
            applyChanges(ts[this.collectionId].live["gamesByPlayer1_0"], actionId, outputs["gamesByPlayer1_0"].map(diffToChange))
        },
    },
};

export function openAll(db: db.Database): Tables {
    return {
        "1.0.0": {
            meta: db.open({
                schema: ['metadata-1.0.0'],
                validator: validateInterfaces('Metadata1_0_0')
            }),
            live: {
                "games": db.open({
                    schema: SPEC["1.0.0"].schemata.live["games"],
                    validator: validateLive(validateModel("Game1_0"))
                }),
            },
            exports: {
            },
        },
        "1.0.1": {
            meta: db.open({
                schema: ['metadata-1.0.1'],
                validator: validateInterfaces('Metadata1_0_1')
            }),
            live: {
                "games": db.open({
                    schema: SPEC["1.0.1"].schemata.live["games"],
                    validator: validateLive(validateModel("Game1_0"))
                }),
                "gamesByPlayer": db.open({
                    schema: SPEC["1.0.1"].schemata.live["gamesByPlayer"],
                    validator: validateLive(validateModel("PlayerGame1_0"))
                }),
            },
            exports: {
            },
        },
        "1.0.2": {
            meta: db.open({
                schema: ['metadata-1.0.2'],
                validator: validateInterfaces('Metadata1_0_2')
            }),
            live: {
                "games": db.open({
                    schema: SPEC["1.0.2"].schemata.live["games"],
                    validator: validateLive(validateModel("Game1_0"))
                }),
                "gamesByPlayer": db.open({
                    schema: SPEC["1.0.2"].schemata.live["gamesByPlayer"],
                    validator: validateLive(validateModel("PlayerGame1_0"))
                }),
            },
            exports: {
                "gamesByPlayer": db.open({
                    schema: SPEC["1.0.2"].schemata.exports["gamesByPlayer"],
                    validator: validateLive(validateModel("PlayerGame1_0"))
                }),
            },
        },
        "1.1.0": {
            meta: db.open({
                schema: ['metadata-1.1.0'],
                validator: validateInterfaces('Metadata1_1_0')
            }),
            live: {
                "games": db.open({
                    schema: SPEC["1.1.0"].schemata.live["games"],
                    validator: validateLive(validateModel("Game1_1"))
                }),
                "gamesByPlayer": db.open({
                    schema: SPEC["1.1.0"].schemata.live["gamesByPlayer"],
                    validator: validateLive(validateModel("PlayerGame1_1"))
                }),
            },
            exports: {
                "gamesByPlayer": db.open({
                    schema: SPEC["1.1.0"].schemata.exports["gamesByPlayer"],
                    validator: validateLive(validateModel("PlayerGame1_1"))
                }),
            },
        },
        "1.1.1": {
            meta: db.open({
                schema: ['metadata-1.1.1'],
                validator: validateInterfaces('Metadata1_1_1')
            }),
            live: {
                "games": db.open({
                    schema: SPEC["1.1.1"].schemata.live["games"],
                    validator: validateLive(validateModel("Game1_1"))
                }),
                "gamesByPlayer1_1": db.open({
                    schema: SPEC["1.1.1"].schemata.live["gamesByPlayer1_1"],
                    validator: validateLive(validateModel("PlayerGame1_1"))
                }),
                "gamesByPlayer1_0": db.open({
                    schema: SPEC["1.1.1"].schemata.live["gamesByPlayer1_0"],
                    validator: validateLive(validateModel("PlayerGame1_0"))
                }),
            },
            exports: {
            },
        },
    }
}

export function readAll(ts: Tables): [Set<string>, SideInputs] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const res: SideInputs = {
        "1.0.0": {
            "games": readables.tracked(ts["1.0.0"].live["games"], track),
        },
        "1.0.1": {
            "games": readables.tracked(ts["1.0.1"].live["games"], track),
            "gamesByPlayer": readables.tracked(ts["1.0.1"].live["gamesByPlayer"], track),
        },
        "1.0.2": {
            "games": readables.tracked(ts["1.0.2"].live["games"], track),
            "gamesByPlayer": readables.tracked(ts["1.0.2"].live["gamesByPlayer"], track),
        },
        "1.1.0": {
            "games": readables.tracked(ts["1.1.0"].live["games"], track),
            "gamesByPlayer": readables.tracked(ts["1.1.0"].live["gamesByPlayer"], track),
        },
        "1.1.1": {
            "games": readables.tracked(ts["1.1.1"].live["games"], track),
            "gamesByPlayer1_1": readables.tracked(ts["1.1.1"].live["gamesByPlayer1_1"], track),
            "gamesByPlayer1_0": readables.tracked(ts["1.1.1"].live["gamesByPlayer1_0"], track),
        },
    }
    return [parentSet, res]
}
