
// import {Range} from './range';
// import { Item } from './base';

// type DocumentData = { [field: string]: any };

// // type Item = [string[], DocumentData];

// // export type Diff = {
// //     key: string[]
// //     kind: 'add' | 'delete'
// //     value: DocumentData
// // } | {
// //     key: string[]
// //     kind: 'replace'
// //     oldValue: DocumentData
// //     newValue: DocumentData
// // }

// export interface Database {
//     sortedList(spaceId: string, startAt: string[]):  AsyncIterable<Item>;
//     applyDiffs(spaceId: string, diff:Diff[]): void;
// }


// type Cursor = AsyncIterable<Item<DocumentData>>

// export interface Dataspace {
//     inputs: string[],
//     rewindBeforeInput(inputStart: string[]): string[]
//     transform(sortedInput: Cursor): Cursor
// }
