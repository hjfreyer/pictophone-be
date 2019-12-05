import firebase from 'firebase/app'
import 'firebase/auth'
import 'firebase/firestore'
import React, { useEffect, useState } from 'react'
import StyledFirebaseAuth from 'react-firebaseui/StyledFirebaseAuth'
import { FirestoreDocument, FirestoreProvider } from 'react-firestore'
import { BrowserRouter as Router, Redirect, Route, Switch, useLocation, useParams } from "react-router-dom"
import './App.css'
import * as base from './base'
import Config from './config'
import GameView from './GameView'
import Home from './Home'
import Action from './model/Action'
import validateExport from './model/Export.validator'
import { Drawing, Upload, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import Export from './model/Export'

const config = {
    apiKey: "AIzaSyCzMg7Q2ByK5UxUd_x730LT8TmOmbA61MU",
    authDomain: "pictophone-app.firebaseapp.com",
    databaseURL: "https://pictophone-app.firebaseio.com",
    projectId: "pictophone-app",
    storageBucket: Config().storageBucket,
    messagingSenderId: "837882351009",
    appId: "1:837882351009:web:9056a6b26d58fb373ecfe0"
}

const app = firebase.initializeApp(config)
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
}

const Landing: React.FC = () => {
    return <React.Fragment>
        <h1>Hey it's Pictophone!</h1>
        <p>Care to sign in?</p>
        <StyledFirebaseAuth uiConfig={uiConfig} firebaseAuth={firebase.auth()} />
    </React.Fragment>
}

type GamePageProps = {
    playerId: string
    dispatch: base.Dispatch
}

const GamePage: React.FC<GamePageProps> = ({ playerId, dispatch }) => {
    const { gameId } = useParams()

    const startGame = () => dispatch.action({
        version: base.MODEL_VERSION,
        kind: "start_game",
        playerId: playerId!,
        gameId: gameId!
    })

    const submitWord = (word: string) => dispatch.action({
        version: base.MODEL_VERSION,
        kind: "make_move",
        playerId: playerId!,
        gameId: gameId!,
        submission: { kind: "word", word }
    })

    const submitDrawing = async (drawing: Drawing) => {
        const resp = await dispatch.upload({ kind: 'drawing', ...drawing })
        await dispatch.action({
            version: base.MODEL_VERSION,
            kind: "make_move",
            playerId: playerId!,
            gameId: gameId!,
            submission: { kind: "drawing", drawingId: resp.id }
        })
    }

    return <FirestoreDocument
        path={`versions/${base.MODEL_VERSION}/players/${playerId}/games/${gameId}`}
        render={({ isLoading, data }: { isLoading: boolean, data: any }) => {
            if (isLoading) {
                return <span>Loading...</span>
            }
            const pgAny: Export = validateExport(data)
            return <GameView
                playerGame={pgAny}
                startGame={startGame}
                submitWord={submitWord}
                submitDrawing={submitDrawing}
            />
        }}
    />
}

async function postAction(body: Action): Promise<void> {
    await fetch(Config().backendAddr + '/action', {
        method: 'post',
        body: JSON.stringify(body),
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',       // receive json
        },
    })
}

async function postUpload(u: Upload): Promise<UploadResponse> {
    const resp = await fetch(Config().backendAddr + '/upload', {
        method: 'post',
        body: JSON.stringify(u),
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',       // receive json
        },
    })
    return validateRpc('UploadResponse')(await resp.json())
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

    const dispatch: base.Dispatch = {
        action: postAction,
        upload: postUpload,
    }

    return <Switch>
        <Route path="/" exact>
            {
                authInfo.user
                    ? <Home playerId={authInfo.user.uid}
                        defaultDisplayName={authInfo.user.displayName || ''}
                        dispatch={dispatch} />
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

export default App
