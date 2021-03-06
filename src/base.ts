
import * as db from './db'
import { Live, Diff, Change, Key, ItemIterable, Item, item } from './interfaces'
// import { validate } from './schema/interfaces.validator'
import { AnyAction, SavedAction } from './model';
import { VersionSpec, DocVersionSpec } from './model/base'
import { sha256 } from 'js-sha256';
import _ from 'lodash';
// import { Tables } from './schema';
import * as util from './util'
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import * as ix from "ix/iterable"
import * as ixop from "ix/iterable/operators"
import * as readables from './readables'
import { basename } from 'path';
import { Option, option } from './util'

// export function validateLive<T>(validator: (u: unknown) => T): (u: unknown) => Live<T> {
//     return (outerUnknown: unknown): Live<T> => {
//         const outer = validate('LiveUnknown')(outerUnknown)
//         if (outer.value === null) {
//             return { actionId: outer.actionId, value: null };
//         }
//         return { actionId: outer.actionId, value: validator(outer.value) }
//     }
// }

// export function validateDiff<T>(validator: (u: unknown) => T): (u: DiffUnknown) => Diff<T> {
//     return (diff: DiffUnknown): Diff<T> => {
//         switch (diff.kind) {
//             case 'add':
//             case 'delete':
//                 return {
//                     kind: diff.kind,
//                     key: diff.key,
//                     value: validator(diff.value)
//                 }
//             case 'replace':
//                 return {
//                     kind: 'replace',
//                     key: diff.key,
//                     oldValue: validator(diff.oldValue),
//                     newValue: validator(diff.newValue),
//                 }
//         }
//     }
// }

export function applyChangesSimple<T>(t: db.Table<T>, changes: Change<T>[]): void {
    for (const change of changes) {
        switch (change.kind) {
            case 'set':
                t.set(change.key, change.value);
                break;
            case 'delete':
                t.delete(change.key);
                break;
        }
    }
}
export function applyChanges<T>(t: db.Table<Live<T>>, actionId: string, changes: Change<T>[]): void {
    for (const change of changes) {
        switch (change.kind) {
            case 'set':
                t.set(change.key, { actionId, value: change.value });
                break;
            case 'delete':
                t.set(change.key, { actionId, value: null });
                break;
        }
    }
}

export function diffToChange<T>(d: Diff<T>): Change<T> {
    switch (d.kind) {
        case 'add':
            return {
                kind: 'set',
                key: d.key,
                value: d.value,
            }
        case 'replace':
            return {
                kind: 'set',
                key: d.key,
                value: d.newValue,
            }
        case 'delete':
            return {
                kind: 'delete',
                key: d.key,
            }
    }
}

export function findItem<T>(items: Iterable<Item<T>>, key: Key): Option<T> {
    return option.of(ix.find(items, item => util.lexCompare(item.key, key) === 0)).map(
        item => item.value
    )
}

export async function findItemAsync<T>(items: ItemIterable<T>, key: Key): Promise<util.Option<T>> {
    return util.option.of(await ixa.find(items, item => util.lexCompare(item.key, key) === 0)).map(
        item => item.value
    )
}

const HASH_HEX_CHARS_LEN = (32 / 8) * 2;  // 32 bits of hash
const PREFIX = '0';
function serializeActionId(date: Date, hashHex: string): string {
    return PREFIX + `${date.toISOString()}${hashHex.slice(0, HASH_HEX_CHARS_LEN)}`
}

function parseActionId(serialized: string): [Date, string] {
    const id = basename(serialized)
    if (!id.startsWith(PREFIX)) {
        throw new Error('unknown action ID format');
    }

    const dateStr = id.slice(PREFIX.length, id.length - HASH_HEX_CHARS_LEN);
    const hashStr = id.slice(id.length - HASH_HEX_CHARS_LEN);

    return [new Date(dateStr), hashStr]
}


export function maxBy<T>(source: Iterable<T>, cmp: (a: T, b: T) => number): util.Option<T> {
    let value: util.Option<T> = util.option.none();
    for (const item of source) {
        if (!value.data.some) {
            value = util.option.some(item);
            continue
        }
    }

    return value;
}

function dateCmp(a: Date, b: Date): number {
    if (a < b) {
        return -1
    }
    if (b < a) {
        return 1
    }
    return 0
}

function collectLeafs(spec: VersionSpec): Iterable<string> {
    return ix.from(Object.values(spec.docs)).pipe(
        ixop.flatMap(doc => doc.exists ? [doc.actionId] : [])
    )
}

export function compareActionIds(a: string, b: string): number {
    const dateA = parseActionId(a)[0];
    const dateB = parseActionId(b)[0];
    return dateCmp(dateA, dateB);
}

export function getActionId(action: SavedAction): string {
    // TODO: JSON.stringify isn't deterministic, so what's saved in the DB
    // should really be a particular serialization, but I'm not worrying
    // about that at the moment.
    const hashHex = sha256.hex(JSON.stringify(action));
    const maxDate = maxBy(ix.from(collectLeafs(action.parents)).pipe(
        ixop.map(actionId => parseActionId(actionId)[0]),
    ), dateCmp)

    let now = new Date();

    // TODO: just fake the date rather than waiting.
    while (util.option.from(maxDate).map(maxDate => now < maxDate).orElse(() => false)) {
        now = new Date();
    }
    return `games/${action.action.gameId}/actions/${serializeActionId(now, hashHex)}`;
}

export function getNewValue<T>(d: Diff<T>): Option<Item<T>> {
    switch (d.kind) {
        case "add":
            return option.some(item(d.key, d.value))
        case "delete":
            return option.none()
        case "replace":
            return option.some(item(d.key, d.newValue))
    }
}

export function getDocsInCollection(version: VersionSpec, collection: db.CollectionPath): Iterable<[Key, DocVersionSpec]> {
    const collectionPath = db.serializeCollectionPath(collection);
    if (version.collections.indexOf(collectionPath) === -1) {
        throw new Error("bad version")
    }

    return ix.from(Object.entries(version.docs)).pipe(
        // TODO: brittle
        ixop.filter(([docId,]) => docId.startsWith(collectionPath + '/')),
        ixop.map(([docId, version]) => [db.parseDocPath(docId).key, version])
    )
}
