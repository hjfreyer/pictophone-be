
import * as ix from "ix/iterable";
import * as ixop from "ix/iterable/operators";
import { Diff, Item, Key } from './interfaces';
import * as util from './util';
import deepEqual from "deep-equal";

export class Diffs<T> {
    constructor(public diffs: Diff<T>[]) { }

    map<O>(mapper: Mapper<T, O>): Diffs<O> {
        return from(ix.from(this.diffs).pipe(ixop.flatMap(d => ix.from(singleMap(mapper, d)))))
    }
}

export function newDiff<T>(key: Key, oldValue: util.Defaultable<T>, newValue: util.Defaultable<T>): Diff<T>[] {
    if (oldValue.is_default && newValue.is_default) {
        return [];
    }
    if (oldValue.is_default && !newValue.is_default) {
        return [{
            key,
            kind: 'add',
            value: newValue.value,
        }]
    }
    if (!oldValue.is_default && newValue.is_default) {
        return [{
            key,
            kind: 'delete',
            value: oldValue.value,
        }]
    }
    if (!oldValue.is_default && !newValue.is_default) {
        if (deepEqual(oldValue, newValue, { strict: true })) {
            return []
        } else {
            return [{
                key,
                kind: 'replace',
                oldValue: oldValue.value,
                newValue: newValue.value,
            }]
        }
    }
    throw new Error("unreachable")
}

export function from<T>(diffs: Iterable<Diff<T>>): Diffs<T> {
    return new Diffs(Array.from(diffs))
}

export interface Mapper<I, O> {
    // Must be injective: input items with different keys must never produce 
    // output items with the same key.
    (key: Key, value: I): Iterable<Item<O>>
}

function singleMap<I, O>(mapper: Mapper<I, O>, diff: Diff<I>): Iterable<Diff<O>> {
    const [oldMapped, newMapped] = (() => {
        switch (diff.kind) {
            case 'add':
                return [[], mapper(diff.key, diff.value)]
            case 'delete':
                return [mapper(diff.key, diff.value), []]
            case 'replace':
                return [mapper(diff.key, diff.oldValue), mapper(diff.key, diff.newValue)]
        }
    })()
    type AgedItem = { age: 'old' | 'new', key: Key, value: O };
    const tagger = (age: 'old' | 'new') => ({ key, value }: Item<O>): AgedItem => ({ age, key, value });

    const aged: ix.IterableX<AgedItem> = ix.concat(
        ix.from(oldMapped).pipe(ixop.map(tagger('old'))),
        ix.from(newMapped).pipe(ixop.map(tagger('new'))));
    return aged.pipe(
        ixop.groupBy(({ key }) => JSON.stringify(key), x => x, (_, valueIter) => {
            const values = Array.from(valueIter);
            if (values.length === 0) {
                throw new Error("wtf")
            }
            if (2 < values.length) {
                throw new Error("mapper must have returned the same key multiple times")
            }
            if (values.length === 1) {
                const [{ age, key, value }] = values;
                return {
                    kind: age === 'old' ? 'delete' : 'add',
                    key,
                    value,
                }
            }
            // Else, values has 2 elements.
            if (values[0].age === values[1].age) {
                throw new Error("mapper must have returned the same key multiple times")
            }
            return {
                kind: 'replace',
                key: values[0].key,
                oldValue: values[0].age === 'old' ? values[0].value : values[1].value,
                newValue: values[0].age === 'new' ? values[0].value : values[1].value,
            }
        })
    )
}
