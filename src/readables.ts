
import { Readable, ItemIterable, Range, Key } from './interfaces'
import * as ranges from './ranges';
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"

function merge<T>(...readables: Readable<T>[]): Readable<T> {
    return {
        schema: readables[0].schema,
        read(rng: Range): ItemIterable<T> {
            throw "unimpl"
        }
    }
}

export async function get<T, D>(source: Readable<T>, key: Key, def: D): Promise<T | D> {
    for await (const [, value] of source.read(ranges.singleValue(key))) {
        return value
    }
    return def
}

export function readAll<T>(source: Readable<T>): ItemIterable<T> {
    return source.read(ranges.unbounded(source.schema.map(_ => '')));
}

export function readAllAfter<T>(source: Readable<T>, startAfter: Key): ItemIterable<T> {
    return source.read(ranges.unbounded(ranges.keySuccessor(startAfter)))
}
