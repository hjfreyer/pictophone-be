import _ from 'lodash'
import { from, last } from 'ix/iterable'
import { minBy, takeLast, filter, flatMap } from 'ix/iterable/operators'

export type Result<R, E> = {
    ok: true,
    value: R,
} | {
    ok: false,
    err: E
}

export function ok<R, E>(r : R): Result<R, E> {
    return {ok: true, value: r}
}

export function err<R, E>(e : E): Result<R, E> {
    return {ok: false, err: e}
}

export type Option<R> = {
    some: true,
    value: R
} | {
    some: false
}

export function some<R>(r: R): Option<R> {
    return {some: true, value: r}
}

export function none<R>(): Option<R> {
    return {some: false}
}

export type Comparator<T> = (a : T, b : T) => number


export async function* sortedMerge<T>(
    streams: AsyncIterable<T>[],
    cmp: Comparator<T>): AsyncIterable<T> {
    const iters = streams.map(s => s[Symbol.asyncIterator]());

    const entries = await Promise.all(iters.map(i => i.next()));
    while (entries.some(e => !e.done)) {
        let [minIdx, minVal] = last(from(entries.entries()).pipe(
            flatMap(([idx, e]): [number, T][] => e.done ? [] : [[idx, e.value]]),
            minBy((([_idx, e]) => e), cmp),
        ))!;
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




export function lexCompare(a: string[], b: string[]): number {
    if (a.length !== b.length) {
        throw new Error('not supported')
    }

    for (let i = 0; i < a.length; i++) {
        const cmp = a[i].localeCompare(b[i])
        if (cmp !== 0) {
            return cmp
        }
    }
    return 0
}

export function stringSuccessor(s: string): string {
    return s + '\0';
}