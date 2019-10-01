
import * as log from './log'
import { validate } from './log.validator'

export type Config = {
    braids: { [id: string]: BraidConfig }
}

export type BraidConfig = {
    keyFunction: (action: string) => string[]
    mounts: { [mountId: string]: MountFn }
    mountOrder: string[]
}

export type StrandMap = { [strandId: string]: string }

export type Export = log.Export

export type MountFn = MapFn | ReduceFn

export type MapFn = {
    op: 'map'
    input: string
    fn: (state: StrandMap) => StrandMap
}

export type ReduceFn = {
    op: 'reduce'
    input: string
    fn: (acc: StrandMap, action: StrandMap) => StrandMap
}

export function applyAction(c: Config, db: FirebaseFirestore.Firestore, action: string): Promise<void> {
    return db.runTransaction(async (tx: FirebaseFirestore.Transaction): Promise<void> => {
        return await new Helper(c, db, tx).applyActionTransaction(action)
    });
}

type Output = {
    [strandId: string]: RowOutput
}

type RowOutput = {
    [mountId: string]: string
}

class Helper {

    constructor(
        private c: Config,
        private db: FirebaseFirestore.Firestore,
        private tx: FirebaseFirestore.Transaction) { }

    async applyActionTransaction(action: string): Promise<void> {
        const braidId = 'root'
        const braid = this.c.braids[braidId]

        // Determine the strands the action affects.
        const strandIds = braid.keyFunction(action)

        // Look up the current row count for each strand.
        const strandMetas: { [strandId: string]: log.Strand } = {}
        const rowAddrs: { [strandId: string]: log.RowAddr } = {}
        for (const strandId of strandIds) {
            strandMetas[strandId] = await this.getStrand({ braidId, strandId })
            rowAddrs[strandId] = {
                braidId,
                strandId,
                rowIdx: strandMetas[strandId].sourceCount
            }
        }

        const output: Output = {}

        // Seed output with the input.
        for (const strandId in strandMetas) {
            output[strandId] = {
                source: action
            }
        }

        // Compute all the mounts that we can.
        for (const mountId of braid.mountOrder) {
            const mount = braid.mounts[mountId]

            switch (mount.op) {
                case 'map':
                    this.applyMap(mountId, mount, output);
                    break;

                case 'reduce':
                    await this.applyReduce(braidId, strandMetas, mountId, mount, output)
                    break
            }
        }

        // Commit all the changes.
        for (const strandId in output) {
            const strandMeta = strandMetas[strandId]
            const strandMounts = output[strandId]
            strandMeta.sourceCount++

            for (const mountId in strandMounts) {
                if (mountId !== 'source') {
                    strandMeta.mountCounts[mountId] = strandMeta.sourceCount
                    this.setMount({ ...rowAddrs[strandId], mountId }, {
                        content: strandMounts[mountId]
                    })
                }
            }
            this.setRow(rowAddrs[strandId], {
                aliases: Object.values(rowAddrs),
                source: strandMounts['source']
            })
            this.setStrand({ braidId, strandId }, strandMeta)
        }
    }

    // DPL

    // - Braid
    braidRef(addr: log.BraidAddr): FirebaseFirestore.DocumentReference {
        return this.db.collection('braids').doc(addr.braidId)
    }

    // - Strand
    strandRef(addr: log.StrandAddr): FirebaseFirestore.DocumentReference {
        return this.braidRef(addr).collection('strands').doc(addr.strandId)
    }

    async getStrand(addr: log.StrandAddr): Promise<log.Strand> {
        const doc = await this.tx.get(this.strandRef(addr))
        return doc.exists ? validate('Strand')(doc.data()) : log.strandInit()
    }

    setStrand(addr: log.StrandAddr, strand: log.Strand): void {
        this.tx.set(this.strandRef(addr), strand)
    }

    // - Row
    rowRef(addr: log.RowAddr): FirebaseFirestore.DocumentReference {
        return this.strandRef(addr).collection('rows').doc('' + addr.rowIdx)
    }

    async getRow(addr: log.RowAddr): Promise<log.Row> {
        const rowData: FirebaseFirestore.DocumentData =
            await this.tx.get(this.rowRef(addr))
        if (!rowData.exists) {
            throw new Error('not found')
        }
        return validate('Row')(rowData.data());
    }

    setRow(addr: log.RowAddr, row: log.Row): void {
        this.tx.set(this.rowRef(addr), row)
    }

    // - Mount
    mountRef(addr: log.MountAddr): FirebaseFirestore.DocumentReference {
        return this.rowRef(addr).collection('mounts').doc(addr.mountId)
    }

    async getMount(addr: log.MountAddr): Promise<log.Mount> {
        const mountData: FirebaseFirestore.DocumentData =
            await this.tx.get(this.mountRef(addr))
        if (!mountData.exists) {
            throw new Error('not found')
        }
        return validate('Mount')(mountData.data());
    }

    async setMount(addr: log.MountAddr, mount: log.Mount) {
        this.tx.set(this.mountRef(addr), mount)
    }


    applyMap(mountId: string, map: MapFn, output: Output): void {
        // Gather input to map, requiring it to be specified on all strands.
        const input: StrandMap = {}
        for (const strandId in output) {
            if (map.input in output[strandId]) {
                input[strandId] = output[strandId][map.input]
            } else {
                return
            }
        }
        const opOut = map.fn(input)
        for (const strandId in output) {
            output[strandId][mountId] = opOut[strandId]
        }
    }

    async applyReduce(braidId: string, strandMetas: { [id: string]: log.Strand },
        mountId: string, reduce: ReduceFn, output: Output): Promise<void> {
        const accMounts: StrandMap = {}
        const actionMounts: StrandMap = {}
        for (const strandId in strandMetas) {
            // Gather action for reduce, requiring it to be specified on all strands.
            if (reduce.input in output[strandId]) {
                actionMounts[strandId] = output[strandId][reduce.input]
            } else {
                return
            }

            if (strandMetas[strandId].sourceCount !== (strandMetas[strandId].mountCounts[mountId] || 0)) {
                // If the mount isn't up to date on one of our strands, bail.
                return
            }
            if (strandMetas[strandId].sourceCount === 0) {
                // If any strands are brand new, there's no previous row to get.
                continue
            }
            accMounts[strandId] = (await this.getMount({
                braidId,
                strandId,
                rowIdx: strandMetas[strandId].sourceCount - 1,
                mountId
            })).content
        }
        const opOutput = reduce.fn(accMounts, actionMounts)

        for (const strandId in opOutput) {
            output[strandId][mountId] = opOutput[strandId]
        }
    }
}