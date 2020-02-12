import { Firestore, Transaction } from "@google-cloud/firestore"
import { DBCollection } from "./db"
import deepEqual = require("deep-equal")
import _ from 'lodash'

export type Item<V> = [string[], V]

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

export interface MapFn<I, O> {
    (path: string[], value: I): Item<O>[]
}

type Itemify<T> = {
    [K in keyof T]: Item<T[K]>[]
}

export type SortedOp<S, T> = InputOp<SingleType<S, T>> | SortOp<S, T>

type Opify<S, T> = {
    [K in keyof T]: SortedOp<S, T[K]>
}

type SingleType<A, B> = A extends B ? B extends A ? A : never : never

export interface ReduceFn<I, O> {
    (path: string[], values: Item<I>[]): O
}

export type Op<S, T> = InputOp<SingleType<S, T>>
    | MapOp<S, any, T>
    | TransposeOp<S, T>
    | ReduceOp<S, unknown, T>
    | ReschemaOp<S, T>
    | SortOp<S, T>

export interface InputOp<T> {
    kind: 'input'
    schema: string[]
    collectionId: string
    validator: (u: unknown) => T
}

interface MapOp<S, I, O> {
    kind: 'map'
    subSchema: string[]
    input: Op<S, I>
    fn: MapFn<I, O>
}

interface TransposeOp<S, T> {
    kind: 'transpose'
    permutation: number[]
    input: Op<S, T>
}

interface ReduceOp<S, I, O> {
    kind: 'reduce'
    newSchema: string[]
    input: SortedOp<S, I>
    fn: ReduceFn<I, O>
}

interface ReschemaOp<S, T> {
    kind: 'reschema'
    newSchema: string[]
    input: Op<S, T>
}

interface SortOp<S, T> {
    kind: 'sort'
    input: Op<S, T>
    collectionId: string
    validator: (u: unknown) => T
}

export class Processor {
    constructor(private db: Firestore, private tx: Transaction) { }

    enumerate<S, T>(op: Op<S, T>): AsyncIterable<Item<T>> {
        switch (op.kind) {
            case "input":
            case "sort":
                const db = new DBCollection(this.db, this.tx,
                    toDbSchema(getSchema(op), op.collectionId), op.validator)
                return db.enumerate()
            case "map":
                return this.mapEnumerate(op)
            case "reduce":
                return this.reduceEnumerate(op)
            case "transpose":
                return this.transposeEnumerate(op)
            case "reschema":
                return this.enumerate(op.input)
        }
    }

    get<S, T>(op: Op<S, T>, key: string[]): Promise<T | null> {
        switch (op.kind) {
            case "input":
            case "sort":
                const db = new DBCollection(this.db, this.tx,
                    toDbSchema(getSchema(op), op.collectionId), op.validator)
                return db.get(key)
            case "map":
                return this.mapGet(op, key)
            case "reduce":
                return this.reduceGet(op, key)
            case "transpose":
                return this.transposeGet(op, key)
            case "reschema":
                return this.get(op.input, key)
        }
    }

    async reactTo<S, T>(op: Op<S, T>, diffs: Diff<S>[]): Promise<Diff<T>[]> {
        switch (op.kind) {
            case "input":
                return diffs as any as Diff<T>[]
            case "sort":
                return await this.reactTo(op.input, diffs)
            case "map":
                return await this.mapReact(op, diffs)
            case "reschema":
                return await this.reactTo(op.input, diffs)
            default:
                throw new Error('not impl')
            // case "reduce":
            //     return this.reduceGet(op, key)
            // case "transpose":
            //     return this.transposeGet(op, key)
        }
    }

    // Map.
    private async *mapEnumerate<S, I, O>(op: MapOp<S, I, O>): AsyncIterable<Item<O>> {
        for await (const [inputKey, inputValue] of this.enumerate(op.input)) {
            const outputValues = op.fn(inputKey, inputValue)
            for (const [extraPath, mappedValue] of outputValues) {
                yield [[...inputKey, ...extraPath], mappedValue]
            }
        }
    }

    private async mapGet<S, I, O>(op: MapOp<S, I, O>, key: string[]): Promise<O | null> {
        const inputKey = key.slice(0, key.length - op.subSchema.length)
        const inputValue = await this.get(op.input, inputKey)

        if (inputValue === null) {
            return null
        }

        const outputValues = op.fn(inputKey, inputValue)

        for (const [extraPath, value] of outputValues) {
            if (deepEqual(key, [...inputKey, ...extraPath])) {
                return value
            }
        }
        return null
    }

    private async mapReact<S, I, O>(op: MapOp<S, I, O>, diffs: Diff<S>[]): Promise<Diff<O>[]> {
        const inputDiffs = await this.reactTo(op.input, diffs)
        const unflattened = inputDiffs.map(diff => this.mapReactSingleDiff(op, diff))
        return _.flatten(unflattened)
    }

    private mapReactSingleDiff<S, I, O>(op: MapOp<S, I, O>, diff: Diff<I>): Diff<O>[] {
        switch (diff.kind) {
            case 'add':
            case 'delete': {
                const mapped = op.fn(diff.key, diff.value)
                return mapped.map(([extraKey, value]) => ({
                    kind: diff.kind,
                    key: [...diff.key, ...extraKey],
                    value
                })
                )
            }
            case 'replace': {
                const res: Diff<O>[] = []

                const oldMapped = op.fn(diff.key, diff.oldValue)
                const newMapped = op.fn(diff.key, diff.newValue)

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
    private async *reduceEnumerate<S, I, O>(op: ReduceOp<S, I, O>): AsyncIterable<Item<O>> {
        const batched = batchStream(this.sortedEnumerate(op.input), op.newSchema.length)
        for await (const batch of batched) {
            yield [batch.batchKey, op.fn(batch.batchKey, batch.items)]
        }
    }

    private async reduceGet<S, I, O>(op: ReduceOp<S, I, O>, key: string[]): Promise<O | null> {
        const qualified = qualify(key, this.query(op.input, key))
        const results: Item<I>[] = []
        for await (const r of qualified) {
            results.push(r)
        }

        if (results.length === 0) {
            return null
        }

        return op.fn(key, results)
    }

    // Transpose.
    private async *transposeEnumerate<S, T>(op: TransposeOp<S, T>): AsyncIterable<Item<T>> {
        for await (const [inputPath, value] of this.enumerate(op.input)) {
            yield [permute(op.permutation, inputPath), value]
        }
    }

    private async transposeGet<S, T>(op: TransposeOp<S, T>, key: string[]): Promise<T | null> {
        return this.get(op.input, permute(invertPermutation(op.permutation), key))
    }

    // Sorted
    private async *query<S, T>(op: SortedOp<S, T>, key: string[]): AsyncIterable<Item<T>> {
        const db = new DBCollection(this.db, this.tx,
            toDbSchema(getSchema(op), op.collectionId), op.validator)
        return db.query(key)
    }

    private async *sortedEnumerate<S, T>(op: SortedOp<S, T>): AsyncIterable<Item<T>> {
        const db = new DBCollection(this.db, this.tx,
            toDbSchema(getSchema(op), op.collectionId), op.validator)
        return db.sortedEnumerate()
    }
}

function getSchema<S, T>(op: Op<S, T>): string[] {
    switch (op.kind) {
        case "input":
            return op.schema
        case "map":
            return [...getSchema(op.input), ...op.subSchema]
        case "reduce":
            return op.newSchema
        case "transpose":
            return permute(op.permutation, getSchema(op.input))
        case "reschema":
            return op.newSchema
        case "sort":
            return getSchema(op.input)
    }
}


function invertPermutation(permutation: number[]): number[] {
    const res = permutation.map(() => -1)
    for (let i = 0; i < permutation.length; i++) {
        res[permutation[i]] = i
    }
    return res
}

function permute<T>(permutation: number[], a: T[]): T[] {
    return permutation.map(idx => a[idx])
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