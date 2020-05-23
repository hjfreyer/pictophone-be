// import { Item } from "./base";
// import deepEqual from "deep-equal";
// import { Readable } from "../flow/base";
// import { Range, rangeContains, singleValue } from "../flow/range";
// import { from } from "ix/asynciterable";
// import { filter, tap } from "ix/asynciterable/operators";

// export async function get<T>(source: Readable<T>, key: string[]): Promise<T | null> {
//     return getOrDefault(source, key, null)
// }

// export async function getOrDefault<T, D>(source: Readable<T>, key: string[], def: D): Promise<T | D> {
//     for await (const [k, value] of list(source, singleValue(new OrderedKey(key)))) {
//         if (deepEqual(k, key)) {
//             return value
//         } else {
//             return def
//         }
//     }
//     return def
// }

// export function list<T>(source: Readable<T>, range: Range): AsyncIterable<Item<T>> {
//     return from(source.sortedList(range))
//         .pipe(filter(([key, value]) => rangeContains(range, new OrderedKey(key))))
// }

// export function readAll<T>(source: Readable<T>): AsyncIterable<Item<T>> {
//     return list(source, everything());
// }

// // export function readRangeFromSingleSlice<T>(input : ScrambledSpace, range : Range): ItemIterable<T> {

// // }
