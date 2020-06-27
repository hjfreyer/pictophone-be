
export type ReferenceGroup = {
    kind: 'single'
    actionId: string
} | {
    kind: 'collection'
    id: string
    members: Record<string, ReferenceGroup>
} | {
    kind: 'none'
}

export interface Pointer {
    actionId: string
}
