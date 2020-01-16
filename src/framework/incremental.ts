import { strict as assert } from "assert"
import { Observable, Subject, of } from 'rxjs'
import { map } from 'rxjs/operators'
import { DocumentReference, Firestore, Transaction } from '@google-cloud/firestore'
import { dirname, basename } from "path"
import { Maybe } from "../util"
import deepEqual = require("deep-equal")

export type Item = [string[], unknown]

export type Diff = {
    kind: 'add' | 'delete'
    path: string[]
    value: unknown
} | {
    kind: 'replace'
    path: string[]
    oldValue: unknown
    newValue: unknown
}

export type Indexer = (path: string[], value: unknown) => string[]

export type Mapper = (path: string[], value: unknown) => unknown

export type Collection = {
    schema: string[]

    get(path: string[]): Promise<Maybe<unknown>>
}

export type SortedCollection = Collection & {
    list(basePath: string[]): Promise<Item[]>
}


export function pathToDocumentReference(db: Firestore, schema: string[], path: string[]): DocumentReference {
    assert.equal(path.length, schema.length)
    const pathlets: string[][] = path.map((_, idx) => [schema[idx], path[idx]])
    return db.doc(([] as string[]).concat(...pathlets).join('/'))
}

export class DBCollection implements SortedCollection {
    constructor(private db: Firestore, private tx: Transaction, public schema: string[]) { }

    async get(path: string[]): Promise<Maybe<unknown>> {
        const docRef = pathToDocumentReference(this.db, this.schema, path)
        const doc = await this.tx.get(docRef)
        if (!doc.exists) {
            return { result: 'none' }
        }
        return { result: 'some', value: doc.data() }
    }

    async list(path: string[]): Promise<Item[]> {
        const docRef = pathToDocumentReference(
            this.db, this.schema.slice(0, this.schema.length - 1), path)
        const snapshot = await this.tx.get(docRef.collection(this.schema[this.schema.length - 1]))
        return snapshot.docs.map(doc => [this.fsPathToPath(doc.ref.path), doc.data()])
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


export function makeIndexingDiffer(indexer: Indexer) {
    return (inputs: Diff[]): Diff[] => {
        const diffLists = inputs.map((diff: Diff): Diff[] => {
            switch (diff.kind) {
                case 'add':
                case 'delete': {
                    return indexer(diff.path, diff.value).map((lastSegment): Diff => ({
                        kind: diff.kind,
                        path: [...diff.path, lastSegment],
                        value: diff.value,
                    }))
                }
                case 'replace': {
                    const oldIndexed = indexer(diff.path, diff.oldValue)
                    const newIndexed = indexer(diff.path, diff.newValue)

                    const res: Diff[] = []
                    for (const lastSegment of oldIndexed) {
                        if (newIndexed.indexOf(lastSegment) === -1) {
                            res.push({
                                kind: 'delete',
                                path: [...diff.path, lastSegment],
                                value: diff.oldValue,
                            })
                        } else {
                            res.push({
                                kind: 'replace',
                                path: [...diff.path, lastSegment],
                                oldValue: diff.oldValue,
                                newValue: diff.newValue,
                            })
                        }
                    }
                    for (const lastSegment of newIndexed) {
                        if (oldIndexed.indexOf(lastSegment) === -1) {
                            res.push({
                                kind: 'add',
                                path: [...diff.path, lastSegment],
                                value: diff.newValue,
                            })
                        }
                    }
                    return res
                }
            }
        })

        return ([] as Diff[]).concat(...diffLists)
    }
}

export function makeMappingDiffer(mapper: Mapper) {
    return (inputs: Diff[]): Diff[] => {
        const res: Diff[] = []

        for (const diff of inputs) {
            switch (diff.kind) {
                case 'add':
                case 'delete':
                    res.push({
                        kind: diff.kind,
                        path: diff.path,
                        value: mapper(diff.path, diff.value)
                    })
                    break
                case 'replace':
                    const oldMapped = mapper(diff.path, diff.oldValue)
                    const newMapped = mapper(diff.path, diff.newValue)
                    if (!deepEqual(oldMapped, newMapped)) {
                        res.push({
                            kind: 'replace',
                            path: diff.path,
                            oldValue: oldMapped,
                            newValue: newMapped
                        })
                    }
            }
        }
        return res
    }
}
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