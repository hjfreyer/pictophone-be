import React, { useRef, useEffect } from 'react'
import { Drawing as DrawingModel } from './model/rpc'

type DrawingProps = {
    drawing: DrawingModel
    width: number
    height: number
}

function scalePath(path: number[], sx: number, sy: number) {
    const res: number[] = []
    for (let i = 0; i < path.length; i += 2) {
        res.push(path[i] * sx, path[i + 1] * sy)
    }
    return res
}

export const Drawing: React.FC<DrawingProps> = ({ drawing, width, height }) => {
    const svgRef = useRef<SVGSVGElement>(null)

    useEffect(() => {
        const e: SVGSVGElement = svgRef.current!

        e.style.width = width + 'px'
        e.style.height = height + 'px'
    })

    const scaled: DrawingModel = {
        kind: 'drawing',
        paths: drawing.paths.map(path => scalePath(path, width, height))
    }

    return (
        <svg ref={svgRef}>
            {
                scaled.paths.map((p, idx) =>
                    <path key={idx}
                        d={renderPath(p)}
                        stroke="black"
                        strokeWidth="2"
                        fill="transparent" />
                )
            }
        </svg>
    )
}

function renderPath(p: number[]): string {
    if (p.length === 0) {
        return ""
    }
    if (p.length === 2) {
        const x = p[0]
        const y = p[1]
        return `M ${x} ${y} L ${x + 1} ${y}`
    }
    let res = `M ${p[0]} ${p[1]}`
    for (let idx = 0; idx < p.length; idx += 2) {
        res += `L ${p[idx]} ${p[idx + 1]}`
    }
    return res
}

export default Drawing