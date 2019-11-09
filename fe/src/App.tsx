import React, { useState } from 'react';
import logo from './logo.svg';
import './App.css';

import firebase from '@firebase/app';
import '@firebase/firestore';
import { FirestoreProvider, FirestoreCollection, FirestoreDocument } from 'react-firestore';

import {
    BrowserRouter as Router,
    Switch,
    useParams, useHistory,
    Route, Link, match, RouteComponentProps
} from "react-router-dom";
import * as types from './types';
import { validate } from './types.validator'

import GameView from './GameView'

const config = {
    projectId: 'pictophone-app',
};

const app = firebase.initializeApp(config);
const db = app.firestore!();
//db.settings({ host: "50051-dot-3073974-dot-devshell.appspot.com" });
(window as any)['db'] = db;

// const App: React.FC = () => {
//   return (
//     <div className="App">
//       <header className="App-header">
//         <img src={logo} className="App-logo" alt="logo" />
//         <p>
//           Edit <code>src/App.tsx</code> and save to reload OR NOT.
//         </p>

//   <FirestoreProvider firebase={firebase}>
// <FirestoreDocument
//   path="projections/v0/players/ehopper/games/1"
//   render={({ isLoading, data }:{ isLoading:boolean, data:any }) => (
//       <div>{JSON.stringify(data)}</div>
//   )}/>
// </FirestoreProvider>
//         <a
//           className="App-link"
//           href="https://reactjs.org"
//           target="_blank"
//           rel="noopener noreferrer"
//         >
//           Learn React
//         </a>
//       </header>
//     </div>
//   );
// }

function About() {
    return <h2>About</h2>;
}

const Home: React.FC = () => {
    const [id, setId] = useState<string>("")
    const history = useHistory();

    return <div>
        <h1>Home</h1>
        Username
        <form onSubmit={() => history.push('/p/' + id)}>
            <input
                type="text" value={id} onChange={e => setId(e.target.value)} />
            <button>Submit</button>
        </form>
    </div>
}

type PlayerPageParams = {
    playerId: string
}

type PlayerPageProps = {
    dispatch: (a: types.Action) => void
}

const PlayerPage: React.FC<PlayerPageProps> = ({ dispatch }) => {
    const { playerId } = useParams()

    return <Player playerId={playerId!} dispatch={dispatch} />
}

type PlayerProps = {
    playerId: string
    dispatch: (a: types.Action) => void
}

const Player: React.FC<PlayerProps> = ({ playerId, dispatch }) => {
    const joinGame = (gameId: string) => dispatch({
        kind: "join_game",
        playerId,
        gameId,
    })

    return <div>
        <h1>User page for {playerId}</h1>
        <JoinGame join={joinGame} />
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
                                        <Link to={`/p/${playerId}/g/${r.id}`}>{r.id}</Link></div>))}
                            </div>
                    }
                </div>
            )} />
    </div>
}

const JoinGame = ({ join }: {
    join: (gid: string) => void
}) => {
    const [gid, setGid] = useState("")
    return <div>
        <h2>Join A Game</h2>
        <form onSubmit={(e) => { e.preventDefault(); join(gid) }}>
            <input
                type="text"
                value={gid} onChange={e => setGid(e.target.value)} />
            <button>Submit</button>
        </form>
    </div>
}

type GamePageParams = {
    dispatch: (a:types.Action) => void
}

const GamePage : React.FC<GamePageParams> = ({dispatch}) =>{
    const {playerId, gameId} = useParams()

    const startGame = () => dispatch({
        kind: "start_game",
        playerId: playerId!,
        gameId: gameId!
    })

    const submit = (submission: types.Submission) => dispatch({
        kind: "make_move",
        playerId: playerId!,
        gameId: gameId!,
        submission,
    })

    return (
        <div>
            <h1>Game {gameId}</h1>
            <FirestoreDocument
                path={`versions/0/players/${playerId}/games/${gameId}`}
                render={({ isLoading, data }: { isLoading: boolean, data: any }) => {
                    if (isLoading) {
                        return <span>Loading...</span>;
                    }
                    const pg: types.PlayerGame = validate('PlayerGame')(data);
                    return <GameView 
                        playerGame={pg}
                        startGame={startGame}
                        submit={submit}
                     />
                }}
            />
        </div>
    )
}




async function postit(body: types.Action): Promise<void> {
    const res = await fetch('http://localhost:3000/action', {
        method: 'post',
        body: JSON.stringify(body),
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',       // receive json
        },
    });
}

function App() {
    const dispatch = async (a: types.Action): Promise<void> => {
        await postit(a)
    }

    return (
        <FirestoreProvider firebase={firebase}>
            <Router>
                <div>
                    <nav>
                        <ul>
                            <li>
                                <Link to="/">Home</Link>
                            </li>
                        </ul>
                    </nav>
                    <Switch>
                        <Route path="/" exact>
                            <Home />
                        </Route>

                        <Route path="/p/:playerId" exact>
                            <PlayerPage dispatch={dispatch} />
                        </Route>

        <Route path="/p/:playerId/g/:gameId" exact>

            <GamePage dispatch={dispatch}/>
        </Route>
                    </Switch>
                </div>
            </Router>
        </FirestoreProvider>
        // <Route path="/p/:playerId/g/:gameId" />
        //     <Game/>
        // </Route>
    );
}

export default App;
