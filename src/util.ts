
import { strict as assert } from 'assert';

import * as ix from "ix/iterable"
import * as ixop from "ix/iterable/operators"


export type Comparator<T> = (a: T, b: T) => number

export function mapValues<V1, V2>(obj: { [k: string]: V1 },
    fn: (k: string, v: V1) => V2): { [k: string]: V2 } {
    return Object.assign({}, ...Object.entries(obj).map(([k, v]) => {
        return { [k]: fn(k, v) }
    }))
}

export type Maybe<V> = { result: 'some', value: V } | { result: 'none' }

export function strcmp(a: string, b: string): number {
    if (a < b) { return -1; }
    if (b < a) { return 1; }
    return 0;
}

export function lexCompare(a: string[], b: string[]): number {
    if (a.length !== b.length) {
        throw new Error('not supported')
    }

    for (let i = 0; i < a.length; i++) {
        const cmp = strcmp(a[i], b[i])
        if (cmp !== 0) {
            return cmp
        }
    }
    return 0
}

export function keyStartsWith(key: string[], prefix: string[]): boolean {
    if (key.length < prefix.length) {
        return false
    }
    for (let i = 0; i < prefix.length; i++) {
        if (key[i] !== prefix[i]) {
            return false
        }
    }
    return true
}

export async function* sortedMerge<T>(
    streams: AsyncIterable<T>[],
    cmp: Comparator<T>): AsyncIterable<T> {
    const iters = streams.map(s => s[Symbol.asyncIterator]());

    const entries = await Promise.all(iters.map(i => i.next()));
    while (entries.some(e => !e.done)) {
        const minned = ix.from(entries).pipe(
            ixop.map((entry, idx) => [idx, entry] as [number, IteratorResult<T>]),
            ixop.flatMap(([idx, e]): [number, T][] => e.done ? [] : [[idx, e.value]]),
            ixop.minBy((([_idx, e]) => e), cmp)
        );

        let [minIdx, minVal] = ix.last(minned)!;

        yield minVal;
        entries[minIdx] = await iters[minIdx].next();
    }
}

export async function* streamTakeWhile<T>(
    stream: AsyncIterable<T>,
    pred: (t: T) => boolean): AsyncIterable<T> {
    for await (const t of stream) {
        if (!pred(t)) {
            return
        }
        yield t
    }
}

export async function* batchStreamBy<T, K>(
    stream: AsyncIterable<T>,
    extractor: (t: T) => K,
    cmp: (a: K, t: K) => number): AsyncIterable<[K, T[]]> {
    const iter = stream[Symbol.asyncIterator]()
    for (let entry = await iter.next(); !entry.done;) {
        const batchKey = extractor(entry.value)
        const batch: T[] = []

        for (; !entry.done; entry = await iter.next()) {
            const entryKey = extractor(entry.value)
            if (cmp(entryKey, batchKey) < 0) {
                // entryKey < batchKey
                throw new Error("stream not sorted")
            }
            if (cmp(entryKey, batchKey) === 0) {
                // entryKey === batchKey
                batch.push(entry.value)
            }
            if (cmp(entryKey, batchKey) > 0) {
                // entryKey > batchKey
                break
            }
        }

        yield [batchKey, batch]
    }
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

export function sorted<T>(i: Iterable<T>, cmp?: Comparator<T>): T[] {
    const res = Array.from(i)
    res.sort(cmp)
    return res
}

export type AsyncResponse<R, E> = Promise<Response<R, E>>

export type Response<R, E> = {
    status: 'ok',
    value: R,
} | {
    status: 'err'
    error: E
}

export function ok<R, E>(r: R): Response<R, E> {
    return { status: 'ok', value: r }
}

export function err<R, E>(e: E): Response<R, E> {
    return { status: 'err', error: e }
}
