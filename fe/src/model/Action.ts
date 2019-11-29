import Action0 from './Action0';
import { ActionVersion } from './base';

export type ActionByVersion<Ver extends ActionVersion> =
    Ver extends 0 ? Action0
    : never

export type ActionMap = {
    [V in ActionVersion]: ActionByVersion<V>
}

export type Action = ActionByVersion<ActionVersion>

export default Action