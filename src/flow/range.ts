
import _ from 'lodash';

export type Bound<T> = {
    kind: 'inclusive' | 'exclusive',
    value: T,
} | {
    kind: 'unbounded'
}

export interface Range<T> {
    start: Bound<T>
    end: Bound<T>
}

export function singleValue<T>(value : T): Range<T> {
    return {
        start: {kind: 'inclusive', value},
        end: {kind: 'inclusive', value},
    };
}

// export function compareBounds<T>(a : Range<T>, b:Range<T>, cmp: (a:T, b:T)=> number):boolean {

// }


export function isEmpty<T>({start, end} : Range<T>, cmp: (a:T, b:T)=> number):boolean {
    if (start.kind === 'unbounded' || end.kind === 'unbounded') {
        return false;
    }
    const c = cmp(start.value, end.value);
    if (c === 0) {
        return start.kind === 'exclusive' || end.kind === 'exclusive';
    }
    return c > 0;
}

export function isInfinite<T>({start, end} : Range<T>):boolean {
    return start.kind === 'unbounded' && end.kind === 'unbounded'
}

// export function overlap<T>(a : Range<T>, b:Range<T>, cmp: (a:T, b:T)=> number):boolean {
//     if (a.start.kind === 'unbounded')
// }

// export function collapse<T>(ranges : Range<T>[], cmp: (a:T, b:T)=> number): Range<T>[] {
//     const classes = ranges.map((_, idx) => idx);
//     for (let i = 0; i < ranges.length; i++) {
//     for (let j = i+1; j < ranges.length; j++) {

//     }    
//     }
// }