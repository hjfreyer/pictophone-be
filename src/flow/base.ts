import { Option, sortedMerge, batchStreamBy, Comparator } from "./util"
import { from, toArray } from "ix/asynciterable"
import { map } from "ix/asynciterable/operators"
import _ from 'lodash'
import { Range, Bound, singleValue, isInfinite } from './range'
import { lexCompare } from "./util"
import deepEqual from "deep-equal"

export type Key = string[]

export type Item<V> = [string[], V]

export interface Cursor<V> {
    key: Key
    value: V
    cursor: Bound<Key>
}

export type Change<V> = {
    key: string[]
    kind: 'set'
    value: V
} | {
    key: string[]
    kind: 'delete'
}

export type Diff<V> = {
    key: string[]
    kind: 'add' | 'delete'
    value: V
} | {
    key: string[]
    kind: 'replace'
    oldValue: V
    newValue: V
}

export type Diffs<Spec> = {
    [K in keyof Spec]: Diff<Spec[K]>[]
}

export type ItemIterable<V> = AsyncIterable<Item<V>>
export type CursorIterable<V> = AsyncIterable<Cursor<V>>

export interface Readable<T> {
    schema: string[]
    sortedList(range: Range<Key>): ItemIterable<T>
}

export type Readables<Spec> = {
    [K in keyof Spec]: Readable<Spec[K]>
}

export interface MonoOp<I, O> {
    schema: string[]
    image(inputRange: Range<Key>): Range<Key>
    preimage(outputRange: Range<Key>): Range<Key>
    apply(inputIter: ItemIterable<I>): ItemIterable<O>
}

// export interface SortedMonoOp<I, O> {
//     schema: string[]
//     image(inputRange: Range<Key>): Range<Key>
//     preimage(outputRange: Range<Key>): Range<Key>
//     applySorted(inputIter: CursorIterable<I>): CursorIterable<O>
// }

// export interface OrderNeedingMonoOp<I, O> {
//     schema: string[]
//     image(inputRange : Range<Key>): Range<Key>
//     preimage(outputRange: Range<Key>): Range<Key>
//     applyToOrdered(inputIter: ItemIterator<I>): ItemIterator<O>
// }


export type Graph<Inputs, Intermediates, Outputs> = {
    [K in keyof Outputs]: Collection<Inputs, Intermediates, Outputs[K]>
}

export type IntermediateCollections<Inputs, Intermediates> = {
    [K in keyof Intermediates]?: Collection<Inputs, Intermediates, Intermediates[K]>
}

export type Collection<Inputs, Intermediates, T> =// SortedCollection<Inputs, Intermediates, T> | 
    OpNode<Inputs, Intermediates, T>
    | LoadNode<Inputs, T>
    | SortNode<Inputs, Intermediates, T>
    | MergeNode<Inputs, Intermediates, T>;

interface OpNode<Inputs, Intermediates, O> {
    kind: 'op'
    visit<R>(go: <I>(input: Collection<Inputs, Intermediates, I>, op: MonoOp<I, O>) => R): R
}

// export type SortedCollection<Inputs, Intermediates, T> =
//     LoadNode<Inputs, T>
//     | SortedOpNode<Inputs, Intermediates, T>
//     | SortNode<Inputs, Intermediates, T>
//     | MergeNode<Inputs, Intermediates, T>

interface LoadNode<Inputs, T> {
    kind: 'load'
    schema: string[]
    visit<R>(go: <K extends keyof Inputs>(k: K, cast: (t: Inputs[K]) => T) => R): R
}

// interface SortedOpNode<Inputs, Intermediates, O> {
//     kind: 'sorted_op'
//     visit<R>(go: <I>(input: SortedCollection<Inputs, Intermediates, I>, op: SortedMonoOp<I, O>) => R): R
// }

// interface OpRequiresOrderNode<Inputs, Intermediates, O> {
//     kind: 'op_requires_order'
//     visit<R>(go: <I>(input: OrderedGraph<Inputs, Intermediates, I>, op : OrderPreservingMonoOp<I, O>) => R): R
// }

interface SortNode<Inputs, Intermediates, T> {
    kind: 'sort'
    input: Collection<Inputs, Intermediates, T>,
    visit<R>(go: <K extends keyof Intermediates>(k: K, cast: (t: Intermediates[K]) => T) => R): R
}

interface MergeNode<Inputs, Intermediates, T> {
    kind: 'merge'
    inputs: Collection<Inputs, Intermediates, T>[],
}

export function enumerate<Inputs, Intermediates, T>(
    collection: Collection<Inputs, Intermediates, T>,
    inputs: Readables<Inputs>,
    intermediates: Readables<Intermediates>,
    startFromCursor: Bound<Key>): ItemIterable<T> {
    switch (collection.kind) {
        //        case "sorted_op":
        case "merge":
        case "load":
        case "sort":
            return query(collection, inputs, intermediates, {start: startFromCursor, end: {kind:'unbounded'}})
        case "op":
            return collection.visit((input, op) => {
                const enumeratedInput = enumerate(input, inputs, intermediates, startFromCursor);
                return op.apply(enumeratedInput);
            })
    }
}

// export function sortedList<Inputs, Intermediates, T>(
//     collection: SortedCollection<Inputs, Intermediates, T>,
//     inputs: Readables<Inputs>,
//     intermediates: Readables<Intermediates>,
//     startFromCursor: Bound<Key>): CursorIterable<T> {
//     const inputRange: Range<Key> = {
//         start: startFromCursor,
//         end: { kind: 'unbounded' }
//     };
//     switch (collection.kind) {
//         case "load":
//             return collection.visit((key, _cast): CursorIterable<T> => {
//                 // Assumes that _cast will be the identity function. I could change 
//                 // this to explicitly cast each row.
//                 const readable = inputs[key] as any as Readable<T>;

//                 return from(readable.sortedList(inputRange)).pipe(
//                     map(([key, value]): Cursor<T> => ({
//                         key,
//                         value,
//                         cursor: { kind: 'exclusive', value: key },
//                     }))
//                 );
//             })
//         case "sort":
//             return collection.visit((key, _cast): CursorIterable<T> => {
//                 // Assumes that _cast will be the identity function. I could change 
//                 // this to explicitly cast each row.
//                 const readable = intermediates[key] as any as Readable<T>;

//                 return from(readable.sortedList(inputRange)).pipe(
//                     map(([key, value]): Cursor<T> => ({
//                         key,
//                         value,
//                         cursor: { kind: 'exclusive', value: key },
//                     }))
//                 );
//             })

//         case "sorted_op":
//             return collection.visit((input, op) => {
//                 return op.applySorted(sortedList(input, inputs, intermediates, startFromCursor));
//             })

//         case "merge":
//             throw "not implemented"
//     }
// }


export function query<Inputs, Intermediates, T>(
    collection: Collection<Inputs, Intermediates, T>,
    inputs: Readables<Inputs>,
    intermediates: Readables<Intermediates>,
    range: Range<Key>): ItemIterable<T> {
    switch (collection.kind) {
        case "merge":
            throw "not implemented"
        case "load":
            return collection.visit((key, _cast): ItemIterable<T> => {
                // Assumes that _cast will be the identity function. I could change 
                // this to explicitly cast each row.
                const readable = inputs[key] as any as Readable<T>;

                return readable.sortedList(range);
            });
        case "sort":
            return collection.visit((key, _cast): ItemIterable<T> => {
                // Assumes that _cast will be the identity function. I could change 
                // this to explicitly cast each row.
                const readable = intermediates[key] as any as Readable<T>;
                return readable.sortedList(range);
            })
        case "op":

            return collection.visit((input, op) => {
                const inputRange = op.preimage(range);
                if (isInfinite(inputRange)) {
                    throw "not doing a full DB scan";
                }
                return op.apply(query(input, inputs, intermediates, inputRange))
            })
    }
}

export function getIntermediates<Inputs, Intermediates, Outputs>(
    graph: Graph<Inputs, Intermediates, Outputs>): IntermediateCollections<Inputs, Intermediates> {
    let res: IntermediateCollections<Inputs, Intermediates> = {};
    for (const untypedCollectionId in graph) {
        const collectionId = untypedCollectionId as keyof typeof graph;
        res = {...res, ...getIntermediatesForCollection(graph[collectionId])}
    }
    return res;
}

function getIntermediatesForCollection<Inputs, Intermediates, T>(
    collection: Collection<Inputs, Intermediates, T>): IntermediateCollections<Inputs, Intermediates> {
    switch (collection.kind) {
        case "load":
            return {}
        case "sort":
            return collection.visit(
                <K extends keyof Intermediates>(
                    k: K, _cast: any): IntermediateCollections<Inputs, Intermediates> => {
                    const res: IntermediateCollections<Inputs, Intermediates> = {};
                    res[k] = collection.input as any as Collection<Inputs, Intermediates, Intermediates[K]>

                    //                    [k as K]: (collection.input as any as Collection<Inputs, Intermediates, Intermediates[K]>)
                    return res
                });
        case "merge":
            const res: IntermediateCollections<Inputs, Intermediates> = {};
            for (const input of collection.inputs) {
                const subIntermeds = getIntermediatesForCollection(input);
                for (const untypedIntermedId in subIntermeds) {
                    const intermedId = untypedIntermedId as keyof typeof subIntermeds;
                    res[intermedId] = subIntermeds[intermedId];
                }
            }
            return res;
        case "op":
            return collection.visit((input, _op) => getIntermediatesForCollection(input)
            )

    }
}

export async function getDiffs<Inputs, Intermediates, Outputs>(
    graph: Graph<Inputs, Intermediates, Outputs>,
    inputs: Readables<Inputs>,
    intermediates: Readables<Intermediates>,
    inputDiffs: Diffs<Inputs>): Promise<[Partial<Diffs<Intermediates>>, Diffs<Outputs>]> {
    const intermeds: Partial<Diffs<Intermediates>> = {};
    const intermedCollections = getIntermediates(graph);
    for (const untypedCollectionId in intermedCollections) {
        const collectionId = untypedCollectionId as keyof typeof intermedCollections;
        intermeds[collectionId] = await collectionDiffs(
            intermedCollections[collectionId]!, inputs, intermediates, inputDiffs);
    }

    const outs: Partial<Diffs<Outputs>> = {};
    for (const untypedCollectionId in graph) {
        const collectionId = untypedCollectionId as keyof typeof graph;
        outs[collectionId] = await collectionDiffs(graph[collectionId], inputs, intermediates, inputDiffs);
    }
    return [intermeds, outs as Diffs<Outputs>];
}


async function collectionDiffs<Inputs, Intermediates, T>(
    collection: Collection<Inputs, Intermediates, T>,
    inputs: Readables<Inputs>,
    intermediates: Readables<Intermediates>,
    inputDiffs: Diffs<Inputs>): Promise<Diff<T>[]> {
    switch (collection.kind) {
        case "load":
            return collection.visit((key, _cast): Diff<T>[] => {
                // Assumes that _cast will be the identity function. I could change 
                // this to explicitly cast each diff.
                return inputDiffs[key] as any as Diff<T>[];
            })
        case "sort":
            return collectionDiffs(collection.input, inputs, intermediates, inputDiffs);
        case "merge":
            return _.flatten(await Promise.all(collection.inputs.map(i => collectionDiffs(i, inputs, intermediates, inputDiffs))));
        case "op":
            return toArray(collection.visit((input, op) => collectionDiffsOp(input, op, inputs, intermediates, inputDiffs)))
    }
}

async function* collectionDiffsOp<Inputs, Intermediates, I, O>(input: Collection<Inputs, Intermediates, I>,
    op: MonoOp<I, O>,
    inputs: Readables<Inputs>,
    intermediates: Readables<Intermediates>,
    sourceDiffs: Diffs<Inputs>): AsyncIterable<Diff<O>> {
    const inputDiffs = await collectionDiffs(input, inputs, intermediates, sourceDiffs);
    const outputRanges = inputDiffs.map(d => op.image(singleValue(d.key)));
    const inputRanges = outputRanges.map(r => op.preimage(r));

    for (const inputSubspace of inputRanges) {
        const oldOutput = op.apply(query(input, inputs, intermediates, inputSubspace));
        const newOutput = op.apply(patch(query(input, inputs, intermediates, inputSubspace), inputDiffs));

        const taggedOld: AsyncIterable<['old' | 'new', Item<O>]> = from(oldOutput).pipe(
            map(i => ['old', i])
        );
        const taggedNew: AsyncIterable<['old' | 'new', Item<O>]> = from(newOutput).pipe(
            map(i => ['new', i])
        );

        const cmp: Comparator<['old' | 'new', Item<O>]> =
            ([_aa, [akey, _av]], [_ba, [bkey, _bv]]) => lexCompare(akey, bkey)
        const merged = sortedMerge([taggedOld, taggedNew], cmp);
        for await (const batch of batchStreamBy(merged, cmp)) {
            if (2 < batch.length) {
                throw "batch too big!"
            }
            if (batch.length == 2) {
                const [key, oldValue] = batch[0][0] == 'old' ? batch[0][1] : batch[1][1];
                const [, newValue] = batch[0][0] == 'new' ? batch[0][1] : batch[1][1];

                if (!deepEqual(oldValue, newValue)) {
                    yield {
                        kind: 'replace',
                        key,
                        oldValue,
                        newValue,
                    }
                }
            }
            // Else, batch.length == 1.
            const [age, [key, value]] = batch[0];
            yield {
                kind: age === 'old' ? 'delete' : 'add',
                key,
                value,
            }
        }
    }

}


async function* toStream<T>(v: T[]): AsyncIterable<T> {
    yield* v
}

async function* patch<T>(input: ItemIterable<T>,
    diffs: Diff<T>[]): ItemIterable<T> {

    const sortedDiffs = [...diffs]
    sortedDiffs.sort((a, b) => lexCompare(a.key, b.key))

    const merged = merge(input, toStream(sortedDiffs))

    for await (const [key, inputValue, diff] of merged) {
        if (diff === null) {
            if (inputValue === null) {
                throw new Error('bad code')
            }
            yield [key, inputValue]
            continue
        }
        switch (diff.kind) {
            case 'add':
                yield [diff.key, diff.value]
                break
            case 'delete':
                break
            case 'replace':
                yield [diff.key, diff.newValue]
                break
        }
    }
}

async function* merge<T>(input: ItemIterable<T>, diffs: AsyncIterable<Diff<T>>):
    AsyncIterable<[string[], T | null, Diff<T> | null]> {

    const iteri = input[Symbol.asyncIterator]()
    const iterd = diffs[Symbol.asyncIterator]()
    let i = await iteri.next()
    let d = await iterd.next()

    while (true) {
        if (i.done && d.done) {
            return
        }
        if (i.done && !d.done) {
            yield [d.value.key, null, d.value]
            d = await iterd.next()
        }
        if (!i.done && d.done) {
            const [key, value] = i.value
            yield [key, value, null]
            i = await iteri.next()
        }
        if (!i.done && !d.done) {
            const [ikey, ivalue] = i.value
            const dkey = d.value.key

            if (lexCompare(ikey, dkey) < 0) {
                // ikey < dkey
                yield [ikey, ivalue, null]
                i = await iteri.next()
            }
            if (lexCompare(ikey, dkey) > 0) {
                // ikey > dkey
                yield [dkey, null, d.value]
                d = await iterd.next()
            }
            if (lexCompare(ikey, dkey) === 0) {
                // ikey === dkey
                yield [ikey, ivalue, d.value]
                i = await iteri.next()
                d = await iterd.next()
            }
        }
    }
}