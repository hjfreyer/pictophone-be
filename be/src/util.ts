
export function mapValues<V1, V2>(obj: { [k: string]: V1 },
    fn: (k: string, v: V1) => V2): { [k: string]: V2 } {
    return Object.assign({}, ...Object.entries(obj).map(([k, v]) => {
        return { [k]: fn(k, v) }
    }))
}
