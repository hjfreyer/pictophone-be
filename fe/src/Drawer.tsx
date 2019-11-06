import React, { useState, useRef, useEffect } from 'react';

type Point = [number, number]
type Path = Point[]

export const Drawer: React.FC<{}> = () => {
    const [paths, setPaths] = useState<Path[]>([])
    const [inProgress, setInProgress] = useState<{ [touchId: string]: number }>({})
    const svgRef = useRef<SVGSVGElement>(null)


    function touchStart(e: React.TouchEvent<SVGSVGElement>) {
        e.preventDefault()
        console.log('touchstart')
        const p = [...paths]
        const ip = { ...inProgress }
        for (let idx = 0; idx < e.changedTouches.length; idx++) {
            const touch = e.changedTouches.item(idx);
            ip[touch.identifier] = p.length
            p.push([[touch.clientX, touch.clientY]])
        }

        setPaths(p)
        setInProgress(ip)
    }

    function touchMove(e: React.TouchEvent<SVGSVGElement>) {
        e.preventDefault()
        console.log('touchmove')
        const p = [...paths]

        for (let idx = 0; idx < e.changedTouches.length; idx++) {
            const touch = e.changedTouches.item(idx);
            p[inProgress[touch.identifier]].push(
                [touch.clientX, touch.clientY]
            )
        }

        setPaths(p)
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
                    paths.map((p, idx) =>
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

    c.style.width = window.innerWidth + "px";
    c.style.height = window.innerHeight + "px";
}

function renderPath(p: Path): string {
    if (p.length == 0) {
        return ""
    }
    if (p.length == 1) {
        return `M ${p[0][0]} ${p[0][1]} L ${p[0][0] + 1} ${p[0][1]}`
    }
    let res = `M ${p[0][0]} ${p[0][1]}`
    for (const [x, y] of p.slice(1)) {
        res += `L ${x} ${y}`
    }
    return res
}
