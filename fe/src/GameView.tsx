
import React, { useState } from 'react';
import * as types from './types'
import Drawer, { DraftDrawing } from './Drawer'

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
                    <Drawer draft={draftDrawing} onChange={setDraftDrawing} />
                    <button onClick={doDrawingSub}>Submit</button>
                    {JSON.stringify(playerGame.prompt)}</div>

            }

            return <div>{JSON.stringify(playerGame.prompt)}</div>
        default:
            return <div>TODO: {playerGame.state}</div>
    }
}

export default GameView