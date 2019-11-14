
import React, { useState, useEffect } from 'react';

import * as types from './types'
import Canvas, { DraftDrawing } from './Canvas'
import Drawing from './Drawing'
import { validate } from './types.validator'

type GameViewProps = {
    playerGame: types.PlayerGame
    startGame: () => void
    submitWord: (word: string) => void
    submitDrawing: (s: types.Drawing) => void
}

const GameView: React.FC<GameViewProps> = ({ playerGame, startGame, submitWord, submitDrawing }) => {

    const playerList = <div>
        Players: {playerGame.playerIds.map((p, idx) => <div key={idx}>{p}</div>)}
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
            return (
                <div>
                    {playerList}
                    {playerGame.series.map((s, idx) =>
                        <Series key={idx} series={s} seriesIdx={idx} />
                    )}

                </div>
            )
    }
}

type ActiveGameProps = {
    playerGame: types.FirstPromptGame | types.WaitingForPromptGame | types.RespondToPromptGame
    submitWord: (word: string) => void
    submitDrawing: (s: types.Drawing) => void
}

const ActiveGame: React.FC<ActiveGameProps> = ({ playerGame, submitWord, submitDrawing }) => {
    const initText = ''
    const initDraftDrawing = {
        drawing: {
            paths: []
        },
        inProgress: {},
    }
    
    const [textSub, setTextSub] = useState("")
    const [draftDrawing, setDraftDrawing] = useState<DraftDrawing>(initDraftDrawing)

    const [dims, setDims] = useState({
        width: window.innerWidth,
        height: window.innerHeight
    });

    useEffect(() => {
        return window.addEventListener('resize', () => setDims({
            width: window.innerWidth,
            height: window.innerHeight
        }));
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

    const playerList = <div>
        Players: {playerGame.playerIds.map((p, idx) => <div key={idx}>{p}</div>)}
    </div>

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

    const respond = (playerGame: types.RespondToPromptGame) =>
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
                <DownloadDrawing drawing={playerGame.prompt.drawing}
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
        // if (playerGame.prompt.kind === 'word') {
        //     return <div>
        //         {playerList}
        //         <div>Your prompt is: {playerGame.prompt.word}</div>
        //         <div>Drawz!</div>
        //         <Canvas draft={draftDrawing} onChange={setDraftDrawing} />
        //         <button onClick={doDrawingSub}>Submit</button>
        //     </div>
        // } else {
        //     return <div>
        //         {playerList}
        //         <div>Your prompt is:</div>
        //         <Drawing drawing={playerGame.prompt.drawing}
        //             width={500} height={500} />
        //         <div>Describe!</div>
        //         <form onSubmit={doTextSub}>
        //             <input value={textSub} onChange={e => setTextSub(e.target.value)} />
        //             <button>Submit</button>
        //         </form>
        //     </div>
        // }
    }
}

type SeriesProps = {
    series: types.Series
    seriesIdx: number
}

const Series: React.FC<SeriesProps> = ({ series, seriesIdx }) => {
    return <div>
        <h2>Series {seriesIdx}</h2>
        {
            series.entries.map((e, eIdx) => <Entry key={eIdx} entry={e} />)
        }
    </div>
}

const Entry: React.FC<{ entry: types.SeriesEntry }> = ({ entry }) => {
    if (entry.submission.kind === 'word') {
        return <div>
            <h3>{entry.playerId} said</h3>
            <div>{entry.submission.word}</div>
        </div>
    } else {
        return <div>
            <h3>{entry.playerId} drew</h3>
            <DownloadDrawing drawing={entry.submission.drawing} width={300} height={400} />
        </div>
    }
}

type DownloadDrawingProps = {
    drawing : types.Ref
    width: number
    height: number
}


function decompressDrawing(compressed: types.CompressedDrawing ): types.Drawing {
    return {
        paths: compressed.paths.map(p => {
            const res : types.Path = {points: []}
            for (let i = 0; i < p.length; i += 2) {
                res.points.push({x: p[i], y: p[i+1]})
            }
            return res
        })
    }
}


const DownloadDrawing :React.FC<DownloadDrawingProps> = ({drawing, width, height}) => {
    const [downloaded, setDownloaded] = useState<types.Drawing | null>(null)
    useEffect(() => {
        (async () => {
            const res = await fetch(
                `https://storage.googleapis.com/pictophone-app-drawings/${drawing.id}`, {

                })
            const d = validate('CompressedDrawing')(await res.json())
            setDownloaded(decompressDrawing(d))
        })()
    }, [drawing])
    
    if (downloaded === null) {
        return <div>Loading...</div>
    }

    return <Drawing drawing={downloaded} width={width} height={height} />

}  
export default GameView