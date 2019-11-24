
export type Drawing = {
    // Each path alternates between x and y. Each coordinate is normalized between 0 and 1.
    paths: number[][]
}

export type Upload = Drawing & {kind: 'drawing'}

export default Upload