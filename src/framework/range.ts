
export type Bound<T> = {
    kind: 'inclusive' | 'exclusive' ,//| 'successor_exclusive',
    value : T,
} | {
    kind: 'unbounded'
}

export interface Range<T> {
    start: Bound<T>
    end: Bound<T>
}