
import React, { useState } from 'react';
import * as types from './types'
import Canvas, { DraftDrawing } from './Canvas'
import Drawing from './Drawing'

type GameViewProps = {
    playerGame: types.PlayerGame
    startGame: () => void
    submit: (s: types.Submission) => void
}

const GameView: React.FC<GameViewProps> = ({ playerGame, startGame, submit }) => {
    const [textSub, setTextSub] = useState("")
    const [draftDrawing, setDraftDrawing] = useState<DraftDrawing>({
        drawing: {
            paths: []
        },
        inProgress: {},
    })

    const playerList = <div>
        Players: {playerGame.playerIds.map((p, idx) => <div key={idx}>{p}</div>)}
    </div>

    const doTextSub = (e: React.ChangeEvent<HTMLFormElement>) => {
        e.preventDefault()
        submit({ kind: "word", word: textSub })
        setTextSub("")
    }

    const doDrawingSub = () => {
        submit({ kind: "drawing", drawing: draftDrawing.drawing })
    }

    switch (playerGame.state) {
        case "UNSTARTED":
            return <div>
                {playerList}
                Waiting to start game.
            <button onClick={startGame}>Start Game</button>
            </div>
        case "FIRST_PROMPT":
            return <div>
                {playerList}
                <div>Come up with a thing!</div>
                <form onSubmit={doTextSub}>
                    <input value={textSub} onChange={e => setTextSub(e.target.value)} />
                    <button>Submit</button>
                </form>
            </div>
        case "WAITING_FOR_PROMPT":
            return <div>
                {playerList}
                Chill out for a sec while everyone else finishes.
            </div>
        case "RESPOND_TO_PROMPT":
            if (playerGame.prompt.kind === 'word') {
                return <div>
                    {playerList}
                    <div>Your prompt is: {playerGame.prompt.word}</div>
                    <div>Drawz!</div>
                    <Canvas draft={draftDrawing} onChange={setDraftDrawing} />
                    <button onClick={doDrawingSub}>Submit</button>
                </div>
            } else {
                return <div>
                    {playerList}
                    <div>Your prompt is:</div>
                    <Drawing drawing={playerGame.prompt.drawing}
                        width={500} height={500} />
                    <div>Describe!</div>
                    <form onSubmit={doTextSub}>
                        <input value={textSub} onChange={e => setTextSub(e.target.value)} />
                        <button>Submit</button>
                    </form>
                </div>
            }
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
            <Drawing drawing={entry.submission.drawing} 
                width={500} height={500}/>
        </div>
    }
}

export default GameView