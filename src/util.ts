
export function mapValues<V1, V2>(obj: { [k: string]: V1 },
    fn: (k: string, v: V1) => V2): { [k: string]: V2 } {
    return Object.assign({}, ...Object.entries(obj).map(([k, v]) => {
        return { [k]: fn(k, v) }
    }))
}
export type Maybe<V> = { result: 'some', value: V } | { result: 'none' }

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

export function keyStartsWith(key: string[], prefix: string[]): boolean {
    if (key.length < prefix.length) {
        return false
    }
    for (let i = 0; i < prefix.length; i++) {
        if (key[i] !== prefix[i]) {
            return false
        }
    }
    return true
}

export async function* toStream<T>(v: T[]): AsyncIterable<T> {
    yield* v
}

export async function toArray<T>(v: AsyncIterable<T>): Promise<T[]> {
    const res: T[] = []
    for await (const i of v) {
        res.push(i)
    }
    return res
}

export async function* streamTakeWhile<T>(
    stream: AsyncIterable<T>,
    pred: (t: T) => boolean): AsyncIterable<T> {
    for await (const t of stream) {
        if (!pred(t)) {
            return
        }
        yield t
    }
}

export async function* batchStreamBy<T, K>(
    stream: AsyncIterable<T>,
    extractor: (t: T) => K,
    cmp: (a: K, t: K) => number): AsyncIterable<[K, T[]]> {
    const iter = stream[Symbol.asyncIterator]()
    for (let entry = await iter.next(); !entry.done;) {
        const batchKey = extractor(entry.value)
        const batch: T[] = []

        for (; !entry.done; entry = await iter.next()) {
            const entryKey = extractor(entry.value)
            if (cmp(entryKey, batchKey) < 0) {
                // entryKey < batchKey
                throw new Error("stream not sorted")
            }
            if (cmp(entryKey, batchKey) === 0) {
                // entryKey === batchKey
                batch.push(entry.value)
            }
            if (cmp(entryKey, batchKey) > 0) {
                // entryKey > batchKey
                break
            }
        }

        yield [batchKey, batch]
    }
}