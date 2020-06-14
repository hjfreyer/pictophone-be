
export interface Defaultable<T> {
    is_default: boolean
    value: T
}

export function of<T>(value: T | null, def: T): DefaultableView<T> {
    return from({
        is_default: value === null,
        value: value === null ? def : value,
    })
}

export function from<R>(data: Defaultable<R>): DefaultableView<R> {
    return new DefaultableView(data)
}

export function some<T>(value: T): DefaultableView<T> {
    return from({
        is_default: false,
        value,
    })
}

export function none<T>(def: T): DefaultableView<T> {
    return from({
        is_default: true,
        value: def,
    })
}

export class DefaultableView<T> implements Defaultable<T> {
    is_default: boolean
    value: T

    constructor(d: Defaultable<T>) {
        this.is_default = d.is_default;
        this.value = d.value;
    }

    get(): T {
        return this.value
    }

    or_null(): T | null {
        return this.is_default ? null : this.value
    }
}
