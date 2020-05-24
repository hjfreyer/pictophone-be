import { Diff, Item, ScrambledSpace } from "./base";
import * as read from './read';
import deepEqual from "deep-equal";
import { Readable } from "./base";
import { map, flatMap, concatAll, tap } from "ix/asynciterable/operators";
import { of, concat } from "ix/asynciterable";
import * as ixa from "ix/asynciterable";

export function getDiffs<T>(expected: ScrambledSpace<T>, actual: Readable<T>): AsyncIterable<Diff<T>> {
    const diffs = ixa.from(read.unsortedListAll(expected))
        .pipe(flatMap(async ([key, expectedValue]): Promise<AsyncIterable<Diff<T>>> => {
            const actualValue = await read.get(actual, key);
            if (actualValue === null) {
                return of({
                    kind: 'add',
                    key,
                    value: expectedValue,
                })
            } else if (!deepEqual(expectedValue, actualValue)) {
                return of({
                    kind: 'replace',
                    key,
                    oldValue: actualValue,
                    newValue: expectedValue,
                })
            } else {
                return of();
            }
        }));

    const orphans = ixa.from(read.readAll(actual))
        .pipe(flatMap(async ([key, actualValue]): Promise<AsyncIterable<Diff<T>>> => {
            if (await read.getFromScrambledOrDefault(expected, key, null) === null) {
                return of({
                    kind: 'delete',
                    key,
                    value: actualValue,
                });
            } else {
                return of();
            }
        }));

    return concat(diffs, orphans);
}