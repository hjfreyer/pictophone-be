
import {Index as v1_0} from './v1.0'
import {Index as v1_1} from './v1.1'

import { validate as validateModel } from './index.validator'

type Indexes = {
    'v1.0': v1_0
    'v1.1': v1_1
}

type AnyVersion = keyof Indexes
type AnyKind = keyof Indexes[AnyVersion]

export default function validator(v: 'v1.0', k: 'Action'): (u: unknown) => Indexes['v1.0']['Action'];
export default function validator(v: 'v1.0', k: 'State'): (u: unknown) => Indexes['v1.0']['State'];
export default function validator(v: 'v1.0', k: 'Export'): (u: unknown) => Indexes['v1.0']['Export'];
export default function validator(v: 'v1.1', k: 'Action'): (u: unknown) => Indexes['v1.1']['Action'];
export default function validator(v: 'v1.1', k: 'State'): (u: unknown) => Indexes['v1.1']['State'];
export default function validator(v: 'v1.1', k: 'Export'): (u: unknown) => Indexes['v1.1']['Export'];
export default function validator(v: AnyVersion, k: AnyKind): (u: unknown) => Indexes[AnyVersion][AnyKind] {
    return (u: unknown) => {
        switch (k) {
            case 'Action': {
                const s = validateModel('AnyAction')(u)
                if (s.version !== v) { throw new Error('bad version') }
                return s
            }
            case 'State': {
                const s = validateModel('AnyState')(u)
                if (s.version !== v) { throw new Error('bad version') }
                return s
            }
            case 'Export': {
                const s = validateModel('AnyExport')(u)
                if (s.version !== v) { throw new Error('bad version') }
                return s
            }
        }
    }
}