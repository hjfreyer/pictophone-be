import React, { useRef, useEffect } from 'react'
import * as types from './types'

type DrawingProps = {
    drawing: types.Drawing
    width: number
    height: number
}

export const Drawing: React.FC<DrawingProps> = ({ drawing, width, height }) => {
    const svgRef = useRef<SVGSVGElement>(null)

    useEffect(() => {
        const e: SVGSVGElement = svgRef.current!

        e.style.width = width + 'px'
        e.style.height = height + 'px'
    })

    return (
        <svg ref={svgRef}>
            {
                drawing.paths.map((p, idx) =>
                    <path key={idx}
                        d={renderPath(p)}
                        stroke="black"
                        fill="transparent" />
                )
            }
        </svg>
    )
}

function renderPath(p: types.Path): string {
    if (p.points.length == 0) {
        return ""
    }
    if (p.points.length == 1) {
        const { x, y } = p.points[0]
        return `M ${x} ${y} L ${x + 1} ${y}`
    }
    let res = `M ${p.points[0].x} ${p.points[0].y}`
    for (const { x, y } of p.points.slice(1)) {
        res += `L ${x} ${y}`
    }
    return res
}

export default Drawing