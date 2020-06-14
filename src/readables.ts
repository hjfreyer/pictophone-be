
import { Readable, ItemIterable, Range, Key, Item, Live } from './interfaces'
import * as ranges from './ranges';
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import * as util from './util'

export function empty<T>(schema: string[]): Readable<T> {
    return {
        schema,
        read(range: Range): ItemIterable<T> {
            return ixa.empty()
        }
    }
}

export function merge<T>(schema: string[], readables: Readable<T>[]): Readable<T> {
    if (readables.length === 0) {
        return empty(schema)
    }
    return {
        schema,
        read(range: Range): ItemIterable<T> {
            return util.sortedMerge(readables.map(r => r.read(range)), ([ka,], [kb,]) => util.lexCompare(ka, kb))
        }
    }
}

export async function get<T, D>(source: Readable<T>, key: Key, def: D): Promise<T | D> {
    for await (const [, value] of source.read(ranges.singleValue(key))) {
        return value
    }
    return def
}

export async function getOption<T, D>(source: Readable<T>, key: Key): Promise<util.Option<T>> {
    for await (const [, value] of source.read(ranges.singleValue(key))) {
        return util.option.some(value)
    }
    return util.option.none()
}

export async function getOrDefault<T>(source: Readable<T>, key: Key, def: T): Promise<util.Defaultable<T>> {
    return util.option.from(await getOption(source, key)).with_default(() => def);
}

export function readAll<T>(source: Readable<T>): ItemIterable<T> {
    return source.read(ranges.unbounded(source.schema.map(_ => '')));
}

export function readAllAfter<T>(source: Readable<T>, startAfter: Key): ItemIterable<T> {
    return source.read(ranges.unbounded(ranges.keySuccessor(startAfter)))
}

export function tracked<T>(source: Readable<Live<T>>, cb: (actionId: string) => void): Readable<T> {
    return {
        schema: source.schema,
        read(range: Range): ItemIterable<T> {
            const links = ixa.from(source.read(range))
            return links.pipe(
                ixaop.tap(([, { actionId }]) => cb(actionId)),
                ixaop.flatMap(([key, { value }]: Item<Live<T>>): ItemIterable<T> =>
                    value !== null ? ixa.of([key, value]) : ixa.empty())
            )
        }
    }
}


// export class Tape<T> implements Readable<T> {
//     public items: Item<T>[] = []

//     constructor(private source: Readable<T>) { }

//     get schema(): string[] {
//         return this.source.schema
//     }

//     read(range: Range): ItemIterable<T> {
//         return ixa.from(this.source.read(range))
//             .pipe(ixaop.tap(item => this.items.push(item)))
//     }
// }
