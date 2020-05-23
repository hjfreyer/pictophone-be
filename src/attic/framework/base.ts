import { Timestamp } from '@google-cloud/firestore'
import { Readable, Change } from '../flow/base'

export { Diff, Change, Item } from '../flow/base'


// export interface Readable<T> {
//     schema: string[]
//     sortedList(startAt: string[]): AsyncIterable<Item<T>>
// }

// export type Readables<Spec> = {
//     [K in keyof Spec]: Readable<Spec[K]>
// }


export interface Writeable<T> {
    commit(changes: Change<T>[]): void
}

export interface ReadWrite<T> extends Readable<T>, Writeable<T> { }

export interface Database<Spec> {

}
