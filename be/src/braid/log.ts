
export type Strand = {
    sourceCount: number
    viewCounts: { [viewId: string]: number }
}

export function strandInit(): Strand {
    return { sourceCount: 0, viewCounts: {} };
}

export type Entry = SourceEntry | RefEntry

export type SourceEntry = {
    kind: 'source'
    aliases: EntryAddr[]
    timestamp: Timestamp
}

export type RefEntry = {
    kind: 'ref'
    source: EntryAddr
}

export type BraidAddr = {
    braidId: string
}

export type StrandAddr = BraidAddr & {
    strandId: string
}

export type EntryAddr = StrandAddr & {
    entryIdx: number
}

export type ViewAddr = EntryAddr & {
    viewId: string
}

export type View = {
    body: string
}

export type Timestamp = {
    nanoseconds: number
    seconds: number
}