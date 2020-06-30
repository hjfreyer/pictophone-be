import * as db from './db'
import {
    AnyAction, SavedAction,
} from './model'
import { Option, option } from './util'
import { OptionData } from './util/option'
import { Key, Item, ItemIterable, Diff, item } from './interfaces'
import { validate as validateBase } from './model/base.validator'
import { validate as validateSchema } from './model/index.validator'
import { VersionSpecRequest, VersionSpec, DocVersionSpec } from './model/base'
import { findItemAsync, findItem } from './base'

import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"

import * as ix from "ix/iterable"
import * as ixop from "ix/iterable/operators"
import * as util from './util'
import { OperatorAsyncFunction, OperatorFunction } from 'ix/interfaces'
import * as diffs from './diffs'
import deepEqual from 'deep-equal'

export interface FacetDiff {
    joinedCollections: string[]
    leftCollections: string[]
}

export interface IntegrationResult<TResult> {
    result: TResult
    facetDiffs: Record<string, FacetDiff>
}

export interface Integrator<TResult> {
    getNeededReferenceIds(db: db.Database, action: AnyAction): Promise<{ docs: string[], collections: string[] }>
    integrate(db: db.Database, savedAction: SavedAction): Promise<IntegrationResult<TResult>>
}

export async function getAction(db: db.Database, actionId: string): Promise<Option<SavedAction>> {
    const data = await db.getRaw(actionId);
    return option.from(data).map(validateSchema('SavedAction'))
}

export async function resolveVersionSpec(db: db.Database, { docs, collections }: VersionSpecRequest): Promise<VersionSpec> {
    const allDocs = [...docs]
    for (const collectionId of collections) {
        const members = option.from(await db.getRaw(collectionId))
            .map(validateBase('Kollection'))
            .map(col => col.members)
            .orElse(() => [])
        for (const doc of members) {
            if (allDocs.indexOf(doc) === -1) {
                allDocs.push(doc)
            }
        }
    }
    const res: VersionSpec = { docs: {}, collections: collections }
    for (const docId of allDocs) {
        res.docs[docId] = option.from(await db.getRaw(docId))
            .map(validateBase('Pointer'))
            .map<DocVersionSpec>(p => ({ exists: true, actionId: p.actionId }))
            .orElse(() => ({ exists: false }))
    }
    return res;
}

export interface Mapper<I, O> {
    // Must be injective: input items with different keys must never produce 
    // output items with the same key.
    map(key: Key, value: I): Iterable<Item<O>>

    // Return the input key which could possibly produce outputKey. 
    preimage(outputKey: Key): Key
}

function singleMap<I, O>(mapper: Mapper<I, O>, diff: Diff<I>): Iterable<Diff<O>> {
    const [oldMapped, newMapped] = (() => {
        switch (diff.kind) {
            case 'add':
                return [[], mapper.map(diff.key, diff.value)]
            case 'delete':
                return [mapper.map(diff.key, diff.value), []]
            case 'replace':
                return [mapper.map(diff.key, diff.oldValue), mapper.map(diff.key, diff.newValue)]
        }
    })()
    type AgedItem = { age: 'old' | 'new', key: Key, value: O };
    const tagger = (age: 'old' | 'new') => ({ key, value }: Item<O>): AgedItem => ({ age, key, value });

    const aged: ix.IterableX<AgedItem> = ix.concat(
        ix.from(oldMapped).pipe(ixop.map(tagger('old'))),
        ix.from(newMapped).pipe(ixop.map(tagger('new'))));
    return aged.pipe(
        ixop.groupBy(({ key }) => JSON.stringify(key), x => x, (_, valueIter): Iterable<Diff<O>> => {
            const values = Array.from(valueIter);
            if (values.length === 0) {
                throw new Error("wtf")
            }
            if (2 < values.length) {
                throw new Error("mapper must have returned the same key multiple times")
            }
            if (values.length === 1) {
                const [{ age, key, value }] = values;
                return [{
                    kind: age === 'old' ? 'delete' : 'add',
                    key,
                    value,
                }]
            }
            // Else, values has 2 elements.
            if (values[0].age === values[1].age) {
                throw new Error("mapper must have returned the same key multiple times")
            }

            if (deepEqual(values[0].value, values[1].value)) {
                return []
            }

            return [{
                kind: 'replace',
                key: values[0].key,
                oldValue: values[0].age === 'old' ? values[0].value : values[1].value,
                newValue: values[0].age === 'new' ? values[0].value : values[1].value,
            }]
        }),
        ixop.flatMap(diffs => diffs),
    )
}

export function mapDiffs<I, O>(mapper: Mapper<I, O>): OperatorFunction<Diff<I>, Diff<O>> {
    return ixop.flatMap(d => ix.from(singleMap(mapper, d)))
}

export function mapItems<I, O>(mapper: Mapper<I, O>): OperatorFunction<Item<I>, Item<O>> {
    return ixop.flatMap(({ key, value }) => mapper.map(key, value))
}

export function mapItemsAsync<I, O>(mapper: Mapper<I, O>): OperatorAsyncFunction<Item<I>, Item<O>> {
    return ixaop.flatMap(({ key, value }) => ixa.from(mapper.map(key, value)))
}

export function composeMappers<A, B, C>(f: Mapper<A, B>, g: Mapper<B, C>): Mapper<A, C> {
    return {
        map(key: Key, value: A): Iterable<Item<C>> {
            return ix.from(f.map(key, value)).pipe(
                ixop.flatMap(({ key, value }) => g.map(key, value))
            )
        },

        preimage(outputKey: Key): Key {
            return f.preimage(g.preimage(outputKey))
        }
    }
}


export function mappedTable<I, O>(input: Table<I>, mapper: Mapper<I, O>): Table<O> {
    return {
        getState(d: db.Database, version: VersionSpec): ItemIterable<O> {
            return ixa.from(input.getState(d, version)).pipe(
                mapItemsAsync(mapper)
            )
        },

        async getLatestVersionRequest(_d: db.Database, key: Key): Promise<VersionSpecRequest> {
            return input.getLatestVersionRequest(_d, mapper.preimage(key))
        }
    }
}


export interface Table<T> {
    getLatestVersionRequest(d: db.Database, key: Key): Promise<VersionSpecRequest>
    getState(d: db.Database, version: VersionSpec): ItemIterable<T>
}

export async function getLatestValue<T>(d: db.Database, table: LiveTable<T>, key: Key): Promise<Option<T>> {
    const version = await resolveVersionSpec(d, await table.getLatestVersionRequest(d, key))
    return table.getState(d, key, version)
}

export interface CollectionMapper<T> {
    (key: Key, value: T): string[]
}

export function diffCollections<T>(diff: Diff<T>, collectionMapper: CollectionMapper<T>): FacetDiff {
    switch (diff.kind) {
        case 'add':
            return {
                joinedCollections: collectionMapper(diff.key, diff.value),
                leftCollections: [],
            }
        case 'delete':
            return {
                joinedCollections: [],
                leftCollections: collectionMapper(diff.key, diff.value),
            }
        case 'replace':
            const oldCollections = collectionMapper(diff.key, diff.oldValue)
            const newCollections = collectionMapper(diff.key, diff.newValue)
            return {
                joinedCollections: newCollections.filter(c => !oldCollections.includes(c)),
                leftCollections: oldCollections.filter(c => !newCollections.includes(c)),
            }
    }
}

export interface LiveTable<T> {
    getLatestVersionRequest(d: db.Database, key: Key): Promise<VersionSpecRequest>
    getState(d: db.Database, key: Key, version: VersionSpec): Promise<Option<T>>
}

export interface PrimaryTable<T> {
    schema: Key
    getState(d: db.Database, key: Key, actionId: string): Promise<Option<T>>
}

export interface AggregationTable<TSource, TShare, TResult> {
    schema: Key
    getShares(sourceKey: Key, sourceValue: TSource): Iterable<Item<TShare>>
    aggregateShares(groupKey: Key, shares: Iterable<TShare>): TResult
}

export function livePrimaryTable<T>(
    source: PrimaryTable<T>): LiveTable<T> {
    return {
        async getState(d: db.Database, key: Key, version: VersionSpec): Promise<Option<T>> {
            const docPath = db.serializeDocPath(source.schema, key)
            const docVersion = option.of(version.docs[docPath]).unwrap();
            if (docVersion.exists) {
                return await source.getState(d, key, docVersion.actionId)

            } else {
                return option.none()
            }
        },
        async getLatestVersionRequest(d: db.Database, key: Key): Promise<VersionSpecRequest> {
            const docPath = db.serializeDocPath(source.schema, key)
            return {
                docs: [docPath],
                collections: [],
            }
        }
    }
}

export function liveAggregatedTable<TSource, TShare, TResult>(
    source: PrimaryTable<TSource>,
    agg: AggregationTable<TSource, TShare, TResult>
): LiveTable<TResult> {
    return {
        async getState(d: db.Database, key: Key, version: VersionSpec): Promise<Option<TResult>> {

            return getAggregatedState(d, source, agg, key, version)
        },

        async getLatestVersionRequest(d: db.Database, key: Key): Promise<VersionSpecRequest> {
            const collectionPath = db.serializeDocPath(agg.schema, key);
            return {
                docs: [],
                collections: [collectionPath],
            }
        }
    }
}


export function liveMappedTable<TSource, TResult>(
    source: LiveTable<TSource>,
    mapper: Mapper<TSource, TResult>
): LiveTable<TResult> {
    return {
        async getState(d: db.Database, key: Key, version: VersionSpec): Promise<Option<TResult>> {
            const sourceKey = mapper.preimage(key)
            const maybeSource = await source.getState(d, sourceKey, version);
            const mapped = ix.of(maybeSource).pipe(
                util.filterNone(),
                ixop.flatMap(value => mapper.map(sourceKey, value)),
            )

            return findItem(mapped, key)
        },
        async getLatestVersionRequest(d: db.Database, key: Key): Promise<VersionSpecRequest> {
            const sourceKey = mapper.preimage(key)
            return source.getLatestVersionRequest(d, sourceKey)
        }
    }
}

export async function getPrimaryState<T>(d: db.Database, t: PrimaryTable<T>, key: Key, version: VersionSpec): Promise<Option<T>> {
    const docVersion = option.of(version.docs[db.serializeDocPath(t.schema, key)]).unwrap();
    if (!docVersion.exists) {
        return option.none()
    }
    return t.getState(d, key, docVersion.actionId)
}

export function getAllPrimaryStates<T>(d: db.Database, t: PrimaryTable<T>, version: VersionSpec): ItemIterable<T> {
    return ixa.from(Object.entries(version.docs)).pipe(
        getActionIdsForSchema(t.schema),
        ixaop.map(async ({ key, value: actionId }: Item<string>): Promise<Option<Item<T>>> =>
            option.from(await t.getState(d, key, actionId)).map(v => item(key, v))),
        util.filterNoneAsync()
    )
}

export async function getAggregatedState<TSource, TShare, TResult>(
    d: db.Database,
    source: PrimaryTable<TSource>,
    agg: AggregationTable<TSource, TShare, TResult>, key: Key,
    version: VersionSpec): Promise<Option<TResult>> {
    const collectionPath = db.serializeDocPath(agg.schema, key);
    if (!version.collections.includes(collectionPath)) {
        throw new Error("bad version")
    }
    const primaryRecords = getAllPrimaryStates(d, source, version)
    const shareRecords = ixa.from(primaryRecords).pipe(
        ixaop.flatMap(({ key, value }) => ixa.from(agg.getShares(key, value)))
    )
    const aggregated = shareRecords.pipe(
        ixaop.groupBy(item => db.serializeDocPath(agg.schema, item.key),
            item => item.value,
            (groupPath: string, shares: Iterable<TShare>): Item<TResult> => {
                const { key: groupKey } = db.parseDocPath(groupPath);
                return item(groupKey, agg.aggregateShares(groupKey, shares))
            }
        )
    )
    return option.from(await findItemAsync(aggregated, key))
}

export function getActionIdsForSchema(targetSchema: Key): OperatorAsyncFunction<[string, DocVersionSpec], Item<string>> {
    return ixaop.flatMap(([docId, docVersion]): ItemIterable<string> => {
        const { schema, key } = db.parseDocPath(docId);
        if (util.lexCompare(schema, targetSchema) === 0 && docVersion.exists) {
            return ixa.of(item(key, docVersion.actionId))
        } else {
            return ixa.empty()
        }
    })
}
