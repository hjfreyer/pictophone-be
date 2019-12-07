
import State from './model/AnyState'

export type ExportState = 'NOT_EXPORTED' | 'EXPORTED' | 'DIRTY'

export type ExportStateMap = {
    [version: string]: ExportState
}

// Internal data structures.
export type StateEntry = {
    generation: number
    iteration: number
    lastModified: any

    state: State
    exports: ExportStateMap
}

