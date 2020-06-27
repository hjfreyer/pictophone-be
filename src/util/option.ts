
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

export function of<T>(t: T | null | undefined): OptionView<T> {
    if (t === null || t === undefined) {
        return none()
    } else {
        return some(t)
    }
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

    expect(msg: string): T {
        if (this.data.some) {
            return this.data.value
        } else {
            throw new Error("expected option to be some: " + msg)
        }
    }

    orElse(def: () => T): T {
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

    and<O>(other: Option<O>): OptionView<[T, O]> {
        return this.andThen(a => from(other).map(b => [a, b]))
    }

    filter(pred: (t: T) => boolean): OptionView<T> {
        return this.split({
            onNone: () => none(),
            onSome: (t) => {
                if (pred(t)) {
                    return some(t)
                } else {
                    return none()
                }
            }
        })
    }

    narrow<U extends T>(pred: (t: T) => t is U): OptionView<U> {
        return this.split({
            onNone: () => none(),
            onSome: (t) => {
                if (pred(t)) {
                    return some(t)
                } else {
                    return none()
                }
            }
        })
    }
}

export function fromIterable<T>(iter: Iterable<T>): Option<T> {
    let res = none<T>();
    for (const item of iter) {
        if (res.data.some) {
            throw new Error("Iterable had more than 1 item")
        }
        res = some(item)
    }
    return res
}

export async function fromAsyncIterable<T>(iter: AsyncIterable<T>): Promise<Option<T>> {
    let res = none<T>();
    for await (const item of iter) {
        if (res.data.some) {
            throw new Error("Iterable had more than 1 item")
        }
        res = some(item)
    }
    return res
}
