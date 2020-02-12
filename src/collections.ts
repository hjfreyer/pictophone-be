import { Diff, ReadableCollection, WriteableCollection, MappedEnumerable, MappedReactive, EchoReactive, CombinedWriteable } from "./framework/incremental";
import * as v1_0 from './model/v1.0'
import * as v1_1 from './model/v1.1'
import { Firestore, Transaction } from "@google-cloud/firestore";
import validator from "./model/validator";
import { DBCollection } from "./framework/db";
import { InputOp, Op } from "./framework/graph";
import { exportMapper } from "./model/v1.0/logic";

type Indexes = {
    'v1.0': import('./model/v1.0').Index
    'v1.1': import('./model/v1.1').Index
}

// Graph based.

export const S1_0 : InputOp<Indexes['v1.0']['State']> = {
    kind: "input",
    schema: ['universe'],
    collectionId: 'v1.0-state',
    validator: validator('v1.0', 'State')
}

export const E1_0 : Op<Indexes['v1.0']['State'], Indexes['v1.0']['Export']> = exportMapper(S1_0)

// Collection-based below.


export interface InputCollections {
    ['v1.0-state']: ReadableCollection<Indexes['v1.0']['State']>
    ['v1.1-exports-universe']: ReadableCollection<Indexes['v1.1']['Export']>
}

export interface OutputCollectons {
    ['v1.0-exports']: WriteableCollection<Indexes['v1.0']['State'], Indexes['v1.0']['Export']>
    ['v1.1-state']: WriteableCollection<Indexes['v1.0']['State'], Indexes['v1.1']['State']>
    ['v1.1-exports']: WriteableCollection<Indexes['v1.0']['State'], Indexes['v1.1']['Export']>
    ['v1.1-exports-universe']: WriteableCollection<
        Indexes['v1.0']['State'], Indexes['v1.1']['Export']>
    // ['v1.1-exports-games-nouniverse']: WriteableCollection<
    //     Indexes['v1.0']['State'], Indexes['v1.1']['Export']>
}

export function inputCollections(db: Firestore, tx: Transaction): InputCollections {
    return {
        "v1.0-state": new DBCollection(db, tx, ['v1.0-universe'], validator('v1.0', 'State')),
        "v1.1-exports-universe": new DBCollection(
            db, tx, ['players', 'games', 'v1.1-exports-universe'], validator('v1.1', 'Export'))
    }
}

export function pipeline(i: InputCollections): OutputCollectons {
    const v1ExportsEnumerable = new MappedEnumerable(new v1_0.ExportMapper(), i['v1.0-state'])
    const v1ExportsReactive = new MappedReactive(new v1_0.ExportMapper(), new EchoReactive())

    const state1_1E = new MappedEnumerable(new v1_1.UpgradeStateMapper(), i['v1.0-state'])
    const state1_1R = new MappedReactive(new v1_1.UpgradeStateMapper(), new EchoReactive())

    const exports1_1E = v1_1.exportStateEnumerable(state1_1E)
    const exports1_1R = v1_1.exportStateReactive(state1_1R)

    const exports1_12E = v1_1.exportState2Enumerable(state1_1E)
    const exports1_12R = v1_1.exportState2Reactive(state1_1R)

    // const exports1_13E = v1_1.exportState3Enumerable(exports1_12E)
    // const exports1_13R = v1_1.exportState3Reactive(state1_1R)

    return {
        "v1.0-exports": new CombinedWriteable(['universe', 'players', 'v1.0-exports-games'],
            v1ExportsEnumerable, v1ExportsReactive),
        "v1.1-state": new CombinedWriteable(['universe', 'v1.1-state-games'],
            state1_1E, state1_1R),
        "v1.1-exports": new CombinedWriteable(['universe', 'players', 'v1.1-exports-games'],
            exports1_1E, exports1_1R),
        "v1.1-exports-universe": new CombinedWriteable(
            ['players', 'games', 'v1.1-exports-universe'],
            exports1_12E, exports1_12R),
        // "v1.1-exports-games-nouniverse": new CombinedWriteable(
        //     ['players', 'v1.1-exports-games-nouniverse'],
        //     exports1_13E, exports1_13R),
    }
}

// export type SavedCollections = {
//     'v1.0-state': SortedCollection<v1_0.State>
//     'v1.0-exports': SortedCollection<v1_0.Export>
//     'v1.1-state': SortedCollection<v1_1.State>
// }

// export function makeSavedCollections(db: Firestore, tx: Transaction): SavedCollections {
//     return {
//         'v1.0-state': new DBCollection(db, tx, ['v1.0-universe'], validator('v1.0', 'State')),
//         'v1.0-exports': new DBCollection(
//             db, tx, ['v1.0-exports', 'v1.0-exports-players', 'v1.0-exports-games'],
//             validator('v1.0', 'Export')),
//         'v1.1-state': new DBCollection(db, tx, ['v1.1-state-universe', 'v1.1-state-games'],
//             validator('v1.1', 'State'))
//     }
// }

// export function derivedDynamicCollections(
//     input: SortedDynamicCollection<v1_0.State, v1_0.Action, Diff<v1_0.State>>) {
//     return {
//         'v1.1-state': new MappedSortedDynamicCollection(
//             ['v1.1-state-universe', 'v1.1-state-games'],
//             v1_1.upgradeStateMapper,
//             input
//         ),
//         'v1.0-exports': new MappedSortedDynamicCollection(
//             ['v1.0-exports', 'v1.0-exports-players', 'v1.0-exports-games'],
//             v1_0.exportMapper,
//             input)
//     }
// }

// export function derivedCollections(input: SortedCollection<v1_0.State>) {
//     const state1_1=new MappedSortedCollection(
//             ['v1.1-state-universe', 'v1.1-state-games'],
//             v1_1.upgradeStateMapper,
//             input
//         )
//     const exports1_1_bad_order = new MappedSortedCollection(
//             ['v1.1-exports', 'v1.1-exports-games', 'v1.1-exports-players'],
//             v1_1.exportMapper,
//             state1_1)

//     const exports1_1 = new TransposedCollection(
//         ['v1.1-exports', 'v1.1-exports-players', 'v1.1-exports-games'],
//         [0, 2, 1],
//         exports1_1_bad_order)

//     return {
//         'v1.1-state':state1_1 ,
//         'v1.1-exports': exports1_1,
//         'v1.0-exports': new MappedSortedCollection(
//             ['v1.0-exports', 'v1.0-exports-players', 'v1.0-exports-games'],
//             v1_0.exportMapper,
//             input)
//     }
// }