

export Data = DocumentData

export interface Source<T> {
    sortedList(startAt: string[]): AsyncIterable<Item<T>>
}

type Sourcify<T> = {
    [K in keyof T]: Source<T>
}

export interface Collection<Action, Inputs, Output> {
    list(startAt: string[]): AsyncIterable<Item<Output>>

    react()
}