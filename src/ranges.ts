
import _ from 'lodash';
import { lexCompare } from './util';
import { Key, Range } from './interfaces';

// For a key K of length N, returns the first N-length key J after it. That is,
// the unique key J such that N < J and there are no N-length keys between them.
export function keySuccessor(k: Key): Key {
    return [...k.slice(0, k.length - 1), stringSuccessor(k[k.length - 1])]
}

function stringSuccessor(s: string): string {
    return s + '\0';
}


export function singleValue(value: Key): Range {
    return {
        kind: 'bounded',
        start: value,
        end: keySuccessor(value),
    };
}

export function unbounded(start: Key): Range {
    return {
        kind: 'unbounded',
        start,
    };
}


// export function isSingleValue(r: Range): Option<Key> {
//     if (r.kind === 'unbounded') {
//         return none()
//     }
//     if (lexCompare(keySuccessor(r.start), r.end) !== 0) {
//         return none()
//     }
//     return some(r.start);
// }


// // export function compareBounds<Key>(a : Range, b:Range, cmp: (a:Key, b:Key)=> number):boolean {

// // }


// export function isEmpty(r: Range): boolean {
//     if (r.kind === 'unbounded') {
//         return false;
//     }
//     return lexCompare(r.end, r.start) <= 0;
// }

// // export function everything(): Range {
// //     return { start: { kind: 'unbounded' }, end: { kind: 'unbounded' } }
// // }

// // export function isEverything({ start, end }: Range): boolean {
// //     return start.kind === 'unbounded' && end.kind === 'unbounded'
// // }

export function contains(range: Range, point: Key): boolean {
    if (lexCompare(point, range.start) < 0) {
        return false;
    }
    return range.kind === 'unbounded' || (lexCompare(point, range.end) < 0);
}


// export function rangeContainsRange(outer: Range, inner: Range): boolean {
//     if (lexCompare(inner.start, outer.start) < 0) {
//         return false;
//     }
//     return outer.kind === 'unbounded' || (inner.kind === 'bounded' && lexCompare(inner.end, outer.end) <= 0);
// }


// export function compareRangeEndpoints(a: Range, b: Range): number {
//     if (a.kind === 'unbounded') {
//         return b.kind === 'unbounded' ? 0 : 1;
//     } else {
//         return b.kind === 'unbounded' ? -1 : lexCompare(a.end, b.end);
//     }
// }



// export function overlap<Key>(a : Range, b:Range, cmp: (a:Key, b:Key)=> number):boolean {
//     if (a.start.kind === 'unbounded')
// }

// export function collapse<Key>(ranges : Range[], cmp: (a:Key, b:Key)=> number): Range[] {
//     const classes = ranges.map((_, idx) => idx);
//     for (let i = 0; i < ranges.length; i++) {
//     for (let j = i+1; j < ranges.length; j++) {

//     }    
//     }
// }
