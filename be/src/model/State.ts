import { ActionVersion } from './base';
import State0 from './State0';

export type StateByVersion<V extends ActionVersion> =
    V extends 0 ? State0
    : never

export type StateMap = {
    [V in ActionVersion]: StateByVersion<V>
}

export type State = StateByVersion<ActionVersion>

export default State
