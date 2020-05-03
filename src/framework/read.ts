import { Readable } from "./base";
import deepEqual from "deep-equal";

export async function get<T>(source: Readable<T>, key: string[]): Promise<T | null> {
    return getOrDefault(source, key, null)
}

export async function getOrDefault<T, D>(source: Readable<T>, key: string[], def: D): Promise<T | D> {
    for await (const [k, value] of source.sortedList(key)) {
        if (deepEqual(k, key)) {
            return value
        } else {
            return def
        }
    }
    return def
}