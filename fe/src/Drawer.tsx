import React from 'react';
import { pathToFileURL } from 'url';

type Point = [number, number]
type Path = Point[]

type State = {
    paths: Path[]
    inProgress: { [touchId: string]: number }
}

export class Drawer extends React.Component<{}, State> {
    state: State = {
        paths: [],
        inProgress: {}
    }
    canvasRef: React.RefObject<SVGSVGElement> = React.createRef()

    componentDidMount(): void {
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }

    private resize(): void {
        const c: SVGSVGElement = this.canvasRef!.current!;

        c.style.width = window.innerWidth + "px";
        c.style.height = window.innerHeight + "px";
    }


    private touch(e: React.TouchEvent<SVGSVGElement>): void {
        const t = e.targetTouches
        console.log('touches: ', t.length)

        const newTouches: { [id: number]: Point } = {}
        for (let idx = 0; idx < t.length; idx++) {
            const touch = t.item(idx);
            console.log(touch.identifier)
            newTouches[touch.identifier] = [touch.clientX, touch.clientY]
        }
        const newPaths = [...this.state.paths]
        const newInProgress: { [id: number]: number } = {}

        for (const newId in newTouches) {
            if (newId in this.state.inProgress) {
                const pathIdx = this.state.inProgress[newId]
                newInProgress[newId] = pathIdx
                newPaths[pathIdx].push(newTouches[newId]);
            } else {
                newInProgress[newId] = newPaths.length
                newPaths.push([newTouches[newId]])
            }
        }

        this.setState({
            paths: newPaths,
            inProgress: newInProgress,
        })
        e.preventDefault()
    }
    touchStart(e: React.TouchEvent<SVGSVGElement>) {
        e.preventDefault()
        console.log('touchstart')
        const paths = [...this.state.paths]
        const inProgress = { ...this.state.inProgress }
        for (let idx = 0; idx < e.changedTouches.length; idx++) {
            const touch = e.changedTouches.item(idx);
            inProgress[touch.identifier] = paths.length
            paths.push([[touch.clientX, touch.clientY]])
        }

        this.setState({ paths, inProgress })
    }

    touchMove(e: React.TouchEvent<SVGSVGElement>) {
        e.preventDefault()
        console.log('touchmove')
        const paths = [...this.state.paths]

        for (let idx = 0; idx < e.changedTouches.length; idx++) {
            const touch = e.changedTouches.item(idx);
            paths[this.state.inProgress[touch.identifier]].push(
                [touch.clientX, touch.clientY]
            )
        }
        
        this.setState({
            paths,
            inProgress: this.state.inProgress,
        })
    }

    render(): JSX.Element {
        return (
            <div>
                <svg
                    ref={this.canvasRef}
                    style={{ touchAction: 'none' }}
                    onTouchStart={(e) => this.touchStart(e)}
                    onTouchMove={(e) => this.touchMove(e)}>
                    {
                        this.getPaths().map((p, idx) =>
                            <path key={idx}
                                d={this.renderPath(p)}
                                stroke="black"
                                fill="transparent" />
                        )
                    }
                </svg>
            </div>)
    }

    getPaths(): Path[] {
        return this.state.paths


        // const res :Path[]= [...this.state.paths, ...Object.values(this.state.inProgress)]
        // // for (const id in this.state.inProgress) {
        // //     res.push()
        // // }
        // return res
    }

    renderPath(p: Path): string {
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
}