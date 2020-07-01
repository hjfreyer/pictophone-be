// Base

import { VersionSpec } from './base';
import { Action as Action1_0 } from './1.0'
import { Action as Action1_1 } from './1.1'
import { Action as Action1_2 } from './1.2'

export type AnyAction = {
    version: '1.0'
    action: Action1_0
} | {
    version: '1.1'
    action: Action1_1
    // } | {
    //     version: '1.2'
    //     action: Action1_2
}

export type SavedAction = AnyAction & { parents: VersionSpec }
