import { InputOp, Op } from "./framework/graph";
import { State1_0 } from "./model";
import { validate } from "./model/index.validator";

export const S1_0: InputOp<State1_0> = {
    kind: "input",
    schema: ['game'],
    collectionId: 'state-1.0',
    validator: validate('State1_0')
}


const COLLECTION_GRAPH = {}
export const INPUT_OP: Op<State1_0, State1_0> = S1_0
export const INPUT_ID = INPUT_OP.collectionId

export function getCollections(): Record<string, Op<State1_0, any>> {
    let res: Record<string, Op<State1_0, any>> = {
        ...COLLECTION_GRAPH,
    }

    for (const cid in COLLECTION_GRAPH) {
        res = {
            ...res, 
            ...findSorts<State1_0, any>(COLLECTION_GRAPH[cid as keyof typeof COLLECTION_GRAPH])
        }
    }

    return res
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
