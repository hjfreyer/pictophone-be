
export type Key = string[]

export type Item<T> = [Key, T]

export type ItemIterable<T> = AsyncIterable<Item<T>>

export type Range = {
    kind: 'bounded'
    start: Key
    end: Key
} | {
    kind: 'unbounded'
    start: Key
}

export interface Readable<T> {
    schema: string[]
    read(range: Range): ItemIterable<T>
}

export type Diff<V> = {
    key: string[]
    kind: 'add'
    value: V
} | {
    key: string[]
    kind: 'delete'
    value: V
} | {
    key: string[]
    kind: 'replace'
    oldValue: V
    newValue: V
}
