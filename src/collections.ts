import { DocumentData, Transaction, Firestore} from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import batch from './batch'
// import { COLLECTION_GRAPH, getCollections, InputType, INPUT_ID, INPUT_OP } from './collections'
import GetConfig from './config'
import {  DBHelper2, Dataspace } from './framework/db'
import { getSchema, Op, Processor, Source, Diffs } from './framework/graph'
import { Action1_1, AnyAction, Action1_0, Game1_0, TimestampedGame1_0 } from './model'
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
import { Graph, load, CollectionBuilder, Readables } from './flow/base'
import { multiIndexBy, transpose } from './flow/ops'


type StateSpec = {
    games: TimestampedGame1_0
}

type SideSpec = {}

type ExportSpec = {
    gamesByPlayer: TimestampedGame1_0
}

export function getStateReadables(db : Firestore, tx:Transaction): {[K in keyof StateSpec]: Dataspace<StateSpec[K]>} {
    const helper = new DBHelper2(db, tx);
    return {
        games: helper.open({
            schema: ["game"],
            collectionId: "state-2.0",
            validator: validateModel("TimestampedGame1_0")
        })
    }
}
export function getExportsReadables(db : Firestore, tx:Transaction): {[K in keyof ExportSpec]: Dataspace<ExportSpec[K]>} {
    const helper = new DBHelper2(db, tx);
    return {
        gamesByPlayer: helper.open({
            schema: ["player", "game"],
            collectionId: "exports-2.0",
            validator: validateModel("TimestampedGame1_0")
        })
    }
}


function placeholders(): Graph<StateSpec, {}, StateSpec> {
    return {
        games: load('games', ['game'])
    }
}

function graph(): Graph<StateSpec, {}, ExportSpec> {
    const ph = placeholders();
    const gamesByPlayer = new CollectionBuilder(ph.games)
        .pipe(multiIndexBy('player', (_, g) => g.players))
        .pipe(transpose([1, 0])).collection;

    return { gamesByPlayer }
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
