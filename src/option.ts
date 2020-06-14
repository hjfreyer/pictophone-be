
export type Option<R> = {
    some: true,
    value: R
} | {
    some: false
}

export function from<R>(data : Option<R>): OptionView<R> {
    return new OptionView(data)
}

export function some<R>(r: R): OptionView<R> {
    return new OptionView({ some: true, value: r })
}

export function none<R>(): OptionView<R> {
    return new OptionView({ some: false })
}

export class OptionView<R> {
    constructor(public data : Option<R>) {}

    or_else(def : () => D): R | D {
    if (o.some) {
        return o.value
    } else {
        return def()
    }
}

map<A, B>(fn: (a: A)=>B): Option<B> {
    if (o.some) {
        return some(fn(o.value))
    } else {
        return o
    }
}
}
