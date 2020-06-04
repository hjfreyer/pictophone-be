
import * as model from '../model'
import { Diff, ItemIterable, Live, Range, Readable } from '../interfaces'

export type CollectionId = '1.0.0' | '1.0.1' | '1.0.2';

export type SideInputs = {
    '1.0.0': {
        games: Readable<model.Game1_0>
    },
    '1.0.1': {
        games: Readable<model.Game1_0>
        gamesByPlayer: Readable<model.PlayerGame1_0>
    },
    '1.0.2': {
        games: Readable<model.Game1_0>
        gamesByPlayer: Readable<model.PlayerGame1_0>
    },
}

export type Outputs = {
    '1.0.0': {
        games: Diff<model.Game1_0>[]
    },
    '1.0.1': {
        games: Diff<model.Game1_0>[]
        gamesByPlayer: Diff<model.PlayerGame1_0>[]
    },
    '1.0.2': {
        games: Diff<model.Game1_0>[]
        gamesByPlayer: Diff<model.PlayerGame1_0>[]
    },
}

export type Metadata = {
    [K in keyof Outputs]: {
        outputs: Outputs[K]
    }
}

export type Metadata1_0_0 = Metadata['1.0.0']
export type Metadata1_0_1 = Metadata['1.0.1']
export type Metadata1_0_2 = Metadata['1.0.2']
