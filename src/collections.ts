import { InputOp, Op, Item, validateOp, SortedOp } from "./framework/graph";
import { State1_0, State1_1 } from "./model";
import { validate } from "./model/index.validator";
import _ from 'lodash'

const S1_1: InputOp<InputType> = {
    kind: "input",
    schema: ['game'],
    collectionId: 'state-1.1',
    validator: validate('State1_1')
}

const S1_0: Op<InputType, State1_0> = (() => {
    return singleMap(S1_1, (_key: string[], state: State1_1): State1_0 => {
        return { players: state.players }
    })
})()

const S1_1_bySc = ((): Op<InputType, {}> => {
    const withSc: Op<InputType, {}> = {
        kind: 'map',
        subSchema: ['shortCode'],
        input: S1_1,
        fn(_key: string[], value: State1_1): Item<{}>[] {
            if (0 < value.shortCode.length) {
                return [[[value.shortCode], {}]]
            }
            return []
        }
    }
    const trans: Op<InputType, {}> = {
        kind: 'transpose',
        input: withSc,
        permutation: [1, 0],
    }
    const sorted: SortedOp<InputType, {}> = {
        kind: 'sort',
        input: trans,
        collectionId: 'sorted-bysc-1.1',
        validator: (_u: unknown) => ({})
    }
    return {
        kind: 'reduce',
        newSchema: ['shortCode'],
        input: sorted,
        fn(_key: string[], _values: Item<{}>[]): {} {
            return {}
        }
    }
})()

export const COLLECTION_GRAPH = {
    'state-1.0': S1_0,
    'state-bysc-1.1': S1_1_bySc,
}

export type InputType = State1_1
export const INPUT_OP: Op<InputType, InputType> = S1_1
export const INPUT_ID = INPUT_OP.collectionId

export function getCollections(): Record<string, Op<InputType, any>> {
    let res: Record<string, Op<InputType, any>> = COLLECTION_GRAPH

    for (const cid in COLLECTION_GRAPH) {
        const op: Op<InputType, any> = COLLECTION_GRAPH[cid as keyof typeof COLLECTION_GRAPH]
        validateOp(op)
        res = { ...res, ...findSorts(op) }
    }

    return res
}

function singleMap<S, I, O>(input: Op<S, I>, fn: (key: string[], value: I) => O): Op<S, O> {
    return {
        kind: "map",
        subSchema: [],
        input,
        fn(key: string[], value: I): Item<O>[] {
            return [[[], fn(key, value)]]
        }
    }
}

function findSorts<S, T>(op: Op<S, T>): Record<string, Op<S, any>> {
    switch (op.kind) {
        case 'input':
            return {}
        case 'sort':
            return { ...findSorts(op.input), [op.collectionId]: op.input }
        case 'map':
        case 'reduce':
        case 'reschema':
        case 'transpose':
            return findSorts(op.input)
    }
}
