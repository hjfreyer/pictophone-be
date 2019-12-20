
import {AnyState, ExportStateMap} from './model'

// Internal data structures.
export type StateEntry = {
    generation: number
    iteration: number
    lastModified: any

    state: AnyState
    exports: ExportStateMap
}

