
import * as ix from "ix/iterable";
import * as ixop from "ix/iterable/operators";
import * as ixa from "ix/asynciterable";
import * as ixaop from "ix/asynciterable/operators";
import { Diff, Item, Key } from './interfaces';
import * as util from './util';
import deepEqual from "deep-equal";
import * as ixi from "ix/interfaces";

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

export function newDiff2<T>(key: Key, oldValue: util.Option<T>, newValue: util.Option<T>): Diffs<T> {
    if (!oldValue.data.some && !newValue.data.some) {
        return from([]);
    }
    if (!oldValue.data.some && newValue.data.some) {
        return from([{
            key,
            kind: 'add',
            value: newValue.data.value,
        }])
    }
    if (oldValue.data.some && !newValue.data.some) {
        return from([{
            key,
            kind: 'delete',
            value: oldValue.data.value,
        }])
    }
    if (oldValue.data.some && newValue.data.some) {
        if (deepEqual(oldValue, newValue, { strict: true })) {
            return from([])
        } else {
            return from([{
                key,
                kind: 'replace',
                oldValue: oldValue.data.value,
                newValue: newValue.data.value,
            }])
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

export function mapDiffs<I, O>(mapper: Mapper<I, O>): ixi.OperatorFunction<Diff<I>, Diff<O>> {
    return ixop.flatMap(d => ix.from(singleMap(mapper, d)))
}

export function mapItems<I, O>(mapper: Mapper<I, O>): ixi.OperatorFunction<Item<I>, Item<O>> {
    return ixop.flatMap(({ key, value }) => mapper.map(key, value))
}

export function mapItemsAsync<I, O>(mapper: Mapper<I, O>): ixi.OperatorAsyncFunction<Item<I>, Item<O>> {
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

