import { Diff , Item, ScrambledSpace} from "./base";
import * as read from './read';
import deepEqual from "deep-equal";
import { Readable } from "./base";
import { map, flatMap, concatAll } from "ix/asynciterable/operators";
import { from, of } from "ix/asynciterable";

export function getDiffs<T>(expected: ScrambledSpace<T>, actual: Readable<T>): AsyncIterable<Diff<T>> {
    const diffs = from(read.unsortedListAll(expected))
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
    console.log("expected schema:", expected.schema)
    console.log("actual schema:", actual.schema)

    const orphans = from(read.readAll(actual))
        .pipe(flatMap(async ([key, actualValue]):Promise<AsyncIterable<Diff<T>>> => {
            if (await read.getFromScrambledOrDefault(expected, key, null) === null) {
                return of({
                    kind: 'delete',
                    key,
                    value: actualValue,
                });
            } else {
                return of();
            }
        } ));

    return of(diffs, orphans).pipe(concatAll());
}

// export async function *getOrphans<T>(isExpected: (key: string[]) => Promise<boolean>, actual: Readable<T>): AsyncIterable<Diff<T>> {
//     for await(const [key, actualValue] of read.readAll(actual)) {
//         if (!await isExpected(key)) {
//             yield {
//                 kind: 'delete',
//                 key,
//                 value: actualValue,
//             }
//         }
//     }
// }