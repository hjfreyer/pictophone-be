import React, { useState, useEffect } from 'react';
import './App.css';

import firebase from 'firebase/app';
import 'firebase/auth';
import 'firebase/firestore';
import { FirestoreProvider, FirestoreDocument } from 'react-firestore';
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth';
import {
    BrowserRouter as Router, Switch, useParams, useLocation, Route, Redirect
} from "react-router-dom";

import GameView from './GameView'
import Home from './Home'
import Config from './config'
import * as types from './types';
import { validate } from './types.validator'

const config = {
    apiKey: "AIzaSyCzMg7Q2ByK5UxUd_x730LT8TmOmbA61MU",
    authDomain: "pictophone-app.firebaseapp.com",
    databaseURL: "https://pictophone-app.firebaseio.com",
    projectId: "pictophone-app",
    storageBucket: Config().storageBucket,
    messagingSenderId: "837882351009",
    appId: "1:837882351009:web:9056a6b26d58fb373ecfe0"
};

const app = firebase.initializeApp(config);
const auth = app.auth()

const uiConfig = {
    // Popup signin flow rather than redirect flow.
    signInFlow: 'popup',
    signInOptions: [
        firebase.auth.GoogleAuthProvider.PROVIDER_ID,
        firebase.auth.EmailAuthProvider.PROVIDER_ID,
    ],
    callbacks: {
        // Avoid redirects after sign-in.
        signInSuccessWithAuthResult: () => false
    }
};

const Landing: React.FC = () => {
    return <React.Fragment>
        <h1>Hey it's Pictophone!</h1>
        <p>Care to sign in?</p>
        <StyledFirebaseAuth uiConfig={uiConfig} firebaseAuth={firebase.auth()} />
    </React.Fragment>
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
            submission: { kind: "word", word }
        }
    })

    const submitDrawing = (drawing: types.Drawing) => dispatch({
        action: {
            kind: "make_move",
            playerId: playerId!,
            gameId: gameId!,
            submission: { kind: "drawing", drawing: { id: 'request/0' } }
        },
        uploads: {
            'request/0': { kind: "drawing", drawing }
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
    await fetch(Config().backendAddr + '/action', {
        method: 'post',
        body: JSON.stringify(body),
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',       // receive json
        },
    });
}

type AuthInfo = { ready: false } | { ready: true, user: firebase.User | null }

const Content: React.FC = () => {
    const location = useLocation()
    const [authInfo, setAuthInfo] = useState<AuthInfo>({ ready: false })

    useEffect(() => {
        return auth.onAuthStateChanged(user => setAuthInfo({ ready: true, user }))
    }, [])

    if (!authInfo.ready) {
        return <div>Loading!</div>
    }

    (window as any)['signout'] = () => auth.signOut()

    if (!authInfo.user) {
        if (location.pathname !== '/') {
            return <Redirect to="/" />
        } else {
            return <Landing />
        }
    }

    const dispatch = async (a: types.ActionRequest): Promise<void> => {
        await postit(a)
    }

    return <Switch>
        <Route path="/" exact>
            {
                authInfo.user
                    ? <Home playerId={authInfo.user.uid} dispatch={dispatch} />
                    : <Landing />
            }
        </Route>

        <Route path="/g/:gameId" exact>
            <GamePage playerId={authInfo.user.uid} dispatch={dispatch} />
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
