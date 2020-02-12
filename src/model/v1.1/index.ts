import Action from './Action'
import State from './State'
import Export from './Export'

export {Action} from './Action'
export {State} from './State'
export {Export} from './Export'
export { UpgradeStateMapper, exportStateEnumerable, exportStateReactive ,
exportState2Enumerable, exportState2Reactive } from './logic'

export type Index = {
    Action: Action,
    State: State,
    Export: Export
}

export const VERSION: (Action['version'] & State['version'] & Export['version']) = 'v1.1'