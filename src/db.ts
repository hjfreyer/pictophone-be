import { DocumentData, QueryDocumentSnapshot, DocumentReference, FieldPath, Firestore, Transaction, Timestamp } from '@google-cloud/firestore'
import { strict as assert } from "assert"
import { basename, dirname, join } from "path"
import { Key, Item, ItemIterable, Range, item } from './interfaces'
import * as ranges from './ranges';

import * as ixaop from 'ix/asynciterable/operators';
import * as ixa from "ix/asynciterable";
import * as ixop from 'ix/iterable/operators';
import * as ix from "ix/iterable";
import { AsyncIterableX } from 'ix/asynciterable';
import { Option, option } from './util';
import deepEqual from 'deep-equal';
import { OptionView } from './util/option';

export interface TxRunner {
    <R>(cb: (db: Database) => Promise<R>): Promise<R>
}

export interface TableSpec<T> {
    schema: string[]
    validator: (u: unknown) => T
}

export function runTransaction(fsDb: Firestore): TxRunner {
    return async <R>(cb: (db: Database) => Promise<R>): Promise<R> => {
        return await fsDb.runTransaction(async (tx) => {
            const db = new Database(fsDb, tx);
            const res = await cb(db);
            const diffs = db.commit();
            if (diffs.length !== 0) {
                console.log("Differences: ", JSON.stringify(diffs, undefined, 2))
            }
            return res
        });
    }
}

interface Mutation<T> {
    docRef: DocumentReference
    value: Option<T>
    writerId: string
}

export class Database {
    private opened: Record<string, FSTable<unknown>> = {};
    // private committers: (() => Iterable<Difference<unknown>>)[] = []

    constructor(private db: Firestore, private tx: Transaction) { }

    open<T>(id: string,
        spec: TableSpec<T>): Table<T> {
        console.log("OPEN", id)
        if (!(id in this.opened)) {
            this.opened[id] = new FSTable(
                this.db, this.tx, spec.schema, spec.validator);
        }
        return this.opened[id] as Table<T>
    }

    commit(): Difference<unknown>[] {
        return Array.from(ix.from(Object.values(this.opened)).pipe(
            ixop.flatMap(t => t.commit()),
            ixop.tap({ next: t => console.log("tapped", t) })
        ))
    }
}

export enum WriterRole {
    PRIMARY,
    SECONDARY
}

export interface Table<T> {
    schema: string[]
    read(range: Range): ItemIterable<T>
    openWriter(id: string, role: WriterRole): Writer<T>
}

export interface Writer<T> {
    set(key: Key, value: T): void
    delete(key: Key): void
}

export interface Difference<T> {
    aId: string,
    bId: string,
    aHad: Option<Option<T>>
    bHad: Option<Option<T>>
}

class FSTable<T> implements Table<T>{
    private primaryWriter: option.OptionView<string> = option.none();
    private allWriters: string[] = [];
    private mutations: Mutation<T>[] = [];

    constructor(
        private db: Firestore, private tx: Transaction,
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

    openWriter(writerId: string, writerRole: WriterRole): Writer<T> {
        if (writerRole === WriterRole.PRIMARY) {
            this.primaryWriter.split({
                onSome: () => { throw new Error("there can be only one primary writer") },
                onNone: () => {
                    this.primaryWriter = option.some(writerId)
                }
            })
        }
        this.allWriters.push(writerId)

        return {
            set: (key: Key, value: T): void => {
                this.validateKey(key)
                this.mutations.push({
                    docRef: this.getDocReference(key),
                    value: option.some(value),
                    writerId,
                })
            },

            delete: (key: Key): void => {
                this.validateKey(key)
                this.mutations.push({
                    docRef: this.getDocReference(key),
                    value: option.none(),
                    writerId,
                })
            }
        }
    }

    commit(): Iterable<Difference<T>> {
        return ix.from(this.mutations).pipe(
            ixop.groupBy(
                ({ docRef }) => docRef.path,
                x => x,
                (_key, mutations) => {
                    const primary = this.primaryWriter.andThen(primaryWriter =>
                        atMostOne(ix.from(mutations).pipe(
                            ixop.filter(({ writerId }) => writerId === this.primaryWriter.unwrap()))));


                    primary.map(mut => {
                        option.from(mut.value).split({
                            onNone: () => {
                                this.tx.delete(mut.docRef)
                            },
                            onSome: (val) => {
                                this.tx.set(mut.docRef, val)
                            }
                        })
                    })
                    console.log("ALL WRITERS", this.allWriters)

                    const maybeMutations = ix.from(this.allWriters).pipe(
                        ixop.groupJoin(mutations,
                            id => id,
                            ({ writerId }) => writerId,
                            (writerId: string, mutation: Iterable<Mutation<T>>) =>
                                ({ writerId, mutation: atMostOne(mutation) })
                        )
                    )

                    return this.computeDifference(_key, Array.from(maybeMutations))
                }),
            ixop.flatMap(x => x)
        )
    }

    private *computeDifference(
        path: string,
        maybeMutations: { writerId: string, mutation: option.OptionView<Mutation<T>> }[]):
        Iterable<Difference<T>> {
        if (maybeMutations.length < 2) {
            return
        }

        const { writerId: firstId, mutation: firstMutation } = maybeMutations[0];
        for (const { writerId: otherId, mutation: otherMutation } of maybeMutations.slice(1)) {
            const firstValue = firstMutation.map(({ value }) => value)
            const otherValue = otherMutation.map(({ value }) => value)

            if (!deepEqual(firstValue.data, otherValue.data)) {
                yield {
                    aId: firstId,
                    bId: otherId,
                    aHad: firstValue,
                    bHad: otherValue,
                }
            }

        }
    }

    private validateKey(key: Key): void {
        assert.equal(key.length, this.schema.length,
            `Invalid key ${JSON.stringify(key)} has length ${key.length}; want ${this.schema.length}`)
        if (key.some(segment => segment === "")) {
            throw new Error(`Key ${JSON.stringify(key)} has an empty segment, which is not allowed`)
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

function atMostOne<T>(i: Iterable<T>): option.OptionView<T> {
    let res: option.OptionView<T> = option.none();
    for (const t of i) {
        if (res.data.some) {
            throw new Error("got more than one")
        }
        res = option.some(t)
    }
    return res
}
