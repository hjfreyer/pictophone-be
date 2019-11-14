import React, { useState } from 'react';
import logo from './logo.svg';
import './App.css';

import firebase from '@firebase/app';
import '@firebase/firestore';
import { FirestoreProvider, FirestoreCollection, FirestoreDocument } from 'react-firestore';

import {
    BrowserRouter as Router,
    Switch,
    useParams, useHistory, useLocation,
    Route, Link, match, RouteComponentProps
} from "react-router-dom";
import * as types from './types';
import { validate } from './types.validator'

import GameView from './GameView'
import Home from './Home'
import Config from './config'

const config = {
    projectId: 'pictophone-app',
};

const app = firebase.initializeApp(config);
const db = app.firestore!();

const SignIn: React.FC = () => {
    const [id, setId] = useState<string>('')
    const history = useHistory()

    return <div>
        <h1>Sign In</h1>

        <form onSubmit={() => history.push('?u=' + id)}>
            <input
                type="text" value={id} onChange={e => setId(e.target.value)} />
            <button>Submit</button>
        </form>
    </div>
}

type GamePageParams = {
    playerId: string
    dispatch: (a: types.ActionRequest) => void
}

const GamePage: React.FC<GamePageParams> = ({ playerId, dispatch }) => {
    const { gameId } = useParams()

    const startGame = () => dispatch({
        action: {
            kind: "start_game",
            playerId: playerId!,
            gameId: gameId!
        }
    })

    const submitWord = (word: string) => dispatch({
        action: {
            kind: "make_move",
            playerId: playerId!,
            gameId: gameId!,
            submission: {kind: "word", word}
        }
    })

     const submitDrawing = (drawing: types.Drawing) => dispatch({
        action: {
            kind: "make_move",
            playerId: playerId!,
            gameId: gameId!,
            submission: {kind: "drawing", drawing: {id: 'request/0'}}
        },
        uploads: {
            'request/0': {kind: "drawing", drawing}
        }
    })

    return <FirestoreDocument
        path={`versions/0/players/${playerId}/games/${gameId}`}
        render={({ isLoading, data }: { isLoading: boolean, data: any }) => {
            if (isLoading) {
                return <span>Loading...</span>;
            }
            const pg: types.PlayerGame = validate('PlayerGame')(data);
            return <GameView
                playerGame={pg}
                startGame={startGame}
                submitWord={submitWord}
                submitDrawing={submitDrawing}
            />
        }}
    />
}




async function postit(body: types.ActionRequest): Promise<void> {
    const res = await fetch(Config().backendAddr + '/action', {
        method: 'post',
        body: JSON.stringify(body),
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',       // receive json
        },
    });
}

const Content: React.FC = () => {
    const urlParams = new URLSearchParams(useLocation().search);
    const playerId = urlParams.get('u');

    if (playerId === null) {
        return <SignIn />
    }

    const dispatch = async (a: types.ActionRequest): Promise<void> => {
        await postit(a)
    }

    return <Switch>
        <Route path="/" exact>
            <Home playerId={playerId} dispatch={dispatch} />
        </Route>

        <Route path="/g/:gameId" exact>
            <GamePage playerId={playerId} dispatch={dispatch} />
        </Route>
    </Switch>
}

const App: React.FC = () => {
    return <FirestoreProvider firebase={firebase}>
        <Router>
            <Content />
        </Router>
    </FirestoreProvider>
}

export default App;
