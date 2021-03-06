
export type Key = string[]

export interface Item<T> {
    key: Key,
    value: T,
}

export function item<T>(key: Key, value: T): Item<T> {
    return { key, value }
}

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

export type Change<V> = {
    key: string[]
    kind: 'set'
    value: V
} | {
    key: string[]
    kind: 'delete'
}

export interface Live<T> {
    actionId: string
    value: T | null
}
