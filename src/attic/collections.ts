import { DocumentData, Transaction, Firestore } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import batch from './batch'
// import { COLLECTION_GRAPH, getCollections, InputType, INPUT_ID, INPUT_OP } from './collections'
import GetConfig from './config'
import { DBHelper2, Dataspace, Database, Dataspace2, Database2, Dataspace3, HasId } from './framework/db'
import { getSchema, Op, Processor, Source, Diffs, InputInfo } from './framework/graph'
import { Action1_1, AnyAction, Action1_0, Game1_0, TaggedGame1_0, TaggedGame1_1, SavedAction } from './model'
import { validate as validateModel } from './model/index.validator'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import * as rev0 from './rev0'
import { InitialRevision, Changes } from './framework/revision'
import { mapValues } from './util'
import * as read from './flow/read';
import { ReadWrite, Change, Diff } from './framework/base'
import deepEqual from 'deep-equal'
import { DBs } from './framework/graph_builder'
import { Graph, load, CollectionBuilder, Readables, Key, ScrambledSpace, Mutation, Collection } from './flow/base'
import { multiIndexBy, transpose, map } from './flow/ops'
import { lexCompare } from './flow/util'
import { sha256 } from 'js-sha256'
import _ from 'lodash';



const HASH_HEX_CHARS_LEN = (32 / 8) * 2;  // 32 bits of hash
function serializeActionId(date: Date, hashHex: string): string {
    return `0${date.toISOString()}${hashHex.slice(0, HASH_HEX_CHARS_LEN)}`
}

function parseActionId(serialized: string): [Date, string] {
    if (serialized[0] !== '0') {
        throw new Error('unknown action ID format');
    }

    const dateStr = serialized.slice(1, serialized.length - HASH_HEX_CHARS_LEN);
    const hashStr = serialized.slice(serialized.length - HASH_HEX_CHARS_LEN);

    return [new Date(dateStr), hashStr]
}

export function getActionId(action: SavedAction): string {
    // TODO: JSON.stringify isn't deterministic, so what's saved in the DB
    // should really be a particular serialization, but I'm not worrying
    // about that at the moment.
    const hashHex = sha256.hex(JSON.stringify(action));
    const maxDate = _.max(action.parents.map(id => parseActionId(id)[0]));

    let now = new Date();

    // TODO: just fake the date rather than waiting.
    while (maxDate !== undefined && now < maxDate) {
        now = new Date();
    }
    return serializeActionId(now, hashHex);
}

export const ROOT_ACTION_ID = serializeActionId(new Date(0), sha256.hex(''));

// # Kinds of collections.
// ## Shared
// - Persisted. The stuff that's actually in the DB.
//
// ## Dynamic-only
// - IntegrationInputs. Stuff that can be derived from Persisted without a 
//   sort. A Readable for this is passed to the integrator.
// - Integrated. Deltas for these collections are produced by the integrator.
//   Every persisted collection must have at least one integrated collection,
//   though some integrated collections may be discarded or merely compared
//   to each other.
//
// ## Static-only
// - Derived: These are collections that can be derived from
//   persisted collections. Some subset of these will be committed
//   back to the persisted collections, but some may be discarded or merely
//   compared to each other. The operations should be acyclic, i.e., a collection
//   should never be derived from a persisted version of itself.




export type Persisted = {
    state1_0_0_games: TaggedGame1_0
    state1_0_1_replay_games: TaggedGame1_0
    state1_0_1_replay_gamesByPlayer: TaggedGame1_0
}



export type IntegrationInputs = {
    games1_0: TaggedGame1_0
}

export type Integrated = {
    state1_0_0_games: Game1_0
}


// export type Integrateable = {
//     gamesByPlayer1_0: Game1_0
// }

// export type Derived = {
//     // gamesByPlayer1_0: Game1_0
// }

export type Scrambles<Spec> = {
    [K in keyof Spec]: ScrambledSpace<Spec[K]>
}

type Ranges<Spec> = {
    [K in keyof Spec]: Range[]
}

export type Keys<Spec> = {
    [K in keyof Spec]: Key[]
}
export type Values<Spec> = {
    [K in keyof Spec]: (Spec[K] | null)[]
}
export type Mutations<Spec> = {
    [K in keyof Spec]: Mutation<Spec[K]>[]
}


export type InputSpecs<Spec> = {
    [K in keyof Spec]: InputInfo<Spec[K] & HasId>
}


// interface IntegrationInputsGenerator {
// }

// interface Integrator {
//     getInterest(a : Action1_0): Keys<IntegrationInputs>
//     getMutations(a : Action1_0, input : Values<IntegrationInputs>): Mutations<Integrated>
// }


// interface Deriver {
//     (input : Scrambles<Persisted>): Scrambles<Derived>
// }

export type Binding = {
    kind: 'integration'
    collection: keyof Integrated
}
//  | {
//     kind: 'derivation'
//     collection: keyof Derived
// }


// export type Binding = {
//     integrationPrimary: keyof (Integrated & Integrateable)
//     integrationSecondary: (keyof (Integrated & Integrateable))[]
//     derivationPrimary: (keyof Derived) | null
//     derivationSecondary: (keyof Derived)[]
// }

export type Bindings = {
    [K in keyof Persisted]: Binding[]
}


type Dataspaces<Spec> = {
    [K in keyof Spec]: Dataspace2<Spec[K]>
}

type Dataspaces2<Spec> = {
    [K in keyof Spec]: Dataspace3<Spec[K]>
}

export interface Dynamics {
    // transformInputs(input : Readables<Persisted>): Scrambles<IntegrationInputs>
    // getInterest(a : Action1_0): Keys<IntegrationInputs>
    integrate(a: Action1_0, input: Readables<Persisted>): Promise<Diffs<Integrated>>
    // deriveDiffs(input: Readables<Persisted>,
    //     integratedDiffs: Diffs<Persisted>): Promise<Diffs<Derived>>
}

export function openAll<Spec>(db: Database, infos: InputSpecs<Spec>): Dataspaces<Spec> {
    const res: Partial<Dataspaces<Spec>> = {}
    for (const untypedCollectionId in infos) {
        const collectionId = untypedCollectionId as keyof typeof infos;
        res[collectionId] = db.open(infos[collectionId]);
    }
    return res as Dataspaces<Spec>;
}


export function openAll2<Spec>(db: Database2, infos: InputSpecs<Spec>): Dataspaces2<Spec> {
    const res: Partial<Dataspaces2<Spec>> = {}
    for (const untypedCollectionId in infos) {
        const collectionId = untypedCollectionId as keyof typeof infos;
        res[collectionId] = db.open(infos[collectionId]);
    }
    return res as Dataspaces2<Spec>;
}

export async function doAction3(dynamics: Dynamics, action: Action1_0,
    db: Database, inputs: InputSpecs<Persisted>, bindings: Bindings): Promise<void> {
    // const inputs = dynamics.transformInputs(db);
    // const interest = dynamics.getInterest(action);
    const valuesP: Partial<Values<IntegrationInputs>> = {}

    // const parents = new Set<string>();
    // for (const untypedCollectionId in interest) {
    //     const collectionId = untypedCollectionId as keyof typeof interest;
    //     const collectionValues = await Promise.all(interest[collectionId].map(
    //         key=> read.getFromScrambledOrDefault(inputs[collectionId], key, null)));
    //         for (const value of collectionValues) {
    //             parents.add(value !== null ? value.actionId : ROOT_ACTION_ID)
    //         }
    //                 valuesP[collectionId]= collectionValues;
    // }

    // const sortedParents = Array.from(parents);
    // sortedParents.sort();
    // const savedAction : SavedAction= {
    //     parents: sortedParents,
    //     action,
    // }
    // const actionId = getActionId(savedAction); 

    // const values = valuesP as Values<IntegrationInputs>;

    const ds = openAll(db, inputs);

    const nullDiffs = ((): Diffs<Persisted> => {
        const res: Partial<Diffs<Persisted>> = {};
        for (const untypedCollectionId in inputs) {
            const collectionId = untypedCollectionId as keyof typeof inputs;
            res[collectionId] = [];
        }
        return res as Diffs<Persisted>
    })();

    const integratedDiffs = await dynamics.integrate(action, ds);
    db.freezeParents();

    // const derivedDiffs = await dynamics.deriveDiffs(ds, { ...nullDiffs, ...integratedDiffs });

    // const allDiffs: Diffs<Integrated & Integrateable> = {
    //     ...integratedDiffs,
    //     ...integrateableDiffs,
    // }

    for (const untypedPersistedId in bindings) {
        const persistedId = untypedPersistedId as keyof typeof bindings;
        const b = bindings[persistedId];

        // const canonicalDiffs = b[0].kind === 'integration'
        //     ? integratedDiffs[b[0].collection]
        //     : derivedDiffs[b[0].collection];
        if (b.length === 0) {
            continue;
        }
        const canonicalDiffs = integratedDiffs[b[0].collection];
        canonicalDiffs.sort((a, b) => lexCompare(a.key, b.key))
        // for (const secondarySource of b.slice(1)) {
        //     const secondaryDiffs = secondarySource.kind === 'integration'
        //         ? integratedDiffs[secondarySource.collection]
        //         : derivedDiffs[secondarySource.collection];
        //     secondaryDiffs.sort((a, b) => lexCompare(a.key, b.key))

        //     if (!deepEqual(canonicalDiffs, secondaryDiffs)) {
        //         // TODO: this should just report, not fail.
        //         throw new Error("secondary fail, yo");
        //     }
        // }

        for (const mutation of canonicalDiffs) {
            ds[persistedId].enqueue(mutation as any);
        }
    }
    db.commit(action);
    // for (const untypedPersistedId in bindings) {
    //     const persistedId = untypedPersistedId as keyof typeof bindings;
    //     await db[persistedId].prepCommit(actionId);
    // }
    // for (const untypedPersistedId in bindings) {
    //     const persistedId = untypedPersistedId as keyof typeof bindings;
    //     db[persistedId].commitMutations();
    // }
}

// // export type StateSpec = {
// //     games: TaggedGame1_0
// // }

// // export type SideSpec = {}

// // export type ExportSpec = {
// //     gamesByPlayer: TaggedGame1_0
// //     games1_1: TaggedGame1_1
// // }

// export function getStateReadables(db: Firestore, tx: Transaction): { [K in keyof StateSpec]: Dataspace<StateSpec[K]> } {
//     const helper = new DBHelper2(db, tx);
//     return {
//         games: helper.open({
//             schema: ["game"],
//             collectionId: "state-2.0",
//             validator: validateModel("TaggedGame1_0")
//         })
//     }
// }


// export function getDPL(db: Firestore, tx: Transaction): Dataspaces<Persisted> {
//     const helper = new DBHelper2(db, tx);
//     return {
//         games1_0: helper.open({
//             schema: ["game"],
//             collectionId: "state-2.0",
//             validator: validateModel("TaggedGame1_0")
//         }),
//         gamesByPlayer1_0: helper.open({
//             schema: ["player", "game"],
//             collectionId: "exports-2.0",
//             validator: validateModel("TaggedGame1_0")
//         })
//     }
// }

export function getDPLInfos(): InputSpecs<Persisted> {
    return {
        state1_0_0_games: {
            schema: ["game"],
            collectionId: "state-1.0.0",
            validator: validateModel("TaggedGame1_0")
        },
        state1_0_1_replay_games: {
            schema: ["game"],
            collectionId: "state-1.0.1-replay",
            validator: validateModel("TaggedGame1_0")
        },
        state1_0_1_replay_gamesByPlayer: {
            schema: ["player", "game"],
            collectionId: "state-1.0.1-replay",
            validator: validateModel("TaggedGame1_0")
        }
    }
}

// export function getExportsReadables(db: Firestore, tx: Transaction): { [K in keyof ExportSpec]: Dataspace<ExportSpec[K]> } {
//     const helper = new DBHelper2(db, tx);
//     return {
//         gamesByPlayer: helper.open({
//             schema: ["player", "game"],
//             collectionId: "exports-1.0",
//             validator: validateModel("TaggedGame1_0")
//         }),
//         games1_1: helper.open({
//             schema: ["game"],
//             collectionId: "state-1.1",
//             validator: validateModel("TaggedGame1_1")
//         })
//     }
// }


// function placeholders(): Graph<StateSpec, StateSpec> {
//     return {
//         games: load('games', ['game'])
//     }
// }
// function placeholders2(): Graph<Integrated, Integrated> {
//     return {
//         games1_0: load('games1_0', ['game'])
//     }
// }

// export function getExports(): Graph<StateSpec, ExportSpec> {
//     const ph = placeholders();
//     const gamesByPlayer = new CollectionBuilder(ph.games)
//         .pipe(multiIndexBy('player', (_, g) => g.players))
//         .pipe(transpose([1, 0])).collection;

//     const games1_1 =
//         new CollectionBuilder(ph.games)
//             .pipe(map((k: Key, old: TaggedGame1_0): TaggedGame1_1 => {
//                 return {
//                     ...old,
//                     state: 'CREATED',
//                     shortCode: '',
//                 }
//             }))
//             .collection;

//     return { gamesByPlayer, games1_1 }
// }

export function getDerived(): Graph<Persisted, Derived> {
    const games1_0: Collection<Persisted, Game1_0> = load('games1_0', ['game']);
    const gamesByPlayer1_0 = new CollectionBuilder(games1_0)
        .pipe(multiIndexBy('player', (_, g) => g.players))
        .pipe(transpose([1, 0])).collection;

    // const games1_1 = 
    //     new CollectionBuilder(ph.games)
    //     .pipe(map((k : Key, old : TaggedGame1_0): TaggedGame1_1 => {
    //         return {
    //             ...old,
    //             state: 'CREATED',
    //             shortCode: '',
    //         }
    //     }))
    //     .collection;

    return { gamesByPlayer1_0 }
}

// const S1_1: InputOp<InputType> = {
//     kind: "input",
//     schema: ['game'],
//     collectionId: 'state-1.1',
//     validator: validate('State1_1')
// }

// const S1_0: Op<InputType, State1_0> = (() => {
//     return singleMap(S1_1, (_key: string[], state: State1_1): State1_0 => {
//         return { players: state.players }
//     })
// })()

// const S1_1_bySc = ((): Op<InputType, {}> => {
//     const withSc: Op<InputType, {}> = {
//         kind: 'map',
//         subSchema: ['shortCode'],
//         input: S1_1,
//         fn(_key: string[], value: State1_1): Item<{}>[] {
//             if (0 < value.shortCode.length) {
//                 return [[[value.shortCode], {}]]
//             }
//             return []
//         }
//     }
//     const trans: Op<InputType, {}> = {
//         kind: 'transpose',
//         input: withSc,
//         permutation: [1, 0],
//     }
//     const sorted: SortedOp<InputType, {}> = {
//         kind: 'sort',
//         input: trans,
//         collectionId: 'sorted-bysc-1.1',
//         validator: (_u: unknown) => ({})
//     }
//     return {
//         kind: 'reduce',
//         newSchema: ['shortCode'],
//         input: sorted,
//         fn(_key: string[], _values: Item<{}>[]): {} {
//             return {}
//         }
//     }
// })()

// export const COLLECTION_GRAPH = {
//     'state-1.0': S1_0,
//     'state-bysc-1.1': S1_1_bySc,
// }

// export type InputType = State1_1
// export const INPUT_OP: Op<InputType, InputType> = S1_1
// export const INPUT_ID = INPUT_OP.collectionId

// export function getCollections(): Record<string, Op<InputType, any>> {
//     let res: Record<string, Op<InputType, any>> = COLLECTION_GRAPH

//     for (const cid in COLLECTION_GRAPH) {
//         const op: Op<InputType, any> = COLLECTION_GRAPH[cid as keyof typeof COLLECTION_GRAPH]
//         validateOp(op)
//         res = { ...res, ...findSorts(op) }
//     }

//     return res
// }

// function singleMap<S, I, O>(input: Op<S, I>, fn: (key: string[], value: I) => O): Op<S, O> {
//     return {
//         kind: "map",
//         subSchema: [],
//         input,
//         fn(key: string[], value: I): Item<O>[] {
//             return [[[], fn(key, value)]]
//         }
//     }
// }

// function findSorts<S, T>(op: Op<S, T>): Record<string, Op<S, any>> {
//     switch (op.kind) {
//         case 'input':
//             return {}
//         case 'sort':
//             return { ...findSorts(op.input), [op.collectionId]: op.input }
//         case 'map':
//         case 'reduce':
//         case 'reschema':
//         case 'transpose':
//             return findSorts(op.input)
//     }
// }
