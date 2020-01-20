import deepEqual from "deep-equal"
import _ from 'lodash'

export type Item<V> = [string[], V]

export type Diff<V> = {
    kind: 'add' | 'delete'
    value: V
} | {
    kind: 'replace'
    oldValue: V
    newValue: V
}

export type Collection<V> = {
    schema: string[]

    unsortedList(): AsyncIterable<Item<V>>
    get(path: string[]): Promise<V | null>
}

export type SortedCollection<V> = Collection<V> & {
    list(basePath: string[]): AsyncIterable<Item<V>>
}

export type DynamicCollection<V, AI, AO> = Collection<V> & {
    respondTo(actions: Item<AI>[]): Promise<Item<AO>[]>
}


export type SortedDynamicCollection<V, AI, AO> = SortedCollection<V> & DynamicCollection<V, AI, AO>

export type Mapper<I, O> = (path: string[], value: I) => Item<O>[]

export class MappedSortedCollection<I, O> implements SortedCollection<O> {
    constructor(public schema: string[],
        private mapper: Mapper<I, O>,
        private input: SortedCollection<I>) { }

    async get(path: string[]): Promise<O | null> {
        const basePath = path.slice(0, this.input.schema.length)
        const base = await this.input.get(basePath)

        if (base === null) {
            return null
        }

        const mapped = this.mapper(basePath, base)

        for (const [extraPath, value] of mapped) {
            if (deepEqual(path, [...basePath, ...extraPath])) {
                return value
            }
        }
        return null
    }

    async *unsortedList(): AsyncIterable<Item<O>> {
        for await (const [path, value] of this.input.unsortedList()) {
            const mapped = this.mapper(path, value)
            for (const [extraPath, mappedValue] of mapped) {
                yield [[...path, ...extraPath], mappedValue]
            }
        }
    }

    async *list(basePath: string[]): AsyncGenerator<Item<O>, any, unknown> {
        const baserPath = basePath.slice(0, this.input.schema.length)

        for await (const [middlePath, baseValue] of this.input.list(baserPath)) {
            const mapped = this.mapper([...baserPath, ...middlePath], baseValue)

            for (const [extraPath, mappedValue] of mapped) {
                const fullPath = [...baserPath, ...middlePath, ...extraPath]
                if (deepEqual(basePath, fullPath.slice(0, basePath.length))) {
                    yield [fullPath.slice(basePath.length), mappedValue]
                }
            }
        }
    }
}

export class MappedSortedDynamicCollection<I, O, A> implements SortedDynamicCollection<O, A, Diff<O>> {
    constructor(public schema: string[],
        private mapper: Mapper<I, O>,
        private input: SortedDynamicCollection<I, A, Diff<I>>) { }

    get(path: string[]): Promise<O | null> {
        return new MappedSortedCollection(this.schema, this.mapper, this.input)
            .get(path)
    }

    unsortedList(): AsyncIterable<Item<O>> {
        return new MappedSortedCollection(this.schema, this.mapper, this.input)
            .unsortedList()
    }

    list(basePath: string[]): AsyncIterable<Item<O>> {
        return new MappedSortedCollection(this.schema, this.mapper, this.input)
            .list(basePath)
    }

    async respondTo(actions: Item<A>[]): Promise<Item<Diff<O>>[]> {
        const diffs = await this.input.respondTo(actions)
        const unflattened = diffs.map(([path, diff]) => this.respondToDiff(path, diff))
        return _.flatten(unflattened)
    }

    private respondToDiff(path: string[], diff: Diff<I>): Item<Diff<O>>[] {
        switch (diff.kind) {
            case 'add':
            case 'delete': {
                const mapped = this.mapper(path, diff.value)
                return mapped.map(
                    ([extraPath, value]) => [[...path, ...extraPath], { kind: diff.kind, value }]
                )
            }
            case 'replace': {
                const res: Item<Diff<O>>[] = []

                const oldMapped = this.mapper(path, diff.oldValue)
                const newMapped = this.mapper(path, diff.newValue)

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
