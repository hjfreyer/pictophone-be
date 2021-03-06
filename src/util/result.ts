import { Option } from "./option"
import * as option from "./option";

export type AsyncResult<R, E> = Promise<Result<R, E>>

export type ResultData<R, E> = {
    status: 'ok',
    value: R,
} | {
    status: 'err'
    error: E
}

export type Result<R, E> = {
    data: ResultData<R, E>
}

export class ResultView<R, E> implements Result<R, E>{
    constructor(public data: ResultData<R, E>) { }

    orElse<D>(def: () => D): R | D {
        if (this.data.status === 'ok') {
            return this.data.value
        } else {
            return def()
        }
    }

    errOrElse<D>(def: () => D): E | D {
        if (this.data.status === 'err') {
            return this.data.error
        } else {
            return def()
        }
    }

    unwrap(): R {
        if (this.data.status === 'err') {
            throw this.data.error
        }
        return this.data.value
    }

    map<O>(fn: (r: R) => O): ResultView<O, E> {
        if (this.data.status === 'err') {
            return fromData(this.data)
        } else {
            return ok(fn(this.data.value))
        }
    }

    mapErr<O>(fn: (r: E) => O): ResultView<R, O> {
        return this.split({
            onErr: (e) => err(fn(e)),
            onOk: (r) => ok(r),
        })
    }

    split<TResult>({ onOk, onErr }: { onOk: (t: R) => TResult, onErr: (e: E) => TResult }): TResult {
        if (this.data.status === 'ok') {
            return onOk(this.data.value)
        } else {
            return onErr(this.data.error)
        }
    }

    get err(): option.OptionView<E> {
        return this.split({
            onErr: e => option.some(e),
            onOk: () => option.none(),
        })
    }

    get value(): option.OptionView<R> {
        return this.split({
            onErr: () => option.none(),
            onOk: (v) => option.some(v),
        })
    }
}

export function from<R, E>(r: Result<R, E>): ResultView<R, E> {
    return new ResultView(r.data)
}

export function fromData<R, E>(r: ResultData<R, E>): ResultView<R, E> {
    return new ResultView(r)
}

export function ok<R, E>(r: R): ResultView<R, E> {
    return fromData({ status: 'ok', value: r })
}

export function err<R, E>(e: E): ResultView<R, E> {
    return fromData({ status: 'err', error: e })
}
