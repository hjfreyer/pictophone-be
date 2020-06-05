// DON'T EDIT THIS FILE, IT IS AUTO GENERATED

import * as model from '../model'
import { Diff } from '../interfaces'

export type CollectionId = keyof IOSpec;

export type IOSpec = {
    "1.1.1": {
        live: {
            games: model.Game1_1
            gamesByPlayer1_1: model.PlayerGame1_1
            gamesByPlayer1_0: model.PlayerGame1_0
        }
        exports: {
            gamesByPlayer1_1: model.PlayerGame1_1
            gamesByPlayer1_0: model.PlayerGame1_0
        }
    }
}

export type Outputs = {
    [C in CollectionId]: {
        [T in keyof IOSpec[C]['live']]: Diff<IOSpec[C]['live'][T]>[]
    }
}

export type Metadata = {
    [K in keyof Outputs]: {
        outputs: Outputs[K]
    }
}
export type Metadata1_1_1 = Metadata["1.1.1"]
