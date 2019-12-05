import React, { useState } from 'react';
import { FirestoreCollection } from 'react-firestore';
import { Link } from 'react-router-dom';
import * as base from './base';

type HomeProps = {
    playerId: string
    defaultDisplayName: string
    dispatch: base.Dispatch
}

const Home: React.FC<HomeProps> = ({ playerId, defaultDisplayName, dispatch }) => {
    const [gameId, setGameId] = useState("")
    const [displayName, setDisplayName] = useState(defaultDisplayName)

    const joinGame = () => dispatch.action({
        version: 'v1.2.0',
        kind: "join_game",
        playerId,
        gameId,
        displayName,
    })

    return <div>
        <h1>User page for {playerId}</h1>
        <div>
            <h2>Join A Game</h2>
            <form onSubmit={(e) => { e.preventDefault(); joinGame() }}>
                <div>
                    <label>Game Name
                <input
                            type="text"
                            value={gameId} onChange={e => setGameId(e.target.value)} />
                    </label>
                </div>
                <div>
                    <label>Your Name
                <input
                            type="text"
                            value={displayName} onChange={e => setDisplayName(e.target.value)} />
                    </label>
                </div>
                <button>Submit</button>
            </form>
        </div>
        <h2>Existing Games</h2>
        <FirestoreCollection
            path={`versions/0/players/${playerId}/games`}
            render={({ isLoading, data }: { isLoading: boolean, data: any[] }) => (
                <div>
                    {
                        isLoading
                            ? <span>Loading...</span>
                            : <div>
                                {data.map((r) => (
                                    <div key={r.id}>
                                        <Link to={`/g/${r.id}`}>{r.id}</Link></div>))}
                            </div>
                    }
                </div>
            )} />
    </div>
}

export default Home