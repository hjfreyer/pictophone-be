
export interface VersionSpec {
    docs: Record<string, DocVersionSpec>
    collections: string[]
}

export type DocVersionSpec = {
    exists: true
    actionId: string
} | {
    exists: false
}

export interface VersionSpecRequest {
    docs: string[]
    collections: string[]
}

export interface Pointer {
    actionId: string
}

export interface Kollection {
    members: string[]
}
