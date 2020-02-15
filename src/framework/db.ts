import { CollectionReference, DocumentReference, Firestore, Transaction, DocumentData, FieldPath } from '@google-cloud/firestore'
import { strict as assert } from "assert"
import { basename, dirname, join } from "path"
import { Item, ReadableCollection } from "./incremental"
import { Diff } from './graph'


export class DBHelper {
    private schema: string[]
    constructor(private db: Firestore,
        private tx: Transaction,
        collectionId: string,
        schema: string[]) {
        this.schema = [
            ...schema.slice(0, schema.length - 1),
            `${schema[schema.length - 1]}-${collectionId}`
        ]
    }

    async get(key: string[]): Promise<DocumentData | null> {
        const doc = await this.tx.get(this.getDocReference(key))
        if (!doc.exists) {
            return null
        }
        return doc.data() || null
    }


    async* list(startAt: string[]): AsyncIterable<Item<DocumentData>> {
        let q = this.db.collectionGroup(this.schema[this.schema.length - 1])
            .orderBy(FieldPath.documentId())

        const path = this.getDocPath(startAt)
        if (path !== '') {
            q = q.startAt(path)
        }
        const subDocs = await this.tx.get(q)
        for (const doc of subDocs.docs) {
            yield [this.getKey(doc.ref), doc.data()]
        }
    }

    async *sortedEnumerate(): AsyncIterable<Item<DocumentData>> {
        const subDocs = await this.tx.get(this.db.collectionGroup(this.schema[this.schema.length - 1]))
        for (const doc of subDocs.docs) {
            yield [this.getKey(doc.ref), doc.data()]
        }
    }

    applyDiffs(diffs: Diff<DocumentData>[]): void {
        for (const diff of diffs) {
            const docRef = this.getDocReference(diff.key)
            switch (diff.kind) {
                case 'delete':
                    this.tx.delete(docRef)
                    break
                case 'add':
                    this.tx.set(docRef, diff.value)
                    break
                case 'replace':
                    this.tx.set(docRef, diff.newValue)
                    break
            }
        }
    }

    set(key: string[], value: DocumentData): void {
        this.tx.set(this.getDocReference(key), value)
    }

    private getDocReference(key: string[]): DocumentReference {
        assert.equal(key.length, this.schema.length)
        const pathlets: string[][] = key.map((_, idx) => [this.schema[idx], key[idx]])
        return this.db.doc(([] as string[]).concat(...pathlets).join('/'))
    }
    private getDocPath(key: string[]): string {
        assert.equal(key.length, this.schema.length)
        let path = ''
        for (let idx = 0; idx < key.length; idx++) {
            if (key[idx] === '') {
                return path
            }
            path = join(path, this.schema[idx], key[idx])
        }
        return path
    }

    private getKey(docRef: DocumentReference): string[] {
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
        assert.deepEqual(this.schema, extractedSchema)
        return res
    }
}


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

export class DBCollection<V> implements ReadableCollection<V> {
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

    enumerate(): AsyncIterable<Item<V>> {
        return this.sortedEnumerate()
    }

    async *sortedEnumerate(): AsyncIterable<Item<V>> {
        const subDocs = await this.tx.get(this.db.collectionGroup(this.schema[this.schema.length - 1]))
        for (const doc of subDocs.docs) {
            yield [documentReferenceToPath(this.schema, doc.ref), this.validator(doc.data())]
        }
    }

    async *query(basePath: string[]): AsyncGenerator<Item<V>, any, undefined> {
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
