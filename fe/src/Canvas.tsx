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
    width: number
    height: number
}

type PointerMap = { [touchId: string]: types.Point }

export const Canvas: React.FC<CanvasProps> = ({ draft, onChange, width, height }) => {
    const divRef = useRef<HTMLDivElement>(null)

    function pointerStart(pointers: PointerMap) {
        onChange(produce(draft, (draft) => {
            for (const ptId in pointers) {
                draft.inProgress[ptId] = draft.drawing.paths.length
                const rect = divRef.current!.getBoundingClientRect()
                const pt = {
                    x: pointers[ptId].x - rect.left,
                    y: pointers[ptId].y - rect.top,
                }
                draft.drawing.paths.push({ points: [pt] })
            }
        }))
    }

    function pointerMove(pointers: PointerMap) {
        onChange(produce(draft, (draft) => {
            for (const ptId in pointers) {
                const rect = divRef.current!.getBoundingClientRect()
                const pt = {
                    x: pointers[ptId].x - rect.left,
                    y: pointers[ptId].y - rect.top,
                }
                draft.drawing.paths[draft.inProgress[ptId]].points.push(pt)
            }
        }))
    }

    function touchesToPointers(touches: React.TouchList): PointerMap {
        const res: PointerMap = {}
        for (let idx = 0; idx < touches.length; idx++) {
            const touch = touches.item(idx)
            res[touch.identifier] = {
                x: touch.clientX,
                y: touch.clientY,
            }
        }
        return res
    }

    function touchStart(e: React.TouchEvent<HTMLDivElement>) {
        e.preventDefault()
        pointerStart(touchesToPointers(e.changedTouches))
    }

    function touchMove(e: React.TouchEvent<HTMLDivElement>) {
        e.preventDefault()
        pointerMove(touchesToPointers(e.changedTouches))
    }


    function mouseToPointers(e: React.MouseEvent<HTMLDivElement>): PointerMap {
        return {
            mouse: { x: e.clientX, y: e.clientY }
        }
    }


    function mouseStart(e: React.MouseEvent<HTMLDivElement>) {
        if (e.buttons === 1) { pointerStart(mouseToPointers(e)) }
    }

    function mouseMove(e: React.MouseEvent<HTMLDivElement>) {
        if (e.buttons === 1) { pointerMove(mouseToPointers(e)) }
    }

    return (
        <div
            ref={divRef}
            className="canvas"
            onTouchStart={touchStart}
            onTouchMove={touchMove}
            onMouseDown={mouseStart}
            onMouseMove={mouseMove}
            style={{ touchAction: 'none' }}>
            <Drawing drawing={draft.drawing}
                width={width} height={height} />
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