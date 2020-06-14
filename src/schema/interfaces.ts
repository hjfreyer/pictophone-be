// DON'T EDIT THIS FILE, IT IS AUTO GENERATED

import { Diff } from '../interfaces'

export type CollectionId = "1.1.1";

// export type IOSpec = {
//     "1.1.1": {
//         live: {
//             games: import('../model/1.1.1').Game
//             gamesByPlayer1_1: import('../model/1.1').PlayerGame
//             gamesByPlayer1_0: import('../model/1.0').PlayerGame
//         }
//         exports: {
//             gamesByPlayer1_1: import('../model/1.1').PlayerGame
//             gamesByPlayer1_0: import('../model/1.0').PlayerGame
//         }
//     }
// }

// export type Outputs = {
//     [C in CollectionId]: {
//         [T in keyof IOSpec[C]['live']]: Diff<IOSpec[C]['live'][T]>[]
//     }
// }


export type Outputs = {
    '1.1.1':{
            private: {
                games: Diff<import('../model/1.1.1').Game>[]
            }
            '1.0': {
                error: import('../model/1.0').Error | null
                tables: {
                    gamesByPlayer: Diff<import('../model/1.0').PlayerGame>[]
                }
            }
            '1.1': {
                error: import('../model/1.1').Error | null
                tables: {
                    gamesByPlayer: Diff<import('../model/1.1').PlayerGame>[]
                }
            }
        }
}


export type Metadata = {
[K in keyof Outputs]: {
        outputs: Outputs[K]
    }
}
export type Metadata1_1_1 = Metadata["1.1.1"]

export type AnyAction = import('../model/1.0').Action | import('../model/1.1').Action
export type AnyError = import('../model/1.0').Error | import('../model/1.1').Error

export type SavedAction = {
    parents: string[]
    action: AnyAction
}

export interface LiveUnknown {
    actionId: string
    value: unknown
}

export interface Reference {
    actionId: string
}