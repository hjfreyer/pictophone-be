
export type Strand = {
    sourceCount: number
    mountCounts: { [mountId: string]: number }
}

export function strandInit(): Strand {
    return { sourceCount: 0, mountCounts: {} };
}

// export type Entry = SourceEntry | RefEntry

export type Row = {
    // kind: 'source'
    aliases: RowAddr[]
    source: string
//    timestamp: Timestamp
}

// export type RefEntry = {
//     kind: 'ref'
//     source: EntryAddr
// }

export type BraidAddr = {
    braidId: string
}

export type StrandAddr = BraidAddr & {
    strandId: string
}

export type RowAddr = StrandAddr & {
    rowIdx: number
}

export type MountAddr = RowAddr & {
    mountId: string
}

export type Mount = {
    content: string
}

export type Timestamp = {
    nanoseconds: number
    seconds: number
}

export type Export = {
    [path: string]: any
}