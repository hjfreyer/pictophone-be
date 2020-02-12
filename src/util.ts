
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

    for (let i = 0; i < a.length; i++ ) {
        const cmp = a[i].localeCompare(b[i])
        if (cmp !== 0) {
            return cmp
        }
    }
    return 0
}