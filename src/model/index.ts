// Base

import { Action as Action1_0, Error as Error1_0 } from './1.0'
import { Action as Action1_1, Error as Error1_1 } from './1.1'
import { Action as Action1_2, Error as Error1_2 } from './1.2'

export type AnyAction = {
    version: '1.0'
    action: Action1_0
} | {
    version: '1.1'
    action: Action1_1
}
export type AnyError = Error1_0 | Error1_1

export type SavedAction = {
    version: '1.0'
    action: Action1_0
    parents: Record<string, ReferenceGroup>
} | {
    version: '1.1'
    action: Action1_1
    parents: Record<string, ReferenceGroup>
    // } | {
    //     version: '1.2'
    //     action: Action1_2
    //     parents: Record<string, ReferenceGroup>    
}

export type ReferenceGroup = {
    kind: 'single'
    actionId: string
} | {
    kind: 'collection'
    id: string
    members: Record<string, ReferenceGroup>
} | {
    kind: 'none'
}

export interface Pointer {
    actionId: string
}
