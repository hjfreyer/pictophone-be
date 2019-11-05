import React, { useState } from 'react';
import logo from './logo.svg';
import './App.css';


import firebase from '@firebase/app';
import '@firebase/firestore';
import { FirestoreProvider, FirestoreCollection, FirestoreDocument } from 'react-firestore';

import { BrowserRouter as Router, Route, Link, match, RouteComponentProps } from "react-router-dom";
import * as types from './types';
import { validate } from './types.validator'
import { Drawer } from './Drawer';

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

    return <div>
        <h1>Home</h1>
        Username <input
            type="text" value={id} onChange={e => setId(e.target.value)} />
        <Link to={'/u/' + id}><button>Submit</button></Link>
    </div>
}

type UserParams = {
    playerId: string
}

function User({ match: { params: { playerId } } }: RouteComponentProps<UserParams>): JSX.Element {
    return (
        <div>
            <h1>User page for {playerId}</h1>
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
                                            <Link to={`/u/${playerId}/g/${r.id}`}>{r.id}</Link></div>))}
                                </div>
                        }
                    </div>
                )} />
        </div>
    )
}


type GameParams = {
    playerId: string
    gameId: string
}

function Game({ match: { params: { playerId, gameId } } }: RouteComponentProps<GameParams>): JSX.Element {
    return (
        <div>
            <FirestoreDocument
                path={`versions/0/players/${playerId}/games/${gameId}`}
                render={({ isLoading, data }: { isLoading: boolean, data: any }) => {
                    if (isLoading) {
                        return <span>Loading...</span>;
                    }
                    const pg: types.PlayerGame = validate('PlayerGame')(data);
                    return <GameView {...pg} />
                }}
            />
        </div>
    )
}
 // <div>
            //     State: {state}
            // </div>
const GameView: React.FC<types.PlayerGame> = ({ playerIds }) => {
    return (
        <div>
            <div>
                Players: {playerIds.map((p, idx) => <span key={idx}>{p}</span>)}
            </div>
           
        </div>
    )
}

function App() {
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

                    <Route path="/" exact component={Home} />
                    <Route path="/draw" exact component={Drawer} />
                    <Route path="/u/:playerId" exact component={User} />
                    <Route path="/u/:playerId/g/:gameId" component={Game} />
                </div>
            </Router>
        </FirestoreProvider>
    );
}

export default App;
