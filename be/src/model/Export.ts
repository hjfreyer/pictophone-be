import Export0 from './Export0'
import Export1_0_0 from './Export1_0_0'
import Export1_1_0 from './Export1_1_0'

export type Export = Export0 | Export1_0_0 | Export1_1_0

export type Version = Export['version']

export const VERSIONS: Version[] = ['0', 'v1.0.0', 'v1.1.0']

export default Export
