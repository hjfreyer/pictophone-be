import { strict as assert } from "assert"


export type CollectionFunction<V1, V2> = (source: Collection<V1>) => Collection<V2>

export type Item<V> = [string[], V]

export type Collection<V> = {
    schema: string[]
    enumerate(): Item<V>[]
}

// export function pipe<A, B>(in: Collection<A>, op1: )

export class InMemoryCollection<V> implements Collection<V> {
    constructor(public schema: string[], private data: Item<V>[]) { }

    enumerate(): Item<V>[] {
        return this.data
    }
}


export type Indexer<V1, V2> = (i: Item<V1>) => Record<string, V2>

export function index<V1, V2>(collectionId: string,
    indexer: Indexer<V1, V2>): CollectionFunction<V1, V2> {
    return (c: Collection<V1>): Collection<V2> => {
        const newSchema = [...c.schema, collectionId]
        const newData: Item<V2>[] = []

        for (const [path, value] of c.enumerate()) {
            const indexed = indexer([path, value])
            for (const newKey in indexed) {
                newData.push([
                    [...path, newKey], indexed[newKey]
                ])
            }
        }

        return new InMemoryCollection(newSchema, newData)
    }
}

// New name and position for a given schema path segment.
export type PathMove = {
    newName: string
    newPosition: number
}

export function transpose<V>(schemaMap: PathMove[]): CollectionFunction<V, V> {
    return (c: Collection<V>): Collection<V> => {
        const newSchemaDraft = c.schema.map((): string | null => null)
        for (const move of schemaMap) {
            newSchemaDraft[move.newPosition] = move.newName
        }
        const newSchema = newSchemaDraft.map(s => s!)

        const newData: Item<V>[] = []

        for (const [path, value] of c.enumerate()) {
            const newPath = path.map((): string | null => null)
            for (let oldPathIdx = 0; oldPathIdx < path.length; oldPathIdx++) {
                newPath[schemaMap[oldPathIdx].newPosition] = path[oldPathIdx]
            }
            newData.push([newPath.map(s => s!), value])
        }
        return new InMemoryCollection(newSchema, newData)
    }
}

export type Reducer1<I, O> = (basePath: string[], values: Record<string, I>) => O
export type Reducer2<I1, I2, O> = (basePath: string[],
    values1: Record<string, I1>,
    values2: Record<string, I2>) => O

function lexCompare(a: string[], b: string[]): number {
    assert.equal(a.length, b.length)
    for (let i = 0; i < a.length; i++) {
        const c = a[i].localeCompare(b[i])
        if (c !== 0) { return c }
    }
    return 0
}

export function reduce1<I, O>(reducer: Reducer1<I, O>, c: Collection<I>): Collection<O> {
    const dataIn = [...c.enumerate()]
    dataIn.sort(([k1, _1], [k2, _2]) => lexCompare(k1, k2))

    const newData: Item<O>[] = []
    for (let cursor = 0; cursor < dataIn.length;) {
        const [path, value] = dataIn[cursor]
        const clusterPath = path.slice(0, path.length - 1)
        const cluster: Record<string, I> = {}

        for (; cursor < dataIn.length; cursor++) {
            const [path, value] = dataIn[cursor]
            const basePath = path.slice(0, path.length - 1)
            if (lexCompare(basePath, clusterPath) !== 0) {
                break
            }
            cluster[path[path.length - 1]] = value
        }
        newData.push([clusterPath, reducer(clusterPath, cluster)])
    }

    return new InMemoryCollection(c.schema.slice(0, c.schema.length - 1), newData)
}


// export function reduce2<I1, I2, O>(reducer: Reducer2<I1, I2, O>,
//     c1: Collection<I1>, c2: Collection<I2>): Collection<O> {

// }