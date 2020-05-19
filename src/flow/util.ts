import _ from 'lodash'
import { from, last, IterableX } from 'ix/iterable'
import { OperatorFunction } from 'ix/interfaces'
import { minBy, takeLast, filter, flatMap, tap, map } from 'ix/iterable/operators'
import { strict as assert } from 'assert';

export type Result<R, E> = {
    ok: true,
    value: R,
} | {
    ok: false,
    err: E
}

export function ok<R, E>(r: R): Result<R, E> {
    return { ok: true, value: r }
}

export function err<R, E>(e: E): Result<R, E> {
    return { ok: false, err: e }
}

export type Option<R> = {
    some: true,
    value: R
} | {
    some: false
}

export function some<R>(r: R): Option<R> {
    return { some: true, value: r }
}

export function none<R>(): Option<R> {
    return { some: false }
}

export type Comparator<T> = (a: T, b: T) => number


export async function* sortedMerge<T>(
    streams: AsyncIterable<T>[],
    cmp: Comparator<T>): AsyncIterable<T> {
    const iters = streams.map(s => s[Symbol.asyncIterator]());

    const entries = await Promise.all(iters.map(i => i.next()));
    while (entries.some(e => !e.done)) {
        const minned = from(entries).pipe(
            map((entry, idx) => [idx, entry] as [number, IteratorResult<T>]),
            flatMap(([idx, e]): [number, T][] => e.done ? [] : [[idx, e.value]]),
            minBy((([_idx, e]) => e), cmp)
        );

        let [minIdx, minVal] = last(minned)!;

        yield minVal;
        entries[minIdx] = await iters[minIdx].next();
    }
}


export async function* batchStreamBy<T>(
    stream: AsyncIterable<T>,
    cmp: (a: T, b: T) => number): AsyncIterable<T[]> {
    const iter = stream[Symbol.asyncIterator]()
    for (let entry = await iter.next(); !entry.done;) {
        const batch: T[] = [entry.value];
        entry = await iter.next()

        for (; !entry.done; entry = await iter.next()) {
            if (cmp(entry.value, batch[0]) === 0) {
                batch.push(entry.value)
            } else {
                break;
            }
        }

        yield batch
    }
}

export function strcmp(a: string, b: string): number {
    if (a < b) { return -1; }
    if (b < a) { return 1; }
    return 0;
}

export function lexCompare(a: string[], b: string[]): number {
    if (a.length !== b.length) {
        throw new Error(`cannot compare keys with different lengths: "${JSON.stringify(a)}" vs ${JSON.stringify(b)}`)
    }

    for (let i = 0; i < a.length; i++) {
        const cmp = strcmp(a[i], b[i])
        if (cmp !== 0) {
            return cmp
        }
    }
    return 0
}

export function stringSuccessor(s: string): string {
    return s + '\0';
}

export function invertPermutation(permutation: number[]): number[] {
    const res = permutation.map(() => -1)
    for (let i = 0; i < permutation.length; i++) {
        res[permutation[i]] = i
    }
    return res
}

export function permute<T>(permutation: number[], a: T[]): T[] {
    return permutation.map(idx => a[idx])
}

export function assertIsPermutation(permutation: number[]): void {
    const nums = new Set<number>();
    for (const p of permutation) {
        if (p < 0 || permutation.length <= p) {
            assert.fail("out of bounds");
        }
        if (nums.has(p)) {
            assert.fail("duplicate");
        }
        nums.add(p);
    }
}

class NarrowIterable<TSource, TResult extends TSource> extends IterableX<TResult> {
    constructor(
        private source: Iterable<TSource>,
        private predicate: (value: TSource, index: number) => value is TResult) {
        super();
    }

    *[Symbol.iterator]() {
        let i = 0;
        for (const item of this.source) {
            if (this.predicate(item, i++)) {
                yield item;
            }
        }
    }
}

export function narrow<TSource, TResult extends TSource>(
    selector: (value: TSource, index: number) => value is TResult
): OperatorFunction<TSource, TResult> {
    return function narrowOperatorFunction(source: Iterable<TSource>): IterableX<TResult> {
        return new NarrowIterable<TSource, TResult>(source, selector);
    };
}


export function drop_null<TSource>(): OperatorFunction<TSource | null, TSource> {
    return narrow((x: TSource | null, _idx: number): x is TSource => x !== null);
}
