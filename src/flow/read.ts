import { Item,  Readable, Key, ScrambledSpace, ItemIterable } from "./base";
import deepEqual from "deep-equal";
import { Range, rangeContains, rangeContainsRange, singleValue } from "./range";
import { from, first } from "ix/asynciterable";
import { filter, takeWhile, flatMap, tap } from "ix/asynciterable/operators";
import { lexCompare } from "./util";

export async function get<T>(source: Readable<T>, key: Key): Promise<T | null> {
    return getOrDefault(source, key, null)
}

export async function getOrDefault<T, D>(source: Readable<T>, key: Key, def: D): Promise<T | D> {
    console.log("GET OR DEFAULT", source, key)
    for await (const [k, value] of list(source, singleValue(key))) {
    console.log("GOT ", k, value)
        if (deepEqual(k, key)) {
            return value
        } else {
            return def
        }
    }
    return def
}

export function list<T>(source: Readable<T>, range: Range): AsyncIterable<Item<T>> {
    return from(source.seekTo(range.start))
    .pipe(tap(([key, _value])=>console.log("seeked", range, key, _value, range.kind === 'bounded' ? lexCompare(key, range.end) : "UNBOUNDED")))
        .pipe(takeWhile(([key, _value])=> rangeContains(range, key)))
}

export function readAll<T>(source: Readable<T>): AsyncIterable<Item<T>> {
    return source.seekTo(source.schema.map(_=>''));
}

export function unsortedListAll<T>(source: ScrambledSpace<T>): ItemIterable<T> {
    return from(source.seekTo(source.schema.map(_=>'')))
        .pipe(flatMap(slice => slice.seekTo(slice.range.start)))
}

export async function *readRangeFromSingleSlice<T>(input : ScrambledSpace<T>, range : Range): ItemIterable<T> {
    const slice = (await first(input.seekTo(range.start)))!;
    if (!rangeContainsRange(slice.range, range)) {
        throw "requested range wasn't contained in a single slice"
    }
    yield* list(slice, range);
}

export async function getFromScrambledOrDefault<T, D>(input : ScrambledSpace<T>, key : Key, def : D): Promise<T | D> {
    console.log('GET FROM', input, key)
    return await getOrDefault((await first(input.seekTo(key)))!, key, def);
}
