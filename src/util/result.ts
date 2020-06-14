
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

export class ResultView<R, E> {
    constructor(public data : ResultData<R,E>) {}

or_else<D>(def: () => D): R | D {
    if (this.data.status === 'ok') {
        return this.data.value
    } else {
        return def()
    }
}

err_or_else<D>(def: () => D): E | D {
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