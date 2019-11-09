import React, { useState, useRef, useEffect } from 'react'
import * as types from './types'
import produce from 'immer'
import Drawing from './Drawing'

export type DraftDrawing = {
    drawing: types.Drawing
    inProgress: { [touchId: string]: number }
}

type CanvasProps = {
    draft: DraftDrawing
    onChange: (d: DraftDrawing) => void
}

export const Canvas: React.FC<CanvasProps> = ({ draft, onChange }) => {
    function touchStart(e: React.TouchEvent<HTMLDivElement>) {
        e.preventDefault()
        console.log('touchstart')
        onChange(produce(draft, (draft) => {
            for (let idx = 0; idx < e.changedTouches.length; idx++) {
                const touch = e.changedTouches.item(idx)
                draft.inProgress[touch.identifier] = draft.drawing.paths.length

                const rect = (e.target as HTMLDivElement).getBoundingClientRect()
                const pt = {
                    x: touch.clientX - rect.left,
                    y: touch.clientY - rect.top,
                }
                draft.drawing.paths.push({ points: [pt] })
            }
        }))
    }

    function touchMove(e: React.TouchEvent<HTMLDivElement>) {
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

    return (
        <div
            onTouchStart={touchStart}
            onTouchMove={touchMove}
            style={{ touchAction: 'none' }}>
            <Drawing drawing={draft.drawing} width={500} height={500} />
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

export default Canvas