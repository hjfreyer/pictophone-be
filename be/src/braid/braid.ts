
import * as log from './log'
import { validate } from './log.validator'

export type Config = {
    braids: { [id: string]: BraidConfig }
}

export type BraidConfig = {
    keyFunction: (action: string) => string[]
    views: { [viewId: string]: ViewFn }
    viewOrder: string[]
}

export type StrandMap = { [strandId: string]: string }

export type ViewFn = MapFn | ReduceFn

export type MapFn = {
    op: 'map'
    inputView: string
    fn: (state: string) => string
}

export type ReduceFn = {
    op: 'reduce'
    inputView: string
    fn: (acc: StrandMap, action: string) => string
}

export function applyAction(c: Config, db: FirebaseFirestore.Firestore, action: string): Promise<void> {
    return db.runTransaction(async (tx: FirebaseFirestore.Transaction): Promise<void> => {
        return await new Helper(c, db, tx).applyActionTransaction(action)
    });
}

type EntryOutput = {
    [viewId: string]: string
}

class Helper {

    constructor(
        private c: Config,
        private db: FirebaseFirestore.Firestore,
        private tx: FirebaseFirestore.Transaction) { }

    async applyActionTransaction(action: string): Promise<void> {
        const braid = this.c.braids['root']
        // const braidDoc = this.db.doc('braids/root')

        const strandIds = braid.keyFunction(action)
        const strandMetas: { [id: string]: log.Strand } = {}
        //        const addrs: log.Addr[] = []
        for (const strandId of strandIds) {
            // TODO: parallelize
            strandMetas[strandId] = await this.getStrand({ braidId: 'root', strandId })
            // addrs.push({
            //     braidId: 'root',
            //     strandId: strandKey,
            //     entryIdx: strandMetas[strandKey].sourceCount
            // })
        }

        const output: EntryOutput = {
            'source': action
        }
        for (const viewId of braid.viewOrder) {
            const view = braid.views[viewId]

            switch (view.op) {
                case 'map':
                    this.applyMap(viewId, view, output);
                    break;

                case 'reduce':
                    await this.applyReduce(strandMetas, viewId, view, output)
                    break
            }
        }
        for (const strandId in strandMetas) {
            const strand = strandMetas[strandId]
            strand.sourceCount++
            for (const viewId in output) {
                if (viewId !== 'source') {
                    strand.viewCounts[viewId]++
                }
            }
            this.setStrand({braidId: 'root'})
        }

    }

    async getStrand(addr: log.StrandAddr): Promise<log.Strand> {
        const doc = await this.tx.get(this.db
            .collection('braids').doc(addr.braidId)
            .collection('strands').doc(addr.strandId))
        return doc.exists ? validate('Strand')(doc.data()) : log.strandInit()
    }

    setStrand(addr: log.StrandAddr, strand: log.Strand): void {
        this.tx.set(this.db
            .collection('braids').doc(addr.braidId)
            .collection('strands').doc(addr.strandId), strand)
    }

    async getEntry(addr: log.EntryAddr): Promise<log.Entry> {
        const entryData: FirebaseFirestore.DocumentData =
            await this.tx.get(this.db
                .collection('braids').doc(addr.braidId)
                .collection('strands').doc(addr.strandId)
                .collection('entries').doc('' + addr.entryIdx))
        if (!entryData.exists) {
            throw new Error('not found')
        }
        return validate('Entry')(entryData.data());
    }

    async getSourceEntry(addr: log.EntryAddr): Promise<[log.EntryAddr, log.SourceEntry]> {
        let a = addr;
        while (true) {
            const e = await this.getEntry(a);
            if (e.kind == "source") {
                return [a, e];
            }
            a = e.source
        }
    }

    setEntry(addr: log.EntryAddr, entry: log.Entry): void {
        this.tx.set(this.db
            .collection('braids').doc(addr.braidId)
            .collection('strands').doc(addr.strandId)
            .collection('entries').doc('' + addr.entryIdx), entry)
    }

    async getView(addr: log.ViewAddr): Promise<log.View> {
        const [sa,] = await this.getSourceEntry(addr)
        const viewData: FirebaseFirestore.DocumentData =
            await this.tx.get(this.db
                .collection('braids').doc(sa.braidId)
                .collection('strands').doc(sa.strandId)
                .collection('entries').doc('' + sa.entryIdx)
                .collection('views').doc(addr.viewId))
        if (!viewData.exists) {
            throw new Error('not found')
        }
        return validate('View')(viewData.data());
    }

    applyMap(viewId: string, map: MapFn, output: EntryOutput): void {
        if (map.inputView in output) {
            output[viewId] = map.fn(output[map.inputView])
        }
    }

    async applyReduce(strandMetas: { [id: string]: log.Strand },
        viewId: string, reduce: ReduceFn, output: EntryOutput): Promise<void> {
        if (!(reduce.inputView in output)) {
            return
        }
        const action = output[reduce.inputView]

        const accViews: StrandMap = {}
        for (const strandId in strandMetas) {
            if (strandMetas[strandId].sourceCount !== strandMetas[strandId].viewCounts[strandId]) {
                // If the view isn't up to date on one of our strands, bail.
                return
            }
            if (strandMetas[strandId].sourceCount === 0) {
                // If any strands are brand new, there's no previous entry to get.
                continue
            }
            accViews[strandId] = (await this.getView({
                braidId: 'root',
                strandId,
                entryIdx: strandMetas[strandId].sourceCount - 1,
            }, viewId)).body
        }

        output[viewId] = reduce.fn(accViews, action)
    }
}