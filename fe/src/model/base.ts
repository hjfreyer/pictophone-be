
export type ActionVersion = 0

export type ExportVersion = '0' | 'v1.0.0'

export type Submission = {
    kind: 'word'
    word: string
} | {
    kind: 'drawing'
    drawingId: string
}
