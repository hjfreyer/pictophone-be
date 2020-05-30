
import deepEqual from 'deep-equal';
import * as ixa from "ix/asynciterable";
import * as ixaop from "ix/asynciterable/operators";
import * as ix from "ix/iterable";
import { Diff, Item, ItemIterable, Key, Readable } from './interfaces';
import * as readables from './readables';

export type Collection<T> = AsyncIterable<Diff<T>>

export function fromDiffs<T>(diffs: Iterable<Diff<T>>): Collection<T> {
    return ixa.from(diffs)
}

export function toDiffs<T>(c: Collection<T>): Promise<Diff<T>[]> {
    return ixa.toArray(c)
}

export interface Mapper<I, O> {
    // Must be injective: input items with different keys must never produce 
    // output items with the same key.
    (item: Item<I>): Iterable<Item<O>>
}

export function map<I, O>(c: Collection<I>, mapper: Mapper<I, O>): Collection<O> {
    return ixa.from(c).pipe(ixaop.flatMap(d => ixa.from(singleMap(mapper, d))))
}

function singleMap<I, O>(mapper: Mapper<I, O>, diff: Diff<I>): AsyncIterable<Diff<O>> {
    const [oldMapped, newMapped] = (() => {
        switch (diff.kind) {
            case 'add':
                return [[], mapper([diff.key, diff.value])]
            case 'delete':
                return [mapper([diff.key, diff.value]), []]
            case 'replace':
                return [mapper([diff.key, diff.oldValue]), mapper([diff.key, diff.newValue])]
        }
    })()
    type AgedItem = { age: 'old' | 'new', key: Key, value: O };
    const tagger = (age: 'old' | 'new') => ([key, value]: Item<O>): AgedItem => ({ age, key, value });

    const aged: ixa.AsyncIterableX<AgedItem> = ixa.concat(
        ixa.from(oldMapped).pipe(ixaop.map(tagger('old'))),
        ixa.from(newMapped).pipe(ixaop.map(tagger('new'))));
    return aged.pipe(
        ixaop.groupBy(({ key }) => JSON.stringify(key), x => x, (_, valueIter) => {
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

export interface Combiner<T> {
    identity(): T
    opposite(n: T): T
    combine(a: T, b: T): T
}

export function combine<T>(
    c: Collection<T>,
    combiner: Combiner<T>,
    accTable: Readable<T>): Collection<T> {
    const deltas: ItemIterable<T> = ixa.from(c).pipe(
        ixaop.flatMap((diff: Diff<T>): ItemIterable<T> => {
            switch (diff.kind) {
                case 'add':
                    return ixa.of([diff.key, diff.value]);
                case 'delete':
                    return ixa.of([diff.key, combiner.opposite(diff.value)]);
                case 'replace':
                    return ixa.of([diff.key, diff.newValue], [diff.key, combiner.opposite(diff.oldValue)]);
            }
        }),
        ixaop.groupBy(
            ([key,]) => JSON.stringify(key),
            ([, delta]) => delta,
            (key_json, deltas) => {
                return [JSON.parse(key_json), ix.reduce(deltas, combiner.combine, combiner.identity())]
            })
    );

    const reducer: Reducer<T, T> = {
        start(): T { return combiner.identity() },
        reduce(key: Key, acc: T, delta: T): T {
            return combiner.combine(acc, delta)
        }
    }

    return reduce(reducer, accTable, deltas)
}

export interface Reducer<TAction, TAccumulator> {
    start(): TAccumulator
    reduce(key: Key, acc: TAccumulator, action: TAction): TAccumulator
}

function reduce<TAction, TAccumulator>(
    reducer: Reducer<TAction, TAccumulator>,
    accTable: Readable<TAccumulator>,
    actions: ItemIterable<TAction>): AsyncIterable<Diff<TAccumulator>> {
    return ixa.from(actions).pipe(
        ixaop.flatMap(async ([key, action]: Item<TAction>): Promise<AsyncIterable<Diff<TAccumulator>>> => {
            const oldAccOrNull = await readables.get(accTable, key, null);
            const oldAcc = oldAccOrNull !== null ? oldAccOrNull : reducer.start();
            const newAcc = reducer.reduce(key, oldAcc, action);
            if (deepEqual(oldAcc, newAcc)) {
                return ixa.empty();
            }
            if (oldAccOrNull === null) {
                return ixa.of({
                    kind: 'add',
                    key,
                    value: newAcc
                })
            } else {
                return ixa.of({
                    kind: 'replace',
                    key,
                    oldValue: oldAcc,
                    newValue: newAcc,
                })
            }
        })
    )
}
