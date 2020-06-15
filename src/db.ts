import { DocumentData, QueryDocumentSnapshot, DocumentReference, FieldPath, Firestore, Transaction, Timestamp } from '@google-cloud/firestore'
import { strict as assert } from "assert"
import { basename, dirname, join } from "path"
import { Key, Item, ItemIterable, Range, item } from './interfaces'
import * as ranges from './ranges';

import * as ixaop from 'ix/asynciterable/operators';
import * as ixa from "ix/asynciterable";
import { AsyncIterableX } from 'ix/asynciterable';

export interface TxRunner {
    <R>(cb: (db: Database) => Promise<R>): Promise<R>
}

export interface TableSpec<T> {
    schema: string[]
    validator: (u: unknown) => T
}

export function runTransaction(fsDb: Firestore): TxRunner {
    return <R>(cb: (db: Database) => Promise<R>): Promise<R> => {
        return fsDb.runTransaction(async (tx) => {
            const db = new Database(fsDb, tx);
            const res = await cb(db);
            db.commit();
            return res
        });
    }
}

export class Database {
    private committers: (() => void)[] = []

    constructor(private db: Firestore, private tx: Transaction) { }

    open<T>(spec: TableSpec<T>): Table<T> {
        const res = new FSTable(this.db, this.tx, spec.schema, spec.validator);
        this.committers.push(() => res.commit());
        return res;
    }

    commit(): void {
        for (const c of this.committers) {
            c();
        }
    }
}

export interface Table<T> {
    schema: string[]
    read(range: Range): ItemIterable<T>
    set(key: Key, value: T): void
    delete(key: Key): void
}

class FSTable<T> {
    private committers: (() => void)[] = []

    constructor(private db: Firestore, private tx: Transaction,
        public schema: string[], private validator: (u: unknown) => T) { }

    read(rng: Range): ItemIterable<T> {
        let q = this.db.collectionGroup(this.schema[this.schema.length - 1])
            .orderBy(FieldPath.documentId())

        const path = this.getDocPath(rng.start)
        if (path !== '') {
            q = q.startAt(path)
        }
        return ixa.from(this.tx.get(q)).pipe(
            ixaop.flatMap((snapshot): AsyncIterableX<QueryDocumentSnapshot> => ixa.from(snapshot.docs)),
            ixaop.map((doc: QueryDocumentSnapshot): Item<T> => item(this.getKey(doc.ref), this.validator(doc.data()))),
            ixaop.takeWhile(({key}: Item<T>): boolean => ranges.contains(rng, key))
        );
    }

    set(key: Key, value: T): void {
        this.validateKey(key)
        this.committers.push(() => { this.tx.set(this.getDocReference(key), value) })
    }

    delete(key: Key): void {
        this.validateKey(key)
        this.committers.push(() => { this.tx.delete(this.getDocReference(key)) })
    }

    private validateKey(key: Key): void {
        assert.equal(key.length, this.schema.length,
            `Invalid key ${JSON.stringify(key)} has length ${key.length}; want ${this.schema.length}`)
        if (key.some(segment => segment === "")) {
            throw new Error(`Key ${JSON.stringify(key)} has an empty segment, which is not allowed`)
        }
    }

    commit(): void {
        for (const c of this.committers) {
            c();
        }
    }

    private getDocReference(key: Key): DocumentReference {
        assert.equal(key.length, this.schema.length)
        const pathlets: string[][] = key.map((_, idx) => [this.schema[idx], key[idx]])
        return this.db.doc(([] as string[]).concat(...pathlets).join('/'))
    }

    private getDocPath(key: Key): string {
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

    private getKey(docRef: DocumentReference): Key {
        const res: Key = []
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
