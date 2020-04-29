
export type Item<V> = [string[], V]

export type Diff<V> = {
    key: string[]
    kind: 'add' | 'delete'
    value: V
} | {
    key: string[]
    kind: 'replace'
    oldValue: V
    newValue: V
}

export interface Readable<T> {
    sortedList(startAt: string[]): AsyncIterable<Item<T>>
}

export interface Writeable<T> {
    commit(diffs : Diff<T>[]): void
}

export interface ReadWrite<T> extends Readable<T>, Writeable<T> {} 


// export type CollectionSet<TypeSpec> = {
//     [K in keyof TypeSpec]: 
// }