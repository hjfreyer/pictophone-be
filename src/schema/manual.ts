// DON'T EDIT THIS FILE, IT IS AUTO GENERATED

// import {
//     readableFromDiffs, copyTable, checkTableEquality
// } from '.'
import {
    applyChanges, diffToChange, //validateLive, 
    getActionId
} from '../base'
// import * as db from '../db'
// import * as model from '../model'
// import * as readables from '../readables'
// import { Metadata, Outputs, AnyAction, AnyError, SavedAction, CollectionId } from './interfaces'
// import * as ints from './interfaces'
// import { Readable, Diff } from '../interfaces'
// import { validate as validateInterfaces } from './interfaces.validator'
// import * as util from '../util'

// import {validate as validate1_0} from '../model/1.0.validator';
// import {validate as validate1_1} from '../model/1.1.validator';
// import {validate as validate1_1_1} from '../model/1.1.1.validator';

// export const VALIDATORS = {
//     '1.0': validate1_0,
//     '1.1': validate1_1,
//     '1.1.1': validate1_1_1,
// }

// export const PRIMARY_COLLECTION_ID = "1.1.1";
// export const SECONDARY_COLLECTION_IDS = [] as [];
// export const COLLECTION_IDS =
//     ["1.1.1"] as
//     ["1.1.1"];


// export async function liveReplaySecondaries(
//     ts: Tables, integrators: Integrators, actionId: string, savedAction: SavedAction): Promise<void> {
// }

// export async function replayAll(
//     tx: db.TxRunner, integrators: Integrators,
//     actionId: string, savedAction: SavedAction): Promise<void> {
//     await replayOrCheck(SPEC["1.1.1"], tx, integrators, actionId, savedAction);
// }

// export async function reexportAll(tx: db.TxRunner): Promise<void> {
//     await copyTable(tx,
//         (db) => openAll(db)["1.1.1"].live["gamesByPlayer1_0"],
//         (db) => openAll(db)["1.1.1"].exports["gamesByPlayer1_0"])
//     await copyTable(tx,
//         (db) => openAll(db)["1.1.1"].live["gamesByPlayer1_1"],
//         (db) => openAll(db)["1.1.1"].exports["gamesByPlayer1_1"])
// }

// export async function checkExports(tx: db.TxRunner): Promise<void> {
//     // gamesByPlayer-1.0
//     await checkTableEquality(tx,
//         (db) => openAll(db)["1.1.1"].live["gamesByPlayer1_0"],
//         (db) => openAll(db)["1.1.1"].exports["gamesByPlayer1_0"])
//     // gamesByPlayer-1.1
//     await checkTableEquality(tx,
//         (db) => openAll(db)["1.1.1"].live["gamesByPlayer1_1"],
//         (db) => openAll(db)["1.1.1"].exports["gamesByPlayer1_1"])
// }

// export async function purgeDeprecated(tx: db.TxRunner): Promise<void> {
// }


// export type Tables = {
//     "ACTIONS": db.Table<SavedAction>
//     "META,1.1.1": db.Table<ints.Metadata1_1_1>
//     "IMPL,1.1.1,games": db.Table<import('../model/1.1.1').Game>
//     "IMPLEXP,1.1.1,1.0,gamesByPlayer": db.Table<import('../model/1.0').PlayerGame>
//     "IMPLEXP,1.1.1,1.1,gamesByPlayer": db.Table<import('../model/1.1').PlayerGame>
//     "EXP,1.0,gamesByPlayer": db.Table<import('../model/1.0').PlayerGame>
//     "EXP,1.1,gamesByPlayer": db.Table<import('../model/1.1').PlayerGame>
// }


// export type AllInputs = {
//     "IMPL,1.1.1,games": Readable<import('../model/1.1.1').Game>
// }

// export const OUTPUT_APPLIERS = {
//     '1.1.1'(db: db.Database, actionId: string, outputs: Outputs["1.1.1"]): void {
//         const ts = openAll(db);
//         ts["META,1.1.1"].set([actionId], OUTPUT_TO_METADATA['1.1.1'](outputs));
//             applyChanges(ts["IMPL,1.1.1,games"], actionId, outputs.private.tables["games"].map(diffToChange))
//             applyChanges(ts["IMPLEXP,1.1.1,1.0,gamesByPlayer"], actionId, outputs["1.0"].tables["gamesByPlayer"].map(diffToChange))
//             applyChanges(ts["IMPLEXP,1.1.1,1.1,gamesByPlayer"], actionId, outputs["1.1"].tables["gamesByPlayer"].map(diffToChange))
//             applyChanges(ts["EXP,1.0,gamesByPlayer"], actionId, outputs["1.0"].tables["gamesByPlayer"].map(diffToChange))
//             applyChanges(ts["EXP,1.1,gamesByPlayer"], actionId, outputs["1.1"].tables["gamesByPlayer"].map(diffToChange))
//     },
// }

// export type AllOutputs = {
//     "IMPL,1.1.1,games": Readable<import('../model/1.1.1').Game>
// }

// export const OUTPUT_TO_METADATA= {
//     '1.1.1'(outputs: Outputs["1.1.1"]): Metadata["1.1.1"] {
//         return {
//             outputs: {
//                 private: {
//                     "games": sortedDiffs(outputs.private["games"])
//                 },
//                 '1.0': {
//                     error:outputs['1.0'].error,
//                     tables: {
//                         "gamesByPlayer": sortedDiffs(outputs['1.0']["gamesByPlayer"])
//                     }
//                 },
//                                 '1.1': {
//                     error:outputs['1.1'].error,
//                     tables: {
//                         "gamesByPlayer": sortedDiffs(outputs['1.1']["gamesByPlayer"])
//                     }
//                 }
//             }
//         }
//     }
// }


// export const SPEC: SpecType = {
//     "1.1.1": {
//         collectionId: "1.1.1",
//         schemata: {
//             live: {
//                 "games": ["games-games-1.1.1"],
//                 "gamesByPlayer1_1": ["players", "games-gamesByPlayer1_1-1.1.1"],
//                 "gamesByPlayer1_0": ["players", "games-gamesByPlayer1_0-1.1.1"],
//             },
//             exports: {
//                 "gamesByPlayer1_1": ["players", "games-gamesByPlayer-1.1"],
//                 "gamesByPlayer1_0": ["players", "games-gamesByPlayer-1.0"],
//             }
//         },
//         selectMetadata(ts: Tables) { return ts[this.collectionId].meta },
//         selectSideInputs(rs: SideInputs) { return rs[this.collectionId] },
//         selectIntegrator(integrators: Integrators) { return integrators[this.collectionId] },
//         replaySideInputs(metas: AsyncIterable<Metadata["1.1.1"]>): SideInputs["1.1.1"] {
//             return {
//                 "games": readableFromDiffs(metas, meta => meta.outputs["games"], this.schemata.live["games"]),
//                 "gamesByPlayer1_1": readableFromDiffs(metas, meta => meta.outputs["gamesByPlayer1_1"], this.schemata.live["gamesByPlayer1_1"]),
//                 "gamesByPlayer1_0": readableFromDiffs(metas, meta => meta.outputs["gamesByPlayer1_0"], this.schemata.live["gamesByPlayer1_0"]),
//             }
//         },
//         emptyOutputs(): Outputs["1.1.1"] {
//             return {
//                 "games": [],
//                 "gamesByPlayer1_1": [],
//                 "gamesByPlayer1_0": [],
//             }
//         },
//         outputToMetadata(outputs: Outputs["1.1.1"]): Metadata["1.1.1"] {
//             return {
//                 outputs: {
//                     "games": sortedDiffs(outputs["games"]),
//                     "gamesByPlayer1_1": sortedDiffs(outputs["gamesByPlayer1_1"]),
//                     "gamesByPlayer1_0": sortedDiffs(outputs["gamesByPlayer1_0"]),
//                 }
//             }
//         },
//         applyOutputs(ts: Tables, actionId: string, outputs: Outputs["1.1.1"]): void {
//             ts[this.collectionId].meta.set([actionId], this.outputToMetadata(outputs));
//             applyChanges(ts[this.collectionId].live["games"], actionId, outputs["games"].map(diffToChange))
//             applyChanges(ts[this.collectionId].live["gamesByPlayer1_1"], actionId, outputs["gamesByPlayer1_1"].map(diffToChange))
//             applyChanges(ts[this.collectionId].exports["gamesByPlayer1_1"], actionId, outputs["gamesByPlayer1_1"].map(diffToChange))
//             applyChanges(ts[this.collectionId].live["gamesByPlayer1_0"], actionId, outputs["gamesByPlayer1_0"].map(diffToChange))
//             applyChanges(ts[this.collectionId].exports["gamesByPlayer1_0"], actionId, outputs["gamesByPlayer1_0"].map(diffToChange))
//         },
//     },
// };

// export function openAll(db: db.Database): Tables {
//     return {
//         "ACTIONS": db.open({
//             schema: ['actions'],
//             validator: validateInterfaces('SavedAction')
//         }),
//         "META,1.1.1": db.open({
//             schema: ['metadata-1.1.1'],
//             validator: validateInterfaces('Metadata1_1_1')
//         }),
//         "IMPL,1.1.1,games": db.open({
//             schema: ['games-games-1.1.1'],
//             validator: VALIDATORS['1.1.1']('Game')
//         }),
//         "IMPLEXP,1.1.1,1.0,gamesByPlayer": db.open({
//             schema: ['players', 'games-gamesByPlayer-1.0-1.1.1'],
//             validator: VALIDATORS['1.0']('PlayerGame')
//         }),
//         "IMPLEXP,1.1.1,1.1,gamesByPlayer": db.open({
//             schema: ['players', 'games-gamesByPlayer-1.1-1.1.1'],
//             validator: VALIDATORS['1.1']('PlayerGame')
//         }),
//         "EXP,1.0,gamesByPlayer": db.open({
//             schema: ['players', 'games-gamesByPlayer-1.0'],
//             validator: VALIDATORS['1.0']('PlayerGame')
//         }),
//         "EXP,1.1,gamesByPlayer": db.open({
//             schema: ['players', 'games-gamesByPlayer-1.1'],
//             validator: VALIDATORS['1.1']('PlayerGame')
//         }),
//     }
// }

// export function readAll(db: db.Database): [Set<string>, AllInputs] {
//     const ts = openAll(db);
//     const parentSet = new Set<string>();
//     const track = (actionId: string) => { parentSet.add(actionId) };
//     const res: AllInputs = {
//         "IMPL,1.1.1,games": readables.tracked(ts["IMPL,1.1.1,games"], track),
//     }
//     return [parentSet, res]
// }


// // export type ExportedOutput1_0 =  {
// //     gamesByPlayer: Diff<v1_0.PlayerGame>[]
// // }


// // export type ExportedOutput1_1 =  {
// //     gamesByPlayer: Diff<v1_1.PlayerGame>[]
// // }

// // export type PrivateOutput1_1_1 =  {
// //     games: Diff<v1_1_1.Game>[]
// // }

// // export type Input1_1_1 =  {
// //     games: Readable<v1_1_1.Game>
// // }

// // export type Output1_1_1 = {
// //     private: PrivateOutput1_1_1
// //     '1.0': ExportedOutput1_0
// //     '1.1': ExportedOutput1_1
// // }

// export type SideInputs = {
//     '1.1.1': {
//             games: Readable<import('../model/1.1.1').Game>
//         }
// }

// export interface Implementations {
//     '1.1.1': {
//         integrate(action: import('../model/1.1.1').Action, inputs: SideInputs['1.1.1']): Promise<Outputs['1.1.1']>
//         convertAction: {
//             '1.0'(action: import('../model/1.0').Action): import('../model/1.1.1').Action
//         '1.1'(action: import('../model/1.1').Action): import('../model/1.1.1').Action
//         }
//         convertError: {
//             '1.0'(action: import('../model/1.1.1').Error): import('../model/1.0').Error
//             '1.1'(action: import('../model/1.1.1').Error): import('../model/1.1').Error
//         }
//     }
// }

// const INPUT_MAPPERS = {
//     '1.1.1'(i: AllInputs): SideInputs['1.1.1'] {
//         return {
//             games: i["IMPL,1.1.1,games"]
//         }
//     }
// }

// export const LIVE_PRIMARY = {
//     '1.0'(db: db.Database,
//         impls: Implementations, action: import('../model/1.0').Action): Promise<[string, SavedAction, import('../model/1.0').Error | null]> {
//     const [parents, rs] = readAll(db);

//     const outs = await impls['1.1.1'].integrate(impls['1.1.1'].actionConverters['1.0'].action, INPUT_MAPPERS['1.1.1'](rs));

//     // Save the action and metadata.
//     const savedAction: SavedAction = { parents: util.sorted(parents), action }
//     const actionId = getActionId(savedAction)
//     OUTPUT_APPLIERS['1.1.1'](db, actionId, outs);

//     return [actionId, savedAction, outs];
//     }
// }
// export async function livePrimary(
//     db: db.Database,
//     impls: Implementations, action: AnyAction): Promise<[string, SavedAction, AnyError | null]> {
//     const [parents, rs] = readAll(db);

//     const outs = await impls['1.1.1'](action, INPUT_MAPPERS['1.1.1'](rs));

//     // Save the action and metadata.
//     const savedAction: SavedAction = { parents: util.sorted(parents), action }
//     const actionId = getActionId(savedAction)
//     OUTPUT_APPLIERS['1.1.1'](db, actionId, outs);

//     return [actionId, savedAction, outs];
// }

// export async function deleteCollection(runner: db.TxRunner, collectionId: CollectionId): Promise<void> {
//     await runner(async (db: db.Database): Promise<void> => {
//         const ts = openAll(db);
//         switch (collectionId) {
//         case '1.1.1':
//             await deleteTable(ts['META,1.1.1'])
//             await deleteTable(ts["IMPL,1.1.1,games"]);
//             await deleteTable(ts["IMPLEXP,1.1.1,1.0,gamesByPlayer"]);
//             await deleteTable(ts["IMPLEXP,1.1.1,1.1,gamesByPlayer"]);
//         }
//     })
// }



// export function sortedDiffs<T>(diffs: Iterable<Diff<T>>): Diff<T>[] {
//     return util.sorted(diffs, (d1, d2) => util.lexCompare(d1.key, d2.key));
// }
