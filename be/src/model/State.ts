import { Version } from './base';
import State0 from './State0';

export type StateVersion<V extends Version> =
    V extends 0 ? State0
    : never

export type StateMap = {
    [V in Version]: StateVersion<V>
}

export type State = {
    [V in Version]: StateVersion<V> & { version: V }
}[Version];

export default State
