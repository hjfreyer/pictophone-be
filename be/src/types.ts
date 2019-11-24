
import { StateMap } from './model/State'

// Internal data structures.
export type StateEntry = {
    iteration: number
    minVersion: number
    maxVersion: number
    lastModified: any
    versions: Partial<StateMap>
}
