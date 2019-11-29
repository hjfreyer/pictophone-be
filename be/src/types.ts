
import State from './model/State'
import { ExportVersion } from './model/base'

type ExportState = 'NOT_EXPORTED' | 'EXPORTED' | 'DIRTY'

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

