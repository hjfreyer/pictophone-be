import produce from 'immer'
import React, { useRef } from 'react'
import Drawing from './Drawing'
import { Drawing as DrawingModel } from './model/rpc'

export type DraftDrawing = {
    drawing: DrawingModel
    inProgress: { [touchId: string]: number }
}

type CanvasProps = {
    draft: DraftDrawing
    onChange: (d: DraftDrawing) => void
    width: number
    height: number
}

type Point = { x: number, y: number }

type PointerMap = { [touchId: string]: Point }

export const Canvas: React.FC<CanvasProps> = ({ draft, onChange, width, height }) => {
    const divRef = useRef<HTMLDivElement>(null)

    function pointerStart(pointers: PointerMap) {
        onChange(produce(draft, (draft) => {
            for (const ptId in pointers) {
                draft.inProgress[ptId] = draft.drawing.paths.length
                const rect = divRef.current!.getBoundingClientRect()
                const pt = {
                    x: (pointers[ptId].x - rect.left) / width,
                    y: (pointers[ptId].y - rect.top) / height,
                }
                draft.drawing.paths.push([pt.x, pt.y])
            }
        }))
    }

    function pointerMove(pointers: PointerMap) {
        onChange(produce(draft, (draft) => {
            for (const ptId in pointers) {
                const rect = divRef.current!.getBoundingClientRect()
                const pt = {
                    x: (pointers[ptId].x - rect.left) / width,
                    y: (pointers[ptId].y - rect.top) / height,
                }
                draft.drawing.paths[draft.inProgress[ptId]].push(pt.x, pt.y)
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

    function mouseToPointers(e: React.MouseEvent<HTMLDivElement>): PointerMap {
        return {
            mouse: { x: e.clientX, y: e.clientY }
        }
    }

    function touchStart(e: React.TouchEvent<HTMLDivElement>) {
        e.preventDefault()
        pointerStart(touchesToPointers(e.changedTouches))
    }

    function touchMove(e: React.TouchEvent<HTMLDivElement>) {
        e.preventDefault()
        pointerMove(touchesToPointers(e.changedTouches))
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

export default Canvas
