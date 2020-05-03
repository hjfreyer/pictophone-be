import { Firestore, Transaction } from "@google-cloud/firestore"
import deepEqual from "deep-equal"
import _ from 'lodash'
import { invertPermutation, keyStartsWith, lexCompare, permute, streamTakeWhile, toStream } from "../util"
import { Diff, Item } from "./base"
import { DBHelper2 } from "./db"

export interface InputInfo<T> {
    schema: string[]
    collectionId: string
    validator: (u: unknown) => T
}

export type Source<S> = {
    [K in keyof S]: InputInfo<S[K]>
}

export type Diffs<StateSpec> = {
    [K in keyof StateSpec]: Diff<StateSpec[K]>[]
}

export interface MapFn<I, O> {
    subSchema: string[]
    map(path: string[], value: I): Item<O>[]
}

// export interface ReduceFn<I, O> {
//     (path: string[], values: Item<I>[]): O
// }


export type Op<InputSpec, IntermediateSpec, T> =
    LoadOp<InputSpec, T>
    | MapOp<InputSpec, IntermediateSpec, T>
    | TransposeOp<InputSpec, IntermediateSpec, T>
    | ReschemaOp<InputSpec, IntermediateSpec, T>
    | SortOp<InputSpec, IntermediateSpec, T>
// | ReduceOp<S, any, T>


interface LoadOp<InputSpec, T> {
    kind: 'load',
    schema: string[]
    visit<R>(go: <K extends keyof InputSpec>(k: K, ii_cast: (t: InputInfo<InputSpec[K]>) => InputInfo<T>,
        diff_cast: (t: Diff<InputSpec[K]>[]) => Diff<T>[]) => R): R
}

interface MapOp<InputSpec, IntermediateSpec, T> {
    kind: 'map'
    visit<R>(go: <I>(input: Op<InputSpec, IntermediateSpec, I>, map: MapFn<I, T>) => R): R
}

interface TransposeOp<InputSpec, IntermediateSpec, T> {
    kind: 'transpose'
    permutation: number[]
    input: Op<InputSpec, IntermediateSpec, T>
}

// interface ReduceOp<S, I, O> {
//     kind: 'reduce'
//     newSchema: string[]
//     input: SortedOp<S, I>
//     fn: ReduceFn<I, O>
// }

interface ReschemaOp<InputSpec, IntermediateSpec, T> {
    kind: 'reschema'
    newSchema: string[]
    input: Op<InputSpec, IntermediateSpec, T>
}

interface SortOp<InputSpec, IntermediateSpec, T> {
    kind: 'sort'
    input: Op<InputSpec, IntermediateSpec, T>
    key: keyof IntermediateSpec
}

export class Processor<InputSpec, IntermediateSpec> {
    constructor(private db: Firestore, private tx: Transaction,
        private inputs: Source<InputSpec>,
        private intermediates: Source<IntermediateSpec>) { }

    list<T>(op: Op<InputSpec, IntermediateSpec, T>, startAt: string[]): AsyncIterable<Item<T>> {
        switch (op.kind) {
            case "load":
                return op.visit((key, ii_cast, _) => {
                    const inputInfo = ii_cast(this.inputs[key]);
                    return new DBHelper2(this.db, this.tx).open(inputInfo).sortedList(startAt);
                });

            case "sort": {
                const intermediate = this.intermediates[op.key] as any as InputInfo<T>;
                return new DBHelper2(this.db, this.tx).open(intermediate).sortedList(startAt);
            }
            case "map":
                return op.visit((input, fn) => { return this.mapList(input, fn, startAt) });
            // case "reduce":
            //     return this.reduceList(op, startAt)
            case "transpose":
                return this.transposeList(op, startAt)
            case "reschema":
                return this.list(op.input, startAt)
        }
    }


    enumerate<T>(op: Op<InputSpec, IntermediateSpec, T>): AsyncIterable<Item<T>> {
        return this.list(op, getSchema(op).map(() => ''))
    }
    async get<T>(op: Op<InputSpec, IntermediateSpec, T>, key: string[]): Promise<T | null> {
        for await (const [k, value] of this.list(op, key)) {
            if (deepEqual(k, key)) {
                return value
            } else {
                return null
            }
        }
        return null
    }

    listWithPrefix<T>(op: Op<InputSpec, IntermediateSpec, T>, prefix: string[]): AsyncIterable<Item<T>> {
        const extension = Array(getSchema(op).length - prefix.length).fill('')
        return streamTakeWhile(this.list(op, [...prefix, ...extension]),
            ([key,]) => keyStartsWith(key, prefix))
    }

    async reactTo<T>(op: Op<InputSpec, IntermediateSpec, T>, diffs: Diffs<InputSpec>): Promise<Diff<T>[]> {
        switch (op.kind) {
            case "load":
                return op.visit((key, _, diff_cast) => diff_cast(diffs[key]));
            case "sort":
                return await this.reactTo(op.input, diffs)
            case "map":
                return op.visit((input, fn) => { return this.mapReact(input, fn, diffs) });
            case "reschema":
                return await this.reactTo(op.input, diffs)
            // case "reduce":
            //     return this.reduceReact(op, diffs)
            case "transpose":
                return this.transposeReact(op, diffs)
        }
    }

    // Map.
    private async *mapList<I, O>(input: Op<InputSpec, IntermediateSpec, I>, fn: MapFn<I, O>, startAt: string[]): AsyncIterable<Item<O>> {
        const inputStart = startAt.slice(0, getSchema(input).length)
        for await (const [inputKey, inputValue] of this.list(input, inputStart)) {
            const outputValues = fn.map(inputKey, inputValue)
            outputValues.sort(([a,], [b,]) => lexCompare(a, b))
            for (const [extraPath, mappedValue] of outputValues) {
                const outputKey = [...inputKey, ...extraPath]
                if (lexCompare(startAt, outputKey) <= 0) {
                    // startAt <= outputKey
                    yield [outputKey, mappedValue]
                }
            }
        }
    }

    private async mapReact<I, O>(input: Op<InputSpec, IntermediateSpec, I>, fn: MapFn<I, O>, diffs: Diffs<InputSpec>): Promise<Diff<O>[]> {
        console.log('orig diffs', JSON.stringify(diffs));
        const inputDiffs = await this.reactTo(input, diffs)
        console.log('input diffs', JSON.stringify(inputDiffs));
        const unflattened = inputDiffs.map(diff => this.mapReactSingleDiff(fn, diff))
        console.log('mapped diffs', JSON.stringify(unflattened));
        return _.flatten(unflattened)
    }

    private mapReactSingleDiff<I, O>(fn: MapFn<I, O>, diff: Diff<I>): Diff<O>[] {
        switch (diff.kind) {
            case 'add':
            case 'delete': {
                const mapped = fn.map(diff.key, diff.value)
                return mapped.map(([extraKey, value]) => ({
                    kind: diff.kind,
                    key: [...diff.key, ...extraKey],
                    value
                })
                )
            }
            case 'replace': {
                const res: Diff<O>[] = []

                const oldMapped = fn.map(diff.key, diff.oldValue)
                const newMapped = fn.map(diff.key, diff.newValue)

                const oldByKey: Record<string, O> = {}
                const newByKey: Record<string, O> = {}

                for (const [oldExtraKey, value] of oldMapped) {
                    oldByKey[oldExtraKey.toString()] = value
                }
                for (const [newExtraKey, value] of newMapped) {
                    newByKey[newExtraKey.toString()] = value
                }

                for (const [oldExtraKey, oldValue] of oldMapped) {
                    if (oldExtraKey.toString() in newByKey) {
                        const newValue = newByKey[oldExtraKey.toString()]
                        if (!deepEqual(oldValue, newValue)) {
                            res.push({
                                kind: 'replace',
                                key: [...diff.key, ...oldExtraKey],
                                oldValue,
                                newValue
                            })
                        }
                    } else {
                        res.push({
                            kind: 'delete',
                            key: [...diff.key, ...oldExtraKey],
                            value: oldValue,
                        })
                    }
                }
                for (const [newExtraKey, newValue] of newMapped) {
                    if (!(newExtraKey.toString() in oldByKey)) {
                        res.push({
                            kind: 'add',
                            key: [...diff.key, ...newExtraKey],
                            value: newValue,
                        })
                    }
                }
                return res
            }
        }
    }


    // Reduce.
    // private async *reduceList<S, I, O>(op: ReduceOp<S, I, O>, startAt: string[]): AsyncIterable<Item<O>> {
    //     const extension = Array(getSchema(op.input).length - op.newSchema.length).fill('')
    //     const inputStart = [...startAt, ...extension]
    //     const batched = batchStream(this.list(op.input, inputStart), op.newSchema.length)
    //     for await (const batch of batched) {
    //         yield [batch.batchKey, op.fn(batch.batchKey, batch.items)]
    //     }
    // }

    // private async reduceReact<S, I, O>(op: ReduceOp<S, I, O>, sourceDiffs: Diff<S>[]): Promise<Diff<O>[]> {
    //     const inputDiffs = await this.reactTo(op.input, sourceDiffs)
    //     const sortedDiffs = [...inputDiffs]
    //     sortedDiffs.sort((a, b) => lexCompare(a.key, b.key))

    //     const batchedDiffs = batchStreamBy(toStream(sortedDiffs),
    //         (d) => d.key.slice(0, op.newSchema.length),
    //         lexCompare)

    //     const res: Diff<O>[] = []
    //     for await (const [outputKey, batchDiffs] of batchedDiffs) {
    //         const oldBatchInput = await toArray(this.listWithPrefix(op.input, outputKey))
    //         const newBatchInput = await toArray(patch(
    //             this.listWithPrefix(op.input, outputKey),
    //             batchDiffs))

    //         if (_.isEmpty(oldBatchInput) && _.isEmpty(newBatchInput)) {
    //             throw new Error("something went wrong")
    //         }
    //         if (_.isEmpty(oldBatchInput) && !_.isEmpty(newBatchInput)) {
    //             res.push({
    //                 key: outputKey,
    //                 kind: 'add',
    //                 value: op.fn(outputKey, newBatchInput)
    //             })
    //         }
    //         if (!_.isEmpty(oldBatchInput) && _.isEmpty(newBatchInput)) {
    //             res.push({
    //                 key: outputKey,
    //                 kind: 'delete',
    //                 value: op.fn(outputKey, oldBatchInput)
    //             })
    //         }
    //         if (!_.isEmpty(oldBatchInput) && !_.isEmpty(newBatchInput)) {
    //             res.push({
    //                 key: outputKey,
    //                 kind: 'replace',
    //                 oldValue: op.fn(outputKey, oldBatchInput),
    //                 newValue: op.fn(outputKey, newBatchInput)
    //             })
    //         }
    //     }
    //     return res
    // }

    // Transpose.
    private async *transposeList<T>(op: TransposeOp<InputSpec, IntermediateSpec, T>, startAt: string[]): AsyncIterable<Item<T>> {
        const inputStart = permute(invertPermutation(op.permutation), startAt)
        for await (const [inputPath, value] of this.list(op.input, inputStart)) {
            yield [permute(op.permutation, inputPath), value]
        }
    }

    private async transposeReact<T>(op: TransposeOp<InputSpec, IntermediateSpec, T>, diffs: Diffs<InputSpec>): Promise<Diff<T>[]> {
        const inputDiffs = await this.reactTo(op.input, diffs)
        return inputDiffs.map(diff => ({
            ...diff,
            key: permute(op.permutation, diff.key),
        }))
    }
}


async function* patch<T>(input: AsyncIterable<Item<T>>,
    diffs: Diff<T>[]): AsyncIterable<Item<T>> {

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

async function* merge<T>(input: AsyncIterable<Item<T>>, diffs: AsyncIterable<Diff<T>>):
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

async function* validateStream<T>(validator: (u: unknown) => T,
    input: AsyncIterable<Item<unknown>>): AsyncIterable<Item<T>> {
    for await (const [key, value] of input) {
        yield [key, validator(value)]
    }
}

// export function validateOp<S, T>(op: Op<S, T>): void {
//     switch (op.kind) {
//         case "input":
//             break
//         case "map":
//             validateOp(op.input)
//             break
//         case "reduce": {
//             validateOp(op.input)
//             const inputSchema = getSchema(op.input)
//             const inputOrder = getOrder(op.input)
//             for (let idx = 0; idx < op.newSchema.length; idx++) {
//                 assert.equal(inputSchema[idx], op.newSchema[idx])
//                 assert.equal(inputOrder[idx], idx)
//             }


//             break
//         }
//         case "transpose": {
//             validateOp(op.input)
//             assert.equal(op.permutation.length, getSchema(op.input).length)
//             const covered = new Set<number>()
//             for (const num of op.permutation) {
//                 if (covered.has(num) || num < 0 || op.permutation.length <= num) {
//                     assert.fail(`not a permutation: ${op.permutation}`)
//                 }
//                 covered.add(num)
//             }
//             break
//         }
//         case "reschema":
//             validateOp(op.input)
//             assert.equal(op.newSchema.length, getSchema(op.input).length)
//             break
//         case "sort":
//             validateOp(op.input)
//             break
//     }
// }

export function getSchema<InputSpec, IntermediateSpec, T>(op: Op<InputSpec, IntermediateSpec, T>): string[] {
    switch (op.kind) {
        case "load":
            return op.schema
        case "map":
            return op.visit((input, fn) => [...getSchema(input), ...fn.subSchema])
        // case "reduce":
        //     return op.newSchema
        case "transpose":
            return permute(op.permutation, getSchema(op.input))
        case "reschema":
            return op.newSchema
        case "sort":
            return getSchema(op.input)
    }
}

export function getOrder<InputSpec, IntermediateSpec, T>(op: Op<InputSpec, IntermediateSpec, T>): number[] {
    switch (op.kind) {
        case "load":
        case "sort":
            //        case "reduce":
            return getSchema(op).map((_, i) => i)
        case "map":
            return op.visit((input, fn) => {
                const base = getOrder(input)
                const rest = fn.subSchema.map((_, i) => i + base.length)
                return [...base, ...rest]
            })

        case "transpose":
            return permute(op.permutation, getOrder(op.input))
        case "reschema":
            return getOrder(op.input)
    }
}


function toDbSchema(schema: string[], collectionId: string) {
    const last = `${schema[schema.length - 1]}-${collectionId}`
    return [...schema.slice(schema.length - 1), last]
}

async function* qualify<T>(baseKey: string[], inputs: AsyncIterable<Item<T>>): AsyncIterable<Item<T>> {
    for await (const [key, value] of inputs) {
        yield [[...baseKey, ...key], value]
    }
}

type Batch<T> = {
    batchKey: string[]
    items: Item<T>[]
}

async function* batchStream<T>(inputs: AsyncIterable<Item<T>>, keyLength: number): AsyncIterable<Batch<T>> {
    const iter = inputs[Symbol.asyncIterator]()
    for (let entry = await iter.next(); !entry.done;) {
        const [entryKey,] = entry.value
        const batchKey = entryKey.slice(0, keyLength)
        const items: Item<T>[] = []

        for (; !entry.done; entry = await iter.next()) {
            const [entryKey, entryValue] = entry.value
            const baseKey = entryKey.slice(0, keyLength)
            const extraKey = entryKey.slice(keyLength)

            if (!deepEqual(batchKey, baseKey)) {
                break
            }

            items.push([extraKey, entryValue])
        }

        yield { batchKey, items }
    }
}