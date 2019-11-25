
import State from './model/State'

// Internal data structures.
export type StateEntry = {
    generation: number
    iteration: number
    lastModified: any

    state: State
}
