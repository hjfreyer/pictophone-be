
import _ from 'lodash';
import {Comparator, Option, none, some} from './util';


export interface Comparable<T> {
    compareTo(other: T): number
}

export type Bound<T extends Comparable<T>> = {
    kind: 'inclusive' | 'exclusive',
    value: T,
} | {
    kind: 'unbounded'
}

export interface Range<T extends Comparable<T>> {
    start: Bound<T>
    end: Bound<T>
}

export function singleValue<T extends Comparable<T>>(value : T): Range<T> {
    return {
        start: {kind: 'inclusive', value},
        end: {kind: 'inclusive', value},
    };
}


export function isSingleValue<T extends Comparable<T>>(r : Range<T>): Option<T> {
    if (r.start.kind != 'inclusive' || r.end.kind != 'inclusive') {
        return none()
    }
    if (r.start.value.compareTo(r.end.value) !== 0) {
        return none()
    }
    return some(r.start.value);
}


// export function compareBounds<T>(a : Range<T>, b:Range<T>, cmp: (a:T, b:T)=> number):boolean {

// }


export function isEmpty<T extends Comparable<T>>({start, end} : Range<T>):boolean {
    if (start.kind === 'unbounded' || end.kind === 'unbounded') {
        return false;
    }
    const c = start.value.compareTo(end.value);
    if (c === 0) {
        return start.kind === 'exclusive' || end.kind === 'exclusive';
    }
    return c > 0;
}

export function everything<T extends Comparable<T>>(): Range<T> {
    return {start: {kind: 'unbounded'}, end: {kind: 'unbounded'}}
}

export function isEverything<T extends Comparable<T>>({start, end} : Range<T>):boolean {
    return start.kind === 'unbounded' && end.kind === 'unbounded'
}

export function rangeContains<T extends Comparable<T>>({start, end} : Range<T>, point: T):boolean {
    const afterStart = (() => {
  switch (start.kind) {
            case 'unbounded':
            return true;
            case 'exclusive':
            return start.value.compareTo(point) < 0
            case 'inclusive':
            return start.value.compareTo(point) <= 0
        }
    })();   
    const beforeEnd = (() => {
  switch (end.kind) {
            case 'unbounded':
            return true;
            case 'exclusive':
            return end.value.compareTo(point) > 0
            case 'inclusive':
            return end.value.compareTo(point) >= 0
        }
    })();
    return afterStart && beforeEnd;
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