import Action from './Action'
import State from './State'
import Export from './Export'

export { integrate, exportState, getKey, initState } from './logic'

export type Index = {
    Action: Action,
    State: State,
    Export: Export
}

export const VERSION: Action['version'] = 'v1.0'