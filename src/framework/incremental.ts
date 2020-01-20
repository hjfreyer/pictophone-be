import { strict as assert } from "assert"
import { Observable, Subject, of } from 'rxjs'
import { map } from 'rxjs/operators'
import { DocumentReference, Firestore, Transaction, CollectionReference } from '@google-cloud/firestore'
import { dirname, basename } from "path"
import deepEqual from "deep-equal"

export type Item<V> = [string[], V]
export type UnknownItem = Item<unknown>

export type PathedDiff<V> = {
    kind: 'add' | 'delete'
    path: string[]
    value: V
} | {
    kind: 'replace'
    path: string[]
    oldValue: V
    newValue: V
}
export type UnknownDiff = PathedDiff<unknown>

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

    get(path: string[]): Promise<V | null>
}

export type SortedCollection<V> = Collection<V> & {
    list(basePath: string[]): AsyncIterable<Item<V>>
}

export type ActionMapper<AI, AO> = (path: string[], action: AI) => Item<AO>[]

export type ActionReducer<V, AI, AO> = (
    basePath: string[],
    actions: Item<AI>[],
    subcollection: AsyncIterable<Item<V>>) => Promise<AO | null>


export type Indexer = (path: string[], value: unknown) => string[]

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

export function makeDiffMapper<I, O>(mapper: Mapper<I, O>): ActionMapper<Diff<I>, Diff<O>> {
    return (path: string[], diff: Diff<I>): Item<Diff<O>>[] => {
        switch (diff.kind) {
            case 'add':
            case 'delete': {
                const mapped = mapper(path, diff.value)
                return mapped.map(
                    ([extraPath, value]) => [extraPath, { kind: diff.kind, value }]
                )
            }
            case 'replace': {
                const res: Item<Diff<O>>[] = []

                const oldMapped = mapper(path, diff.oldValue)
                const newMapped = mapper(path, diff.newValue)

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
                            res.push([oldExtraPath, { kind: 'replace', oldValue, newValue }])
                        }
                    } else {
                        res.push([oldExtraPath, { kind: 'delete', value: oldValue }])
                    }
                }
                for (const [newExtraPath, newValue] of newMapped) {
                    if (!(newExtraPath.toString() in oldByKey)) {
                        res.push([newExtraPath, { kind: 'add', value: newValue }])
                    }
                }
                return res
            }
        }
    }
}

export async function reduceActionDiff1<V, AI, AO>(
    reducer: ActionReducer<V, AI, AO>,
    newSchema: string[],
    actions: Item<AI>[],
    c: SortedCollection<V>): Promise<Item<AO>[]> {
    const actionsByBasePath: Record<string, Item<AI>[]> = {}
    for (const action of actions) {
        const key = JSON.stringify(action.slice(0, newSchema.length))
        actionsByBasePath[key] = actionsByBasePath[key] || []
        actionsByBasePath[key].push(action)
    }

    const res: Item<AO>[] = []
    for (const clusterId in actionsByBasePath) {
        const actions = actionsByBasePath[clusterId]
        const basePath = actions[0][0].slice(0, newSchema.length)

        const relativeActions = actions.map(
            ([path, action]): Item<AI> => [path.slice(basePath.length), action]
        )

        const actionChange = await reducer(basePath, relativeActions, c.list(basePath))

        if (actionChange !== null) {
            res.push([basePath, actionChange])
        }
    }

    return res
}

//export type Actor<A, S> = (path: string[], state: S, action: A) => Item2<O>[]
// export type Mapper = (path: string[], value: unknown) => unknown



export function pathToDocumentReference(db: Firestore, schema: string[], path: string[]): DocumentReference {
    assert.equal(path.length, schema.length)
    const pathlets: string[][] = path.map((_, idx) => [schema[idx], path[idx]])
    return db.doc(([] as string[]).concat(...pathlets).join('/'))
}


export function pathToCollectionReference(db: Firestore, schema: string[], path: string[]): CollectionReference {
    assert.equal(path.length + 1, schema.length)
    if (path.length === 0) {
        return db.collection(schema[0])
    }
    const baseDoc = pathToDocumentReference(db, schema.slice(0, schema.length - 1), path)
    return baseDoc.collection(schema[schema.length - 1])
}


export function documentReferenceToPath(schema: string[], docRef: DocumentReference): string[] {
    const res: string[] = []
    const extractedSchema: string[] = []
    let docPath = docRef.path
    while (docPath !== '.') {
        res.push(basename(docPath))
        docPath = dirname(docPath)

        extractedSchema.push(basename(docPath))
        docPath = dirname(docPath)
    }
    res.reverse()
    extractedSchema.reverse()
    assert.deepEqual(schema, extractedSchema)
    return res
}

export class DBCollection<V> implements SortedCollection<V> {
    constructor(private db: Firestore, private tx: Transaction, public schema: string[],
        private validator: (v: unknown) => V) { }

    async get(path: string[]): Promise<V | null> {
        const docRef = pathToDocumentReference(this.db, this.schema, path)
        const doc = await this.tx.get(docRef)
        if (!doc.exists) {
            return null
        }
        return this.validator(doc.data())
    }

    async *list(basePath: string[]): AsyncGenerator<Item<V>, any, undefined> {
        if (basePath.length === this.schema.length) {
            const gotten = await this.get(basePath)
            if (gotten !== null) {
                yield [basePath, gotten]
            }
        } else if (basePath.length === this.schema.length - 1) {
            const docRef = pathToDocumentReference(
                this.db, this.schema.slice(0, basePath.length), basePath)
            const snapshot = await this.tx.get(docRef.collection(this.schema[this.schema.length - 1]))
            yield* snapshot.docs.map((doc): Item<V> => {
                const fullPath = this.fsPathToPath(doc.ref.path)
                return [fullPath.slice(basePath.length), this.validator(doc.data())]
            })
        } else {
            throw new Error('not supported')
        }
    }

    private fsPathToPath(docPath: string): string[] {
        const res: string[] = []
        const extractedSchema: string[] = []
        while (docPath !== '') {
            res.push(basename(docPath))
            docPath = dirname(docPath)

            extractedSchema.push(basename(docPath))
            docPath = dirname(docPath)
        }
        res.reverse()
        extractedSchema.reverse()
        assert.equal(this.schema, extractedSchema)
        return res
    }
}

// function expandDiffs()


// class CollectionManager {

// }

// export type DynamicCollection<B, O> = {
//     schema: string[]
//     respondTo(diffs: Diff<B>[]): Promise<Diff<O>[]>
// }

// function applyFirebaseChanges(private db: Firestore, private tx: Transaction)


// export function makeIndexingDiffer(indexer: Indexer) {
//     return (inputs: Diff[]): Diff[] => {
//         const diffLists = inputs.map((diff: Diff): Diff[] => {
//             switch (diff.kind) {
//                 case 'add':
//                 case 'delete': {
//                     return indexer(diff.path, diff.value).map((lastSegment): Diff => ({
//                         kind: diff.kind,
//                         path: [...diff.path, lastSegment],
//                         value: diff.value,
//                     }))
//                 }
//                 case 'replace': {
//                     const oldIndexed = indexer(diff.path, diff.oldValue)
//                     const newIndexed = indexer(diff.path, diff.newValue)

//                     const res: Diff[] = []
//                     for (const lastSegment of oldIndexed) {
//                         if (newIndexed.indexOf(lastSegment) === -1) {
//                             res.push({
//                                 kind: 'delete',
//                                 path: [...diff.path, lastSegment],
//                                 value: diff.oldValue,
//                             })
//                         } else {
//                             res.push({
//                                 kind: 'replace',
//                                 path: [...diff.path, lastSegment],
//                                 oldValue: diff.oldValue,
//                                 newValue: diff.newValue,
//                             })
//                         }
//                     }
//                     for (const lastSegment of newIndexed) {
//                         if (oldIndexed.indexOf(lastSegment) === -1) {
//                             res.push({
//                                 kind: 'add',
//                                 path: [...diff.path, lastSegment],
//                                 value: diff.newValue,
//                             })
//                         }
//                     }
//                     return res
//                 }
//             }
//         })

//         return ([] as Diff[]).concat(...diffLists)
//     }
// }

// export function makeMappingDiffer<I, O>(mapper: Mapper<I, O>) {
//     return (inputs: PathedDiff<I>[]): PathedDiff<O>[] => {
//         const res: PathedDiff<O>[] = []

//         for (const diff of inputs) {
//             res.push(...mapDiff(mapper, diff))
//         }
//         return res
//     }
// }

// function mapDiff<I, O>(mapper: Mapper<I, O>, diff: PathedDiff<I>): PathedDiff<O>[] {
//     switch (diff.kind) {
//         case 'add':
//         case 'delete': {
//             const res: PathedDiff<O>[] = []
//             const mapped = mapper(diff.path, diff.value)
//             for (const [extraPath, value] of mapped) {
//                 res.push({
//                     kind: diff.kind,
//                     path: [...diff.path, ...extraPath],
//                     value
//                 })
//             }

//             return res
//         }
//         case 'replace': {
//             const res: PathedDiff<O>[] = []

//             const oldMapped = mapper(diff.path, diff.oldValue)
//             const newMapped = mapper(diff.path, diff.newValue)

//             const oldByKey: Record<string, O> = {}
//             const newByKey: Record<string, O> = {}

//             for (const [oldExtraPath, value] of oldMapped) {
//                 oldByKey[oldExtraPath.toString()] = value
//             }
//             for (const [newExtraPath, value] of newMapped) {
//                 newByKey[newExtraPath.toString()] = value
//             }

//             for (const [oldExtraPath, oldValue] of oldMapped) {
//                 if (oldExtraPath.toString() in newByKey) {
//                     const newValue = newByKey[oldExtraPath.toString()]
//                     if (!deepEqual(oldValue, newValue)) {
//                         res.push({
//                             kind: 'replace',
//                             path: [...diff.path, ...oldExtraPath],
//                             oldValue,
//                             newValue
//                         })
//                     }
//                 } else {
//                     res.push({
//                         kind: 'delete',
//                         path: [...diff.path, ...oldExtraPath],
//                         value: oldValue,
//                     })
//                 }
//             }
//             for (const [newExtraPath, newValue] of newMapped) {
//                 if (!(newExtraPath.toString() in oldByKey)) {
//                     res.push({
//                         kind: 'add',
//                         path: [...diff.path, ...newExtraPath],
//                         value: newValue,
//                     })
//                 }
//             }
//             return res
//         }
//     }
// }

export function makeMappingDiffer<AI, AO>(mapper: ActionMapper<AI, AO>) {
    return makeActionMappingDiffer(makeDiffMapper(mapper))
}

export function makeActionMappingDiffer<AI, AO>(mapper: ActionMapper<AI, AO>) {
    return (actions: Item<AI>[]): Item<AO>[] => {
        const res: Item<AO>[] = []

        for (const [path, action] of actions) {
            const mapped = mapper(path, action)

            res.push(...mapped.map(
                ([subpath, subaction]): Item<AO> => [[...path, ...subpath], subaction]
            ))
        }
        return res
    }
}


// export function makeMappingDiffer(mapper: Mapper) {
//     return (inputs: Diff[]): Diff[] => {
//         const res: Diff[] = []

//         for (const diff of inputs) {
//             switch (diff.kind) {
//                 case 'add':
//                 case 'delete':
//                     res.push({
//                         kind: diff.kind,
//                         path: diff.path,
//                         value: mapper(diff.path, diff.value)
//                     })
//                     break
//                 case 'replace':
//                     const oldMapped = mapper(diff.path, diff.oldValue)
//                     const newMapped = mapper(diff.path, diff.newValue)
//                     if (!deepEqual(oldMapped, newMapped)) {
//                         res.push({
//                             kind: 'replace',
//                             path: diff.path,
//                             oldValue: oldMapped,
//                             newValue: newMapped
//                         })
//                     }
//             }
//         }
//         return res
//     }
// }

// class IndexingDynamicCollection<B, I, O> implements DynamicCollection<B, O> {
//     constructor(
//         private input: DynamicCollection<B, I>,
//         private collectionId: string,
//         private indexer: Indexer<I, O>) { }

//     get schema(): string[] {
//         return [...this.input.schema, this.collectionId]
//     }

//     async respondTo(baseDiffs: Diff<B>[]): Promise<Diff<O>[]> {
//         const iDiffs = await this.input.respondTo(baseDiffs)
//     }
// }


// // export function pipe<A, B>(in: Collection<A>, op1: )

// export class InMemoryCollection<V> implements Collection<V> {
//     constructor(public schema: string[], private data: Item<V>[], private diffs: Diff<V>[]) { }

//     async *enumerate(): AsyncGenerator<Item<V>> {
//         for (const item of this.data) {
//             yield item
//         }
//     }

//     async get(path: string[]): Promise<V> {
//         for (const [foundPath, value] of this.data) {
//             if (lexCompare(path, foundPath) === 0) {
//                 return value
//             }
//         }
//         throw new Error('not found')
//     }

//     async *list(basePath: string[]): AsyncGenerator<Item<V>> {
//         for (const [foundPath, value] of this.data) {
//             if (lexCompare(basePath, foundPath.slice(0, foundPath.length - 1)) === 0) {
//                 yield [foundPath, value]
//             }
//         }
//     }

//     get changes(): Observable<Diff<V>[]> {
//         return of(this.diffs)
//     }
// }



//export type Indexer = (path: string[], value: unknown) => Record<string, unknown>

// class IndexingCollection<I, O> implements Collection<O> {
//     constructor(
//         private input: Collection<I>,
//         private collectionId: string,
//         private indexer: Indexer<I, O>) { }

//     get schema(): string[] {
//         return [...this.input.schema, this.collectionId]
//     }

//     async *enumerate(): AsyncGenerator<Item<O>> {
//         for await (const [path, value] of this.input.enumerate()) {
//             const indexed = this.indexer([path, value])
//             for (const newKey in indexed) {
//                 const res: Item<O> = [[...path, newKey], indexed[newKey]]
//                 yield res
//             }
//         }
//     }

//     async get(path: string[]): Promise<O> {
//         const basePath = path.slice(0, path.length - 1)
//         const base = await this.input.get(basePath)
//         const indexed = this.indexer([basePath, base])

//         if (!(path[path.length - 1] in indexed)) {
//             throw new Error('not found')
//         }
//         return indexed[path[path.length - 1]]
//     }

//     async *list(basePath: string[]): AsyncGenerator<Item<O>> {
//         const base = await this.input.get(basePath)
//         const indexed = this.indexer([basePath, base])
//         for (const newKey in indexed) {
//             const res: Item<O> = [[...basePath, newKey], indexed[newKey]]
//             yield res
//         }
//     }

//     get changes(): Observable<Diff<O>[]> {
//         const translateDiff = (diff: Diff<I>): Diff<O>[] => {
//             switch (diff.kind) {
//                 case 'add':
//                 case 'delete': {
//                     const indexed = this.indexer([diff.path, diff.value])
//                     return Object.entries(indexed).map(([lastSegment, value]): Diff<O> => ({
//                         kind: diff.kind,
//                         path: [...diff.path, lastSegment],
//                         value,
//                     }))
//                 }
//                 case 'replace': {
//                     const oldIndexed = this.indexer([diff.path, diff.oldValue])
//                     const newIndexed = this.indexer([diff.path, diff.newValue])

//                     const res: Diff<O>[] = []
//                     for (const lastSegment in oldIndexed) {
//                         if (lastSegment in newIndexed) {
//                             res.push({
//                                 kind: 'replace',
//                                 path: [...diff.path, lastSegment],
//                                 oldValue: oldIndexed[lastSegment],
//                                 newValue: newIndexed[lastSegment],
//                             })
//                         } else {
//                             res.push({
//                                 kind: 'delete',
//                                 path: [...diff.path, lastSegment],
//                                 value: oldIndexed[lastSegment],
//                             })
//                         }
//                     }
//                     for (const lastSegment in newIndexed) {
//                         if (!(lastSegment in oldIndexed)) {
//                             res.push({
//                                 kind: 'add',
//                                 path: [...diff.path, lastSegment],
//                                 value: newIndexed[lastSegment],
//                             })
//                         }
//                     }
//                     return res
//                 }
//             }
//         }

//         return this.input.changes.pipe(
//             map((diffs: Diff<I>[]): Diff<O>[] =>
//                 ([] as Diff<O>[]).concat(...diffs.map(translateDiff)))
//         )
//     }

// }

// export function index<I, O>(collectionId: string, indexer: Indexer<I, O>): CollectionFunction<I, O> {
//     return (c: Collection<I>): Collection<O> => new IndexingCollection(c, collectionId, indexer)
// }

// // New name and position for a given schema path segment.
// export type PathMove = {
//     newName: string
//     newPosition: number
// }

// export function transpose<V>(schemaMap: PathMove[]): CollectionFunction<V, V> {
//     return (c: Collection<V>): Collection<V> => {
//         const newSchemaDraft = c.schema.map((): string | null => null)
//         for (const move of schemaMap) {
//             newSchemaDraft[move.newPosition] = move.newName
//         }
//         const newSchema = newSchemaDraft.map(s => s!)

//         const newData: Item<V>[] = []

//         for (const [path, value] of c.enumerate()) {
//             const newPath = path.map((): string | null => null)
//             for (let oldPathIdx = 0; oldPathIdx < path.length; oldPathIdx++) {
//                 newPath[schemaMap[oldPathIdx].newPosition] = path[oldPathIdx]
//             }
//             newData.push([newPath.map(s => s!), value])
//         }
//         return new InMemoryCollection(newSchema, newData)
//     }
// }

// export type Reducer1<I, O> = (basePath: string[], values: Record<string, I>) => O
// export type Reducer2<I1, I2, O> = (basePath: string[],
//     values1: Record<string, I1>,
//     values2: Record<string, I2>) => O

// function lexCompare(a: string[], b: string[]): number {
//     assert.equal(a.length, b.length)
//     for (let i = 0; i < a.length; i++) {
//         const c = a[i].localeCompare(b[i])
//         if (c !== 0) { return c }
//     }
//     return 0
// }

// export function reduce1<I, O>(reducer: Reducer1<I, O>, c: Collection<I>): Collection<O> {
//     const dataIn = [...c.enumerate()]
//     dataIn.sort(([k1, _1], [k2, _2]) => lexCompare(k1, k2))

//     const newData: Item<O>[] = []
//     for (let cursor = 0; cursor < dataIn.length;) {
//         const [path, value] = dataIn[cursor]
//         const clusterPath = path.slice(0, path.length - 1)
//         const cluster: Record<string, I> = {}

//         for (; cursor < dataIn.length; cursor++) {
//             const [path, value] = dataIn[cursor]
//             const basePath = path.slice(0, path.length - 1)
//             if (lexCompare(basePath, clusterPath) !== 0) {
//                 break
//             }
//             cluster[path[path.length - 1]] = value
//         }
//         newData.push([clusterPath, reducer(clusterPath, cluster)])
//     }

//     return new InMemoryCollection(c.schema.slice(0, c.schema.length - 1), newData)
// }


// export function reduce2<I1, I2, O>(reducer: Reducer2<I1, I2, O>,
//     c1: Collection<I1>, c2: Collection<I2>): Collection<O> {

// }