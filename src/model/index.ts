
import {Index as v1_0} from './v1.0'
import {Index as v1_1} from './v1.1'

type AnyIndex = v1_0 | v1_1

export type AnyAction = AnyIndex['Action']
export type AnyState = AnyIndex['State']
export type AnyExport = AnyIndex['Export']