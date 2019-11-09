import React, { useState, useRef, useEffect } from 'react'
import * as types from './types'
import produce from 'immer'

export type DraftDrawing = {
    drawing: types.Drawing
    inProgress: { [touchId: string]: number }
}

type DrawerProps = {
    draft: DraftDrawing
    onChange: (d: DraftDrawing) => void
}

export const Drawer: React.FC<DrawerProps> = ({ draft, onChange }) => {
    const svgRef = useRef<SVGSVGElement>(null)

    function touchStart(e: React.TouchEvent<SVGSVGElement>) {
        e.preventDefault()
        console.log('touchstart')
        onChange(produce(draft, (draft) => {
            for (let idx = 0; idx < e.changedTouches.length; idx++) {
                const touch = e.changedTouches.item(idx)
                draft.inProgress[touch.identifier] = draft.drawing.paths.length

                const rect = (e.target as SVGSVGElement).getBoundingClientRect()
                const pt = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                }
                draft.drawing.paths.push({ points: [pt] })
            }
        }))
    }

    function touchMove(e: React.TouchEvent<SVGSVGElement>) {
        e.preventDefault()
        console.log('touchmove')
        onChange(produce(draft, (draft) => {
            for (let idx = 0; idx < e.changedTouches.length; idx++) {
                const touch = e.changedTouches.item(idx);
                const rect = (e.target as SVGSVGElement).getBoundingClientRect()
                const pt = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                }
                draft.drawing.paths[draft.inProgress[touch.identifier]]
                    .points.push(pt)
            }
        }))
    }

    useEffect(() => {
        resize(svgRef)
        window.addEventListener('resize', () => resize(svgRef))
    })

    return (
        <div>
            <svg
                ref={svgRef}
                style={{ touchAction: 'none' }}
                onTouchStart={touchStart}
                onTouchMove={touchMove}>
                {
                    draft.drawing.paths.map((p, idx) =>
                        <path key={idx}
                            d={renderPath(p)}
                            stroke="black"
                            fill="transparent" />
                    )
                }
            </svg>
        </div>)
}


function resize(ref: React.RefObject<SVGSVGElement>) {
    const c: SVGSVGElement = ref.current!

    c.style.width = 500 + 'px'
    c.style.height = 500 + 'px'
    // c.style.width = window.innerWidth + "px";
    // c.style.height = window.innerHeight + "px";
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

export default Drawer