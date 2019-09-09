
export type Log = {
    versions: number
    derived: {[collectionId: string]: number}
}

export type Entry = {
    body: string
}