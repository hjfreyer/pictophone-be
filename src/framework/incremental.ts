import deepEqual from "deep-equal"
import _ from 'lodash'
import { lexCompare } from "../util"

export type Item<V> = [string[], V]

export type Diff<V> = {
    kind: 'add' | 'delete'
    value: V
} | {
    kind: 'replace'
    oldValue: V
    newValue: V
}

export interface Enumerable<T> {
    enumerate(): AsyncIterable<Item<T>>
    get(path: string[]): Promise<T | null>
}

export interface Queryable<T> {
    sortedEnumerate(): AsyncIterable<Item<T>>
    query(basePath: string[]): AsyncIterable<Item<T>>
}

export interface Reactive<I, O> {
    reactTo(diffs: Item<Diff<I>>[]): Promise<Item<Diff<O>>[]>
}

export interface ReadableCollection<T> extends Enumerable<T>, Queryable<T> {
    schema: string[]
}

export interface WriteableCollection<I, O> extends Enumerable<O>, Reactive<I, O> {
    schema: string[]
}


export class EchoReactive<V> implements Reactive<V, V> {
    async reactTo(diffs: Item<Diff<V>>[]): Promise<Item<Diff<V>>[]> {
        return diffs
    }
}
export class DowngradedQueryable<T> implements Enumerable<T> {
    constructor(private input: Queryable<T>) { }

    enumerate() { return this.input.sortedEnumerate() }
    async get(key: string[]): Promise<T | null> {
        let res: T | null = null

        for await (const [, value] of this.input.query(key)) {
            res = value
        }

        return res
    }
}
// export type Collection<V> = {
//     schema: string[]

//     unsortedList(): AsyncIterable<Item<V>>
//     get(path: string[]): Promise<V | null>
// }

// export type SortedCollection<V> = Collection<V> & {
//     list(basePath: string[]): AsyncIterable<Item<V>>
// }

// export type DynamicCollection<V, AI, AO> = Collection<V> & Dynamic<AI, AO>

// export type Dynamic<AI, AO> = {
//     respondTo(actions: Item<AI>[]): Promise<Item<AO>[]>
// }

// export interface PreservingCollectionFunction<I, O, A> {
//     onSortedDynamic(t: SortedDynamicCollection<I, A, Diff<I>>): SortedDynamicCollection<O, A, Diff<O>>
//     onSorted(t: SortedCollection<I>): SortedCollection<O>
// }

// export function mapOp<I, O, A>(schema: string[], mapper: Mapper<I, O>):
//     PreservingCollectionFunction<I, O, A> {
//     return {
//         onSortedDynamic(t: SortedDynamicCollection<I, A, Diff<I>>): SortedDynamicCollection<O, A, Diff<O>> {
//             return new MappedSortedDynamicCollection(schema, mapper, t)
//         }
//     }
// }

// export class MappedSortedCollection<I, O> implements SortedCollection<O> {

// type PreservingFunction<T, R> = T extends SortedDynamicCollection<infer V, infer AI, infer AO>
//     ? (u: T) => SortedDynamicCollection<R, AI, AO>
//     : T extends SortedCollection<infer V> ? SortedCollection<R>
//     : never


// export interface UnaryFunction<T, R> { (source: T): R }

// export interface CollectionFunction<T, R> extends UnaryFunction<Collection<T>, Collection<R>> { }


// export interface SortedCollectionFunction<T, R> extends UnaryFunction<SortedCollection<T>, SortedCollection<R>> { }



// export type SortedDynamicCollection<V, AI, AO> = SortedCollection<V> & DynamicCollection<V, AI, AO>

export interface Mapper<I, O> {
    newDims: number
    map(path: string[], value: I): Item<O>[]
}


export interface Reducer<I, O> {
    reduceDims: number
    reduce(path: string[], values: Item<I>[]): O
}



export class MappedEnumerable<I, O> implements Enumerable<O> {
    constructor(private mapper: Mapper<I, O>,
        private input: Enumerable<I>) { }

    async *enumerate(): AsyncIterable<Item<O>> {
        for await (const [inputKey, inputValue] of this.input.enumerate()) {
            const outputValues = this.mapper.map(inputKey, inputValue)
            for (const [extraPath, mappedValue] of outputValues) {
                yield [[...inputKey, ...extraPath], mappedValue]
            }
        }
    }

    async get(key: string[]): Promise<O | null> {
        const inputKey = key.slice(0, key.length - this.mapper.newDims)
        const inputValue = await this.input.get(inputKey)

        if (inputValue === null) {
            return null
        }

        const outputValues = this.mapper.map(inputKey, inputValue)

        for (const [extraPath, value] of outputValues) {
            if (deepEqual(key, [...inputKey, ...extraPath])) {
                return value
            }
        }
        return null
    }
}

export class MappedReactive<I, O, S> implements Reactive<S, O> {
    constructor(private mapper: Mapper<I, O>,
        private input: Reactive<S, I>) { }

    async reactTo(sourceDiffs: Item<Diff<S>>[]): Promise<Item<Diff<O>>[]> {
        const inputDiffs = await this.input.reactTo(sourceDiffs)
        const unflattened = inputDiffs.map(([path, diff]) => this.reactToDiff(path, diff))
        return _.flatten(unflattened)
    }

    private reactToDiff(path: string[], diff: Diff<I>): Item<Diff<O>>[] {
        switch (diff.kind) {
            case 'add':
            case 'delete': {
                const mapped = this.mapper.map(path, diff.value)
                return mapped.map(
                    ([extraPath, value]) => [[...path, ...extraPath], { kind: diff.kind, value }]
                )
            }
            case 'replace': {
                const res: Item<Diff<O>>[] = []

                const oldMapped = this.mapper.map(path, diff.oldValue)
                const newMapped = this.mapper.map(path, diff.newValue)

                const oldByKey: Record<string, O> = {}
                const newByKey: Record<string, O> = {}

                for (const [oldExtraPath, value] of oldMapped) {
                    oldByKey[oldExtraPath.toString()] = value
                }
                for (const [newExtraPath, value] of newMapped) {
                    newByKey[newExtraPath.toString()] = value
                }

                for (const [oldExtraPath, oldValue] of oldMapped) {
                    if (oldExtraPath.toString() in newByKey) {
                        const newValue = newByKey[oldExtraPath.toString()]
                        if (!deepEqual(oldValue, newValue)) {
                            res.push([[...path, ...oldExtraPath],
                            { kind: 'replace', oldValue, newValue }])
                        }
                    } else {
                        res.push([[...path, ...oldExtraPath],
                        { kind: 'delete', value: oldValue }])
                    }
                }
                for (const [newExtraPath, newValue] of newMapped) {
                    if (!(newExtraPath.toString() in oldByKey)) {
                        res.push([[...path, ...newExtraPath],
                        { kind: 'add', value: newValue }])
                    }
                }
                return res
            }
        }
    }
}

export class CombinedWriteable<S, O> implements WriteableCollection<S, O> {
    constructor(
        public schema: string[],
        private enumerable: Enumerable<O>,
        private reactive: Reactive<S, O>) { }

    enumerate() { return this.enumerable.enumerate() }
    get(key: string[]) { return this.enumerable.get(key) }
    reactTo(diffs: Item<Diff<S>>[]) { return this.reactive.reactTo(diffs) }
}

export class TransposedEnumerable<V> implements Enumerable<V> {
    constructor(private permutation: number[],
        private input: Enumerable<V>) { }

    get(path: string[]): Promise<V | null> {
        const inputPath = permute(invertPermutation(this.permutation), path)
        return this.input.get(inputPath)
    }

    async *enumerate(): AsyncIterable<Item<V>> {
        for await (const [inputPath, value] of this.input.enumerate()) {
            yield [permute(this.permutation, inputPath), value]
        }
    }
}

export class TransposedReactive<S, V> implements Reactive<S, V> {
    constructor(private permutation: number[],
        private input: Reactive<S, V>) { }

    async reactTo(sourceDiffs: Item<Diff<S>>[]): Promise<Item<Diff<V>>[]> {
        const inputDiffs = await this.input.reactTo(sourceDiffs)
        return inputDiffs.map(([path, diff]) => [permute(this.permutation, path), diff])
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

type Batch<V> = {
    batchKey: string[]
    items: Item<V>[]
}

export class ReducedQueryable<I, O> implements Queryable<O> {
    constructor(private reducer: Reducer<I, O>,
        private input: Queryable<I>) { }

    async *query(basePath: string[]): AsyncIterable<Item<O>> {
        const qualified = this.qualify(basePath, this.input.query(basePath))
        const batched = this.batchStream(qualified)
        for await (const batch of batched) {
            const relativePath = batch.batchKey.slice(basePath.length)
            yield [relativePath, this.reducer.reduce(batch.batchKey, batch.items)]
        }
    }

    async *sortedEnumerate(): AsyncIterable<Item<O>> {
        const batched = this.batchStream(this.input.sortedEnumerate())
        for await (const batch of batched) {
            yield [batch.batchKey, this.reducer.reduce(batch.batchKey, batch.items)]
        }
    }

    private async* qualify(baseKey: string[], inputs: AsyncIterable<Item<I>>): AsyncIterable<Item<I>> {
        for await (const [key, value] of inputs) {
            yield [[...baseKey, ...key], value]
        }
    }

    // inputs must have fully qualified keys.
    private async* batchStream(inputs: AsyncIterable<Item<I>>): AsyncIterable<Batch<I>> {
        const iter = inputs[Symbol.asyncIterator]()
        for (let entry = await iter.next(); !entry.done;) {
            const [entryKey,] = entry.value
            const batchKey = entryKey.slice(0, entryKey.length - this.reducer.reduceDims)
            const items: Item<I>[] = []

            for (; !entry.done; entry = await iter.next()) {
                const [entryKey, entryValue] = entry.value
                const baseKey = entryKey.slice(0, entryKey.length - this.reducer.reduceDims)
                const extraKey = entryKey.slice(entryKey.length - this.reducer.reduceDims)

                if (!deepEqual(batchKey, baseKey)) {
                    break
                }

                items.push([extraKey, entryValue])
            }

            yield { batchKey, items }
        }
    }
}

// export class ReducedReactive<I, O, S> implements Reactive<S, O> {
//     constructor(private reducer: Reducer<I, O>,
//         private q: Queryable<I>,
//         private r: Reactive<S, I>) { }

//    async reactTo(diffs: Item<Diff<S>>[]): Promise<Item<Diff<O>>[]> {
//         const input = await this.r.reactTo(diffs)

//         const impactedKeys : string[][] = []
//         for (const [key, ] of input) {
//             impactedKeys.push(key.slice(0, key.length - this.reducer.reduceDims))
//         }

//         impactedKeys.sort(lexCompare)
//         _.uniqWith()

//     }

//     async *query(basePath: string[]): AsyncIterable<Item<O>> {
//         const qualified = this.qualify(basePath, this.input.query(basePath))
//         const batched = this.batchStream(qualified)
//         for await (const batch of batched) {
//             const relativePath = batch.batchKey.slice(basePath.length)
//             yield [relativePath, this.reducer.reduce(batch.batchKey, batch.items)]
//         }
//     }

//     async *sortedEnumerate(): AsyncIterable<Item<O>> {
//         const batched = this.batchStream(this.input.sortedEnumerate())
//         for await (const batch of batched) {
//             yield [batch.batchKey, this.reducer.reduce(batch.batchKey, batch.items)]
//         }
//     }

//     private async* qualify(baseKey: string[], inputs: AsyncIterable<Item<I>>): AsyncIterable<Item<I>> {
//         for await (const [key, value] of inputs) {
//             yield [[...baseKey, ...key], value]
//         }
//     }

//     // inputs must have fully qualified keys.
//     private async* batchStream(inputs: AsyncIterable<Item<I>>): AsyncIterable<Batch<I>> {
//         const iter = inputs[Symbol.asyncIterator]()
//         for (let entry = await iter.next(); !entry.done;) {
//             const [entryKey,] = entry.value
//             const batchKey = entryKey.slice(0, entryKey.length - this.reducer.reduceDims)
//             const items: Item<I>[] = []

//             for (; !entry.done; entry = await iter.next()) {
//                 const [entryKey, entryValue] = entry.value
//                 const baseKey = entryKey.slice(0, entryKey.length - this.reducer.reduceDims)
//                 const extraKey = entryKey.slice(entryKey.length - this.reducer.reduceDims)

//                 if (!deepEqual(batchKey, baseKey)) {
//                     break
//                 }

//                 items.push([extraKey, entryValue])
//             }

//             yield { batchKey, items }
//         }
//     }
// }

// export class MappedCollection<I, O, S> implements WriteableCollection<O> {
//     constructor(public schema: string[],
//         private mapper: Mapper<I, O>,
//         private input: SortedCollection<I>) { }

//     async get(path: string[]): Promise<O | null> {
//         const basePath = path.slice(0, this.input.schema.length)
//         const base = await this.input.get(basePath)

//         if (base === null) {
//             return null
//         }

//         const mapped = this.mapper(basePath, base)

//         for (const [extraPath, value] of mapped) {
//             if (deepEqual(path, [...basePath, ...extraPath])) {
//                 return value
//             }
//         }
//         return null
//     }

//     async *unsortedList(): AsyncIterable<Item<O>> {
//         for await (const [path, value] of this.input.unsortedList()) {
//             const mapped = this.mapper(path, value)
//             for (const [extraPath, mappedValue] of mapped) {
//                 yield [[...path, ...extraPath], mappedValue]
//             }
//         }
//     }

//     async *list(basePath: string[]): AsyncGenerator<Item<O>, any, unknown> {
//         const baserPath = basePath.slice(0, this.input.schema.length)

//         for await (const [middlePath, baseValue] of this.input.list(baserPath)) {
//             const mapped = this.mapper([...baserPath, ...middlePath], baseValue)

//             for (const [extraPath, mappedValue] of mapped) {
//                 const fullPath = [...baserPath, ...middlePath, ...extraPath]
//                 if (deepEqual(basePath, fullPath.slice(0, basePath.length))) {
//                     yield [fullPath.slice(basePath.length), mappedValue]
//                 }
//             }
//         }
//     }
// }

// export class MappedSortedDynamicCollection<I, O, A> implements SortedDynamicCollection<O, A, Diff<O>> {
//     constructor(public schema: string[],
//         private mapper: Mapper<I, O>,
//         private input: SortedDynamicCollection<I, A, Diff<I>>) { }

//     get(path: string[]): Promise<O | null> {
//         return new MappedSortedCollection(this.schema, this.mapper, this.input)
//             .get(path)
//     }

//     unsortedList(): AsyncIterable<Item<O>> {
//         return new MappedSortedCollection(this.schema, this.mapper, this.input)
//             .unsortedList()
//     }

//     list(basePath: string[]): AsyncIterable<Item<O>> {
//         return new MappedSortedCollection(this.schema, this.mapper, this.input)
//             .list(basePath)
//     }

//     async respondTo(actions: Item<A>[]): Promise<Item<Diff<O>>[]> {
//         const diffs = await this.input.respondTo(actions)
//         const unflattened = diffs.map(([path, diff]) => this.respondToDiff(path, diff))
//         return _.flatten(unflattened)
//     }

//     private respondToDiff(path: string[], diff: Diff<I>): Item<Diff<O>>[] {
//         switch (diff.kind) {
//             case 'add':
//             case 'delete': {
//                 const mapped = this.mapper(path, diff.value)
//                 return mapped.map(
//                     ([extraPath, value]) => [[...path, ...extraPath], { kind: diff.kind, value }]
//                 )
//             }
//             case 'replace': {
//                 const res: Item<Diff<O>>[] = []

//                 const oldMapped = this.mapper(path, diff.oldValue)
//                 const newMapped = this.mapper(path, diff.newValue)

//                 const oldByKey: Record<string, O> = {}
//                 const newByKey: Record<string, O> = {}

//                 for (const [oldExtraPath, value] of oldMapped) {
//                     oldByKey[oldExtraPath.toString()] = value
//                 }
//                 for (const [newExtraPath, value] of newMapped) {
//                     newByKey[newExtraPath.toString()] = value
//                 }

//                 for (const [oldExtraPath, oldValue] of oldMapped) {
//                     if (oldExtraPath.toString() in newByKey) {
//                         const newValue = newByKey[oldExtraPath.toString()]
//                         if (!deepEqual(oldValue, newValue)) {
//                             res.push([[...path, ...oldExtraPath],
//                             { kind: 'replace', oldValue, newValue }])
//                         }
//                     } else {
//                         res.push([[...path, ...oldExtraPath],
//                         { kind: 'delete', value: oldValue }])
//                     }
//                 }
//                 for (const [newExtraPath, newValue] of newMapped) {
//                     if (!(newExtraPath.toString() in oldByKey)) {
//                         res.push([[...path, ...newExtraPath],
//                         { kind: 'add', value: newValue }])
//                     }
//                 }
//                 return res
//             }
//         }
//     }
// }



// export async function reduceActionDiff1<V, AI, AO>(
//     reducer: ActionReducer<V, AI, AO>,
//     newSchema: string[],
//     actions: Item<AI>[],
//     c: SortedCollection<V>): Promise<Item<AO>[]> {
//     const actionsByBasePath: Record<string, Item<AI>[]> = {}
//     for (const action of actions) {
//         const key = JSON.stringify(action.slice(0, newSchema.length))
//         actionsByBasePath[key] = actionsByBasePath[key] || []
//         actionsByBasePath[key].push(action)
//     }

//     const res: Item<AO>[] = []
//     for (const clusterId in actionsByBasePath) {
//         const actions = actionsByBasePath[clusterId]
//         const basePath = actions[0][0].slice(0, newSchema.length)

//         const relativeActions = actions.map(
//             ([path, action]): Item<AI> => [path.slice(basePath.length), action]
//         )

//         const actionChange = await reducer(basePath, relativeActions, c.list(basePath))

//         if (actionChange !== null) {
//             res.push([basePath, actionChange])
//         }
//     }

//     return res
// }
