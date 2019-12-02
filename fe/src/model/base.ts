
export type ActionVersion = 0

export type ExportVersion = '0' | 'v1.0.0' | 'v1.1.0'

export type Submission = {
    kind: 'word'
    word: string
} | {
    kind: 'drawing'
    drawingId: string
}

export const GENERATION = 2
export const EXPORT_VERSIONS : ExportVersion[] = ['0', 'v1.0.0', 'v1.1.0']
