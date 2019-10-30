
export type Strand = {
    version: number
    mounts: { [mountId: string]: MountInfo }
}

export type MountInfo = {
    current: boolean
    count: number,
    timestamp: Timestamp
}

// export type Entry = SourceEntry | RefEntry

export type CreateRowRequest = {
    // kind: 'source'
    aliases: RowAddr[]
    source: string
}

export type Row = {
    // kind: 'source'
    aliases: RowAddr[]
    source: string
    timestamp: Timestamp
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