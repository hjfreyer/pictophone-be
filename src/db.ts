import { DocumentData, QueryDocumentSnapshot, DocumentReference, FieldPath, Firestore, Transaction, Timestamp } from '@google-cloud/firestore'
import { strict as assert } from "assert"
import { basename, dirname, join } from "path"
import { Key, Item, ItemIterable, Range, item } from './interfaces'
import * as ranges from './ranges';
import admin from 'firebase-admin'
import * as ixaop from 'ix/asynciterable/operators';
import * as ixa from "ix/asynciterable";
import * as ixop from 'ix/iterable/operators';
import * as ix from "ix/iterable";
import { AsyncIterableX } from 'ix/asynciterable';
import { Option, option } from './util';
import { SavedAction, AnyAction } from './model';
import { validate as validateSchema } from './model/index.validator'
import { validate as validateBase } from './model/base.validator'
import { FacetDiff } from './framework';
import { DocVersionSpec, VersionSpec } from './model/base';
import deepEqual from 'deep-equal';
import { getActionId } from './base';
import * as util from './util';

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

export interface Commit {
    previousDocVersions: Record<string, DocVersionSpec>
    previousCollectionMembers: Record<string, string[]>
    action: AnyAction
    diffs: Record<string, FacetDiff>
}

export class Database2 {
    constructor(private db: Firestore) { }

    async getAction(actionId: string): Promise<Option<SavedAction>> {
        const doc = await this.db.doc(actionId).get()
        return doc.exists
            ? option.some(validateSchema('SavedAction')(doc.data()))
            : option.none();
    }

    async getFacetVersion(facetId: string): Promise<DocVersionSpec> {
        const doc = await this.db.doc(facetId).get()
        return doc.exists
            ? {
                exists: true, actionId:
                    validateBase('Pointer')(doc.data()).actionId
            }
            : { exists: false };
    }

    async getCollectionMembers(collectionId: string): Promise<string[]> {
        const doc = await this.db.doc(collectionId).get()
        if (!doc.exists) {
            return []
        }
        const collection = validateBase('Kollection')(doc.data())
        return collection.members
    }

    commitAction(commit: Commit): Promise<boolean> {
        for (const members of Object.values(commit.previousCollectionMembers)) {
            for (const member of members) {
                if (!(member in commit.previousDocVersions)) {
                    throw new Error("illegal commit")
                }
            }
        }

        return this.db.runTransaction(async (tx): Promise<boolean> => {
            const facetVersionsGood = ixa.from(Object.entries(commit.previousDocVersions)).pipe(
                ixaop.map(async ([facetId, expectedDocVersion]) => {
                    const doc = await this.db.doc(facetId).get()
                    if (doc.exists) {
                        const ptr = validateBase('Pointer')(doc.data());
                        return expectedDocVersion.exists
                            && ptr.actionId === expectedDocVersion.actionId
                    } else {
                        return !expectedDocVersion.exists
                    }
                })
            )
            const collectionsGood = ixa.from(Object.entries(commit.previousCollectionMembers)).pipe(
                ixaop.map(async ([collectionId, expectedMembers]) => {
                    const doc = await tx.get(this.db.doc(collectionId))
                    if (!doc.exists) {
                        return expectedMembers.length === 0
                    }
                    const actualMembers = validateBase('Kollection')(doc.data()).members
                    return deepEqual(actualMembers, expectedMembers)
                })
            )

            if (!await ixa.every(ixa.concat(facetVersionsGood, collectionsGood), b => b)) {
                return false
            }
            const parents: VersionSpec = {
                docs: commit.previousDocVersions,
                collections: util.sorted(Object.keys(commit.previousCollectionMembers)),
            };
            const savedAction: SavedAction = { ...commit.action, parents }
            const actionId = getActionId(savedAction);

            tx.set(this.db.doc(actionId), savedAction)
            for (const [facetId, facetDiff] of Object.entries(commit.diffs)) {
                tx.set(this.db.doc(facetId), { actionId })
                for (const left of facetDiff.leftCollections) {
                    tx.set(this.db.doc(left), {
                        members: admin.firestore.FieldValue.arrayRemove(facetId)
                    }, { merge: true })
                }
                for (const joined of facetDiff.joinedCollections) {
                    tx.set(this.db.doc(joined), {
                        members: admin.firestore.FieldValue.arrayUnion(facetId)
                    }, { merge: true })
                }
            }
            return true
        })
    }
}

export class Database {
    private committers: (() => void)[] = []

    constructor(public db: Firestore, public tx: Transaction) { }

    async getRaw(path: string): Promise<Option<DocumentData>> {
        const doc = await this.tx.get(this.db.doc(path))

        if (doc.exists) {
            return option.some(doc.data()!)
        } else {
            return option.none()
        }
    }

    setRaw(path: string, value: DocumentData) {
        this.committers.push(() => this.tx.set(this.db.doc(path), value))
    }

    deleteRaw(path: string) {
        this.committers.push(() => this.tx.delete(this.db.doc(path)))
    }

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
            ixaop.takeWhile(({ key }: Item<T>): boolean => ranges.contains(rng, key))
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


export function parseDocPath(docPath: string): { schema: Key, key: Key } {
    const key: Key = []
    const schema: string[] = []
    while (docPath !== '.') {
        key.push(basename(docPath))
        docPath = dirname(docPath)

        schema.push(basename(docPath))
        docPath = dirname(docPath)
    }
    key.reverse()
    schema.reverse()
    return { schema, key }
}


export interface CollectionPath {
    schema: Key
    key: Key
    collectionId: string
}
export interface DocumentPath {
    schema: Key
    key: Key
}

export type ParsedPath = {
    kind: 'collection',
    schema: Key
    key: Key
    collectionId: string
} | {
    kind: 'doc'
    schema: Key
    key: Key
}

export function parsePath(path: string): ParsedPath {
    const segments: Key = []
    while (path !== '.') {
        segments.push(basename(path))
        path = dirname(path)
    }
    segments.reverse()
    if (segments.length % 2 === 0) {
        return {
            kind: 'doc',
            schema: segments.filter((_, idx) => idx % 2 === 0),
            key: segments.filter((_, idx) => idx % 2 === 1),
        }
    } else {
        return {
            kind: 'collection',
            schema: segments.slice(0, segments.length - 1).filter((_, idx) => idx % 2 === 0),
            key: segments.filter((_, idx) => idx % 2 === 1),
            collectionId: segments[segments.length - 1],
        }
    }
}


export function serializeDocPath(schema: Key, key: Key): string {
    assert.equal(schema.length, key.length);
    const interlaced = ix.zip(schema, key).pipe(
        ixop.flatMap(segs => segs)
    )
    return join(...interlaced)
}


export function serializeCollectionPath({ schema, key, collectionId }: CollectionPath): string {
    assert.equal(schema.length, key.length);
    const interlaced = ix.zip(schema, key).pipe(
        ixop.flatMap(segs => segs)
    )
    return join(...interlaced, collectionId)
}
