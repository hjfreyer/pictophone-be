import { DocumentData, DocumentReference, FieldPath, Firestore, Transaction, Timestamp } from '@google-cloud/firestore'
import { strict as assert } from "assert"
import { basename, dirname, join } from "path"
import { Diff, Item, Change } from './base'

import * as ixaop from 'ix/asynciterable/operators';
import { InputInfo } from './graph';
import { ItemIterable, Readable, Key, Mutation, diffToChange } from '../flow/base';
import { Range } from '../flow/range';
import * as ixa from "ix/asynciterable";
import * as read from '../flow/read'
import { NumberValue, SavedAction, AnyAction } from '../model';
import { getActionId } from '../collections'


interface Timestamped {
    ts: Timestamp
    value: unknown
}

export interface HasId {
    actionId: string
}

export type TimestampedItem<V> = [string[], V, Timestamp]

// export interface MutationFunction<T> {
//     key: Key
//     fn(t : T): T
// }

type Committer = (actionId: string) => void

export class Database {
    private accessedActionIds = new Set<string>();
    private frozenParents: string[] = [];
    private committers: Committer[] = [];

    constructor(private db: Firestore, private tx: Transaction, private allowedActionIds: Set<string>) { }

    open<T>(info: InputInfo<T & HasId>): Dataspace2<T> {
        const self = this;
        const diffs: Diff<T>[] = [];
        this.committers.push((actionId: string) => {
            const changes: Change<T & HasId>[] = diffs
                .map(diffToChange)
                .map((change): Change<T & HasId> => {
                    switch (change.kind) {
                        case 'set':
                            return {
                                ...change,
                                value: {
                                    ...change.value,
                                    actionId,
                                }
                            }
                        case 'delete':
                            return change
                    }
                })
            new DBHelper(self.db, self.tx, info.collectionId, info.schema).commit(changes)
        })
        return {
            schema: info.schema,

            seekTo(startAt: Key): ItemIterable<T> {
                return ixa.from(new DBHelper(self.db, self.tx, info.collectionId, info.schema).list(startAt))
                    .pipe(
                        ixaop.map(([k, v]) => {
                            const validated = info.validator(v);
                            if (0 < self.allowedActionIds.size && !self.allowedActionIds.has(validated.actionId)) {
                                throw new Error(`record ${k} with actionId "${validated.actionId}" doesn't match
                                allowed list: ${Array.from(self.allowedActionIds)}`)
                            }
                            self.accessedActionIds.add(validated.actionId)
                            return [k, validated]
                        })
                    )
            },

            enqueue(diff: Diff<T>): void {
                diffs.push(diff);
            }
        };
    }
    freezeParents(): void {
        this.frozenParents = Array.from(this.accessedActionIds)
        this.frozenParents.sort();
        this.accessedActionIds.clear();
    }

    commit(action: AnyAction): void {
        const savedAction: SavedAction = {
            parents: this.frozenParents,
            action,
        }
        const actionId = getActionId(savedAction);
        this.tx.set(this.db.collection('actions').doc(actionId), savedAction);
        for (const cb of this.committers) {
            cb(actionId);
        }
    }
}

export class DBHelper2 {
    constructor(private db: Firestore,
        private tx: Transaction) { }

    open<T>(info: InputInfo<T>): Dataspace<T> {
        return new Dataspace(this.db, this.tx, info);
    }
}

export interface Dataspace2<T> extends Readable<T> {
    schema: string[]
    seekTo(startAt: Key): ItemIterable<T>
    enqueue(mutation: Diff<T>): void
}


export class Dataspace<T> implements Readable<T> {
    private mutations: Mutation<T>[] = [];
    private changes: Change<T>[] = [];
    constructor(private db: Firestore,
        private tx: Transaction,
        private info: InputInfo<T>) { }

    get schema(): string[] {
        return this.info.schema
    }

    seekTo(startAt: Key): ItemIterable<T> {
        return ixa.from(new DBHelper(this.db, this.tx, this.info.collectionId, this.info.schema).list(startAt))
            .pipe(ixaop.map(([k, v]) => [k, this.info.validator(v)]));
    }

    commit(changes: Change<T>[]): void {
        new DBHelper(this.db, this.tx, this.info.collectionId, this.info.schema).commit(changes)
    }

    enqueueMutation(mutation: Mutation<T>): void {
        this.mutations.push(mutation);
    }
    async prepCommit(actionId: string): Promise<void> {
        this.changes = await Promise.all(this.mutations.map(async (mutation): Promise<Change<T>> => {
            switch (mutation.kind) {
                case 'increment': {
                    const gotten = (await read.get(this, mutation.key)) as any as (NumberValue | null)
                    const numericVal = gotten !== null ? gotten.value : 0;
                    const numberChange: Change<NumberValue> = {
                        key: mutation.key,
                        kind: 'set',
                        value: {
                            actionId,
                            value: numericVal + mutation.increment_amount,
                        }
                    }
                    return numberChange as any as Change<T>
                }
                case 'add':
                    return {
                        ...mutation,
                        kind: 'set',
                    }
                case 'replace':
                    return {
                        key: mutation.key
                        , kind: 'set',
                        value: mutation.newValue
                    }
                case 'delete':
                    return mutation
            }
        }));
    }

    commitMutations(): void {
        console.log("MUTS", this.changes)

        return new DBHelper(this.db, this.tx, this.info.collectionId, this.info.schema).commit(this.changes)
    }
}

class DBHelper {
    public schema: string[]
    constructor(private db: Firestore,
        private tx: Transaction,
        collectionId: string,
        schema: string[]) {
        this.schema = [
            ...schema.slice(0, schema.length - 1),
            `${schema[schema.length - 1]}-${collectionId}`
        ]
    }

    async* list(startAt: Key): AsyncIterable<Item<DocumentData>> {
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

    commit(changes: Change<DocumentData>[]): void {
        for (const change of changes) {
            const docRef = this.getDocReference(change.key)
            switch (change.kind) {
                case 'delete':
                    this.tx.delete(docRef)
                    break
                case 'set':
                    this.tx.set(docRef, change.value)
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
