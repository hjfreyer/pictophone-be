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
import { OperatorAsyncFunction } from 'ix/interfaces'
import * as diffs from './diffs'

export interface Input2<TState> {
    getParent(label: string): Promise<Option<TState>>
}

export interface ParentLink {
    actionId: OptionData<string>
}

export interface Annotation2<TState> {
    labels: string[]
    parents: Record<string, ParentLink>
    state: TState
}

export interface Revision2<TState> {
    id: string
    validateAnnotation(u: unknown): Annotation2<TState>
    integrate(action: AnyAction, inputs: Input2<TState>): Promise<IntegrationResult2<TState>>
}

export interface IntegrationResult2<TState> {
    labels: string[]
    state: TState
}

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


// export function getLatestAggregatedVersionRequest<TShare, TResult>(
//     agg: AggregationTable<TShare, TResult>, key: Key): VersionSpecRequest {
//     const collectionPath = db.serializeDocPath(agg.collectionSchema, key);
//     return {
//         docs: [],
//         collections: [collectionPath]
//     }
// }

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
    mapper: diffs.Mapper<TSource, TResult>
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
