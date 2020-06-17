
import * as defaultable from './defaultable';

export type OptionData<T> = {
    some: true
    value: T
} | {
    some: false
}

export interface Option<T> {
    data: OptionData<T>
}

export function from<T>(o: Option<T>): OptionView<T> {
    return new OptionView(o)
}

export function fromData<T>(data: OptionData<T>): OptionView<T> {
    return new OptionView({ data })
}

export function some<T>(r: T): OptionView<T> {
    return fromData({ some: true, value: r })
}

export function none<T>(): OptionView<T> {
    return fromData({ some: false })
}

export class OptionView<T> implements Option<T> {
    data: OptionData<T>

    constructor(o: Option<T>) { this.data = o.data }

    unwrap(): T {
        if (this.data.some) {
            return this.data.value
        } else {
            throw new Error("option unwrapped without value")
        }
    }

    orElse<D>(def: () => D): T | D {
        if (this.data.some) {
            return this.data.value
        } else {
            return def()
        }
    }

    withDefault<D>(def: () => T): defaultable.DefaultableView<T> {
        if (this.data.some) {
            return defaultable.some(this.data.value)
        } else {
            return defaultable.none(def())
        }
    }

    map<O>(fn: (a: T) => O): OptionView<O> {
        if (this.data.some) {
            return some(fn(this.data.value))
        } else {
            return fromData(this.data)
        }
    }

    async mapAsync<O>(fn: (a: T) => Promise<O>): Promise<OptionView<O>> {
        if (this.data.some) {
            return some(await fn(this.data.value))
        } else {
            return fromData(this.data)
        }
    }

    andThen<O>(fn: (a: T) => Option<O>): OptionView<O> {
        if (this.data.some) {
            return from(fn(this.data.value))
        } else {
            return fromData(this.data)
        }
    }

    async andThenAsync<O>(fn: (a: T) => Promise<Option<O>>): Promise<OptionView<O>> {
        if (this.data.some) {
            return from(await fn(this.data.value))
        } else {
            return fromData(this.data)
        }
    }

    split<S, N>({ onSome, onNone }: { onSome: (t: T) => S, onNone: () => N }): S | N {
        if (this.data.some) {
            return onSome(this.data.value)
        } else {
            return onNone()
        }
    }
}
