import Export0 from './v0/Export'
import Export1_0_0 from './v1.0.0/Export'
import Export1_1_0 from './v1.1.0/Export'
import Export1_2_0 from './v1.2.0/Export'

export type AnyExport = Export0 | Export1_0_0 | Export1_1_0 | Export1_2_0

export type Version = AnyExport['version']

export const VERSIONS: Version[] = ['0', 'v1.0.0', 'v1.1.0', 'v1.2.0']

export default AnyExport
