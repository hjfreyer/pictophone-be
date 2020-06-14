
import * as defaultable from './defaultable';

export type OptionData<R> = {
    some: true
    value: R
} | {
    some: false
}

export interface Option<R> {
    data: OptionData<R>
}

export function from<R>(o: Option<R>): OptionView<R> {
    return new OptionView(o)
}

export function fromData<R>(data: OptionData<R>): OptionView<R> {
    return new OptionView({ data })
}

export function some<R>(r: R): OptionView<R> {
    return fromData({ some: true, value: r })
}

export function none<R>(): OptionView<R> {
    return fromData({ some: false })
}

export class OptionView<R> implements Option<R> {
    data: OptionData<R>

    constructor(o: Option<R>) { this.data = o.data }

    or_else<D>(def: () => D): R | D {
        if (this.data.some) {
            return this.data.value
        } else {
            return def()
        }
    }

    with_default<D>(def: () => R): defaultable.DefaultableView<R> {
        if (this.data.some) {
            return defaultable.some(this.data.value)
        } else {
            return defaultable.none(def())
        }
    }

    map<O>(fn: (a: R) => O): OptionView<O> {
        if (this.data.some) {
            return some(fn(this.data.value))
        } else {
            return fromData(this.data)
        }
    }
}
