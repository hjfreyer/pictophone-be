import { Diff , Item} from "./base";
import * as read from './read';
import deepEqual from "deep-equal";
import { Readable } from "../flow/base";

export async function *getDiffs<T>(expected: AsyncIterable<Item<T>>, actual: Readable<T>): AsyncIterable<Diff<T>> {
    for await(const [key, expectedValue] of expected) {
        const actualValue = await read.get(actual, key);
        if (actualValue === null) {
            yield {
                kind: 'add',
                key,
                value: expectedValue,
            }
        } else if (!deepEqual(expectedValue, actualValue)) {
            yield {
                kind: 'replace',
                key,
                oldValue: actualValue,
                newValue: expectedValue,
            }
        }
    }
}

export async function *getOrphans<T>(isExpected: (key: string[]) => Promise<boolean>, actual: Readable<T>): AsyncIterable<Diff<T>> {
    for await(const [key, actualValue] of read.readAll(actual)) {
        if (!await isExpected(key)) {
            yield {
                kind: 'delete',
                key,
                value: actualValue,
            }
        }
    }
}