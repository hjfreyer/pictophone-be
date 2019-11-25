import Action0 from './Action0';
import { Version } from './base';

export type ActionVersion<Ver extends Version> =
    Ver extends 0 ? Action0
    : never

export type ActionMap = {
    [V in Version]: ActionVersion<V>
}

export type Action = ActionVersion<Version>

export default Action