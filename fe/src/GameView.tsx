
import React, { useEffect, useRef, useState } from 'react'
import Canvas, { DraftDrawing } from './Canvas'
import Drawing from './Drawing'
import { Drawing as DrawingModel } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import * as exp from './model/Export'

type GameViewProps = {
    playerGame: exp.PlayerGame
    startGame: () => void
    submitWord: (word: string) => void
    submitDrawing: (s: DrawingModel) => void
}

const GameView: React.FC<GameViewProps> = ({ playerGame, startGame, submitWord, submitDrawing }) => {
    const playerList = <div>
        Players: {
            playerGame.playerOrder.map((p, idx) =>
                <div key={idx}>{playerGame.players[p].displayName}</div>
                )
        }
    </div>

    switch (playerGame.state) {
        case "UNSTARTED":
            return <div>
                {playerList}
                Waiting to start game.
            <button onClick={startGame}>Start Game</button>
            </div>
        case "FIRST_PROMPT":
        case "WAITING_FOR_PROMPT":
        case "RESPOND_TO_PROMPT":
            return <ActiveGame playerGame={playerGame} submitWord={submitWord} submitDrawing={submitDrawing} />

        case "GAME_OVER":
            return <Series serieses={playerGame.series} />
    }
}

type ActiveGameProps = {
    playerGame: exp.FirstPromptGame | exp.WaitingForPromptGame | exp.RespondToPromptGame
    submitWord: (word: string) => void
    submitDrawing: (s: DrawingModel) => void
}

const ActiveGame: React.FC<ActiveGameProps> = ({ playerGame, submitWord, submitDrawing }) => {
    const initText = ''
    const initDraftDrawing = {
        drawing: {
            kind: 'drawing' as 'drawing',
            paths: []
        },
        inProgress: {},
    }

    const [textSub, setTextSub] = useState("")
    const [draftDrawing, setDraftDrawing] = useState<DraftDrawing>(initDraftDrawing)

    const [dims, setDims] = useState({
        width: window.innerWidth,
        height: window.innerHeight
    })

    useEffect(() => {
        return window.addEventListener('resize', () => setDims({
            width: window.innerWidth,
            height: window.innerHeight
        }))
    }, [])

    const doTextSub = (e: React.ChangeEvent<HTMLFormElement>) => {
        e.preventDefault()
        submitWord(textSub)
        setTextSub(initText)
    }

    const doDrawingSub = () => {
        submitDrawing(draftDrawing.drawing)
        setDraftDrawing(initDraftDrawing)
    }

    const firstPrompt = <main id="game">
        <header>Pictophone!</header>
        <div className="instructions">Come up with a thing!</div>
        <form onSubmit={doTextSub}>
            <input value={textSub} onChange={e => setTextSub(e.target.value)} />
            <button>Submit</button>
        </form>
    </main>

    const waitForPrompt = <main id="game">
        <header>Pictophone!</header>
        <div className="instructions">
            Chill out for a sec while everyone else finishes.
        </div>
    </main>

    const canvasHeight1 = dims.height * 0.7
    const canvasWidth1 = canvasHeight1 * 3 / 4
    const canvasWidth = Math.min(canvasWidth1, dims.width * 0.95)
    const canvasHeight = canvasWidth * 4 / 3

    const respond = (playerGame: exp.RespondToPromptGame) =>
        playerGame.prompt.kind === 'word'
            ? <main id="game">
                <div className="word-prompt" >
                    {playerGame.prompt.word}
                </div>
                <Canvas draft={draftDrawing} onChange={setDraftDrawing}
                    width={canvasWidth} height={canvasHeight} />
                <button onClick={doDrawingSub}>Submit</button>
            </main>
            : <main id="game">
                <DownloadDrawing drawingId={playerGame.prompt.drawingId}
                    width={canvasWidth} height={canvasHeight} />
                <form onSubmit={doTextSub}>
                    <input value={textSub} onChange={e => setTextSub(e.target.value)} />
                    <button>Submit</button>
                </form>
            </main>

    switch (playerGame.state) {
        case "FIRST_PROMPT":
            return firstPrompt
        case "WAITING_FOR_PROMPT":
            return waitForPrompt
        case "RESPOND_TO_PROMPT":
            return respond(playerGame)
    }
}

type SeriesProps = {
    serieses: exp.Series[]
}

const Series: React.FC<SeriesProps> = ({ serieses }) => {
    return <main id="sharing">
        <div className="series">
            Scroll this way ->
        </div>
        {
            serieses.map((series, seriesIdx) => <div key={seriesIdx} className="series">
                {
                    series.entries.map((e, eIdx) => <Entry key={eIdx} entry={e} />)
                }
            </div>)
        }
    </main>
}

const Entry: React.FC<{ entry: exp.SeriesEntry }> = ({ entry }) => {
    const container = useRef<HTMLDivElement>(null)
    const [dims, setDims] = useState({ width: 0, height: 0 })

    useEffect(() => {
        setDims({
            width: container.current!.offsetWidth,
            height: container.current!.offsetHeight,
        })
    }, [])

    if (entry.submission.kind === 'word') {
        return <div ref={container}
            className="words">{entry.submission.word}</div>
    } else {
        const width = widthForBox(dims.width, dims.height)
        return <div ref={container} className="drawing">
            <DownloadDrawing drawingId={entry.submission.drawingId}
                width={width} height={4 * width / 3} />
        </div>
    }
}

function widthForBox(width: number, height: number): number {
    let widthFromHeight = height * 0.75
    return Math.min(width, widthFromHeight)
}

type DownloadDrawingProps = {
    drawingId: string
    width: number
    height: number
}

const DownloadDrawing: React.FC<DownloadDrawingProps> = ({ drawingId, width, height }) => {
    const [downloaded, setDownloaded] = useState<DrawingModel | null>(null)
    useEffect(() => {
        (async () => {
            const res = await fetch(
                `https://storage.googleapis.com/pictophone-app-drawings/${drawingId}`, {

            })
            const d = validateRpc('Upload')(await res.json())
            setDownloaded(d)
        })()
    }, [drawingId])

    if (downloaded === null) {
        return <div>Loading...</div>
    }

    return <Drawing drawing={downloaded} width={width} height={height} />

}
export default GameView