import { Item, Readable, Key, ScrambledSpace, ItemIterable, Readable2, Slice } from "./base";
import deepEqual from "deep-equal";
import { Range, rangeContains, rangeContainsRange, singleValue, compareRangeEndpoints } from "./range";
import { first, create, empty } from "ix/asynciterable";
import { filter, takeWhile, take, flatMap, tap } from "ix/asynciterable/operators";
import { lexCompare } from "./util";
import * as ixa from "ix/asynciterable";



export async function get<T>(source: Readable<T>, key: Key): Promise<T | null> {
    return getOrDefault(source, key, null)
}

export async function getOrDefault<T, D>(source: Readable<T>, key: Key, def: D): Promise<T | D> {
    for await (const [k, value] of list(source, singleValue(key))) {
        if (deepEqual(k, key)) {
            return value
        } else {
            return def
        }
    }
    return def
}

export async function getOrDefault2<T, D>(source: Readable2<T>, key: Key, def: D): Promise<T | D> {
    for await (const [k, value] of source.read(singleValue(key))) {
        return value
    }
    return def
}

export function list<T>(source: Readable<T>, range: Range): AsyncIterable<Item<T>> {
    return ixa.from(source.seekTo(range.start))
        .pipe(takeWhile(([key, _value]) => rangeContains(range, key)))
}

export function readAll<T>(source: Readable<T>): AsyncIterable<Item<T>> {
    return source.seekTo(source.schema.map(_ => ''));
}

export function unsortedListAll<T>(source: ScrambledSpace<T>): ItemIterable<T> {
    return ixa.from(source.seekTo(source.schema.map(_ => '')))
        .pipe(flatMap(slice => slice.iter))
}

export async function* readRangeFromSingleSlice<T>(input: ScrambledSpace<T>, range: Range): ItemIterable<T> {
    const firstSlice = await first(input.seekTo(range.start));
    if (firstSlice === undefined) {
        // Past the last slice.
        return empty();
    }

    if (!rangeContains(firstSlice.range, range.start)) {
        // No range contains the starting value, so either there are no
        // values in range, or the range spans multiple slices. Assume there 
        // just aren't any values.
        return empty();
    }

    if (!rangeContainsRange(firstSlice.range, range)) {
        throw new Error(`range spans multiple slices. range: ${JSON.stringify(range)}; 
        first slice: ${JSON.stringify(firstSlice.range)}`)
    }

    yield* ixa.from(firstSlice.iter)
        .pipe(takeWhile(([key, _value]) => rangeContains(range, key)))
}


export function subslice<T>(input: ScrambledSpace<T>, range: Range): Slice<T> {
    return {
        range,
        iter: readRangeFromSingleSlice(input, range),
    }
}

// export function subslice<T>(input: Slice<T>, range: Range): Slice<T> {
//     if (!rangeContainsRange(input.range, range)) {
//         throw new Error(`subslice not contained within slice: slice range: ${JSON.stringify(input.range)}; 
//         requested range: ${JSON.stringify(range)}`)
//     }

//     return {
//         range,
//         iter: from(input.iter)
//             .pipe(filter(([key, _value]) => rangeContains(range, key)))
//     }
// }

export async function getFromScrambledOrDefault<T, D>(input: ScrambledSpace<T>, key: Key, def: D): Promise<T | D> {
    const slice = await first(readRangeFromSingleSlice(input, singleValue(key)));
    return slice !== undefined ? slice[1] : def;
}
