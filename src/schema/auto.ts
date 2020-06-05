// DON'T EDIT THIS FILE, IT IS AUTO GENERATED

import {
    Integrators, liveReplay, readableFromDiffs, replayOrCheck,
    SideInputs, sortedDiffs, SpecType, Tables, copyTable, checkTableEquality,
    deleteCollection
} from '.'
import { applyChanges, diffToChange, validateLive } from '../base'
import * as db from '../db'
import * as model from '../model'
import { validate as validateModel } from '../model/index.validator'
import * as readables from '../readables'
import { Metadata, Outputs } from './interfaces'
import { validate as validateInterfaces } from './interfaces.validator'

export const PRIMARY_COLLECTION_ID = "1.1.1";
export const SECONDARY_COLLECTION_IDS = [] as [];
export const COLLECTION_IDS =
    ["1.1.1"] as
    ["1.1.1"];


export async function liveReplaySecondaries(
    ts: Tables, integrators: Integrators, actionId: string, savedAction: model.SavedAction): Promise<void> {
}

export async function replayAll(
    tx: db.TxRunner, integrators: Integrators,
    actionId: string, savedAction: model.SavedAction): Promise<void> {
    await replayOrCheck(SPEC["1.1.1"], tx, integrators, actionId, savedAction);
}

export async function reexportAll(tx: db.TxRunner): Promise<void> {
    await copyTable(tx,
        (db) => openAll(db)["1.1.1"].live["gamesByPlayer1_0"],
        (db) => openAll(db)["1.1.1"].exports["gamesByPlayer1_0"])
    await copyTable(tx,
        (db) => openAll(db)["1.1.1"].live["gamesByPlayer1_1"],
        (db) => openAll(db)["1.1.1"].exports["gamesByPlayer1_1"])
}

export async function checkExports(tx: db.TxRunner): Promise<void> {
    // gamesByPlayer-1.0
    await checkTableEquality(tx,
        (db) => openAll(db)["1.1.1"].live["gamesByPlayer1_0"],
        (db) => openAll(db)["1.1.1"].exports["gamesByPlayer1_0"])
    // gamesByPlayer-1.1
    await checkTableEquality(tx,
        (db) => openAll(db)["1.1.1"].live["gamesByPlayer1_1"],
        (db) => openAll(db)["1.1.1"].exports["gamesByPlayer1_1"])
}

export async function purgeDeprecated(tx: db.TxRunner): Promise<void> {
}

export const SPEC: SpecType = {
    "1.1.1": {
        collectionId: "1.1.1",
        schemata: {
            live: {
                "games": ["games-games-1.1.1"],
                "gamesByPlayer1_1": ["players", "games-gamesByPlayer1_1-1.1.1"],
                "gamesByPlayer1_0": ["players", "games-gamesByPlayer1_0-1.1.1"],
            },
            exports: {
                "gamesByPlayer1_1": ["players", "games-gamesByPlayer-1.1"],
                "gamesByPlayer1_0": ["players", "games-gamesByPlayer-1.0"],
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
            applyChanges(ts[this.collectionId].exports["gamesByPlayer1_1"], actionId, outputs["gamesByPlayer1_1"].map(diffToChange))
            applyChanges(ts[this.collectionId].live["gamesByPlayer1_0"], actionId, outputs["gamesByPlayer1_0"].map(diffToChange))
            applyChanges(ts[this.collectionId].exports["gamesByPlayer1_0"], actionId, outputs["gamesByPlayer1_0"].map(diffToChange))
        },
    },
};

export function openAll(db: db.Database): Tables {
    return {
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
                "gamesByPlayer1_1": db.open({
                    schema: SPEC["1.1.1"].schemata.exports["gamesByPlayer1_1"],
                    validator: validateLive(validateModel("PlayerGame1_1"))
                }),
                "gamesByPlayer1_0": db.open({
                    schema: SPEC["1.1.1"].schemata.exports["gamesByPlayer1_0"],
                    validator: validateLive(validateModel("PlayerGame1_0"))
                }),
            },
        },
    }
}

export function readAll(ts: Tables): [Set<string>, SideInputs] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const res: SideInputs = {
        "1.1.1": {
            "games": readables.tracked(ts["1.1.1"].live["games"], track),
            "gamesByPlayer1_1": readables.tracked(ts["1.1.1"].live["gamesByPlayer1_1"], track),
            "gamesByPlayer1_0": readables.tracked(ts["1.1.1"].live["gamesByPlayer1_0"], track),
        },
    }
    return [parentSet, res]
}
