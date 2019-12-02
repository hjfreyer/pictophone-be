import { ExportVersion } from './base'
import Export0 from './Export0'
import Export1_0_0 from './Export1_0_0'

export type ExportByVersion<V extends ExportVersion> =
    V extends '0' ? Export0 :
    V extends 'v1.0.0' ? Export1_0_0 :
    never

export type ExportMap = {
    [V in ExportVersion]: ExportByVersion<V>
}

export type Export = ExportByVersion<ExportVersion>

export default Export
