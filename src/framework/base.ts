import { Timestamp } from '@google-cloud/firestore'
import { Readable } from '../flow/base'

export type Item<V> = [string[], V]

export type Change<V> = {
    key: string[]
    kind: 'set'
    value: V
} | {
    key: string[]
    kind: 'delete'
}

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

// export interface Readable<T> {
//     schema: string[]
//     sortedList(startAt: string[]): AsyncIterable<Item<T>>
// }

// export type Readables<Spec> = {
//     [K in keyof Spec]: Readable<Spec[K]>
// }


export interface Writeable<T> {
    commit(changes : Change<T>[]): void
}

export interface ReadWrite<T> extends Readable<T>, Writeable<T> {} 

export interface Database<Spec> {
    
}
