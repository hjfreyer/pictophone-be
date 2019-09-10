import express from 'express';
import { Request, Dictionary } from 'express-serve-static-core';

import admin from 'firebase-admin';
import produce from 'immer';

import Action from './types/Action';
import ValidateAction from './types/Action.validator';
import * as history from './reducers/history';
import * as projectors from './projectors';

import * as log from './types/log.validator';

admin.initializeApp({
    credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

// Create a new express application instance
const app: express.Application = express();
app.set('json spaces', 2)
app.use(express.json());

type ViewType = 'root' | 'history';

const logRef = db.doc('colections/root/logs/omni');

function viewRef(version: number, view: ViewType): FirebaseFirestore.DocumentReference {
    return logRef.collection('versions').doc('' + version).collection('views').doc(view);
}

function logInit(): log.Log {
    return { views: {} };
}

async function getLog(tx: FirebaseFirestore.Transaction): Promise<log.Log> {
    const logDoc = await tx.get(logRef);
    if (!logDoc.exists) {
        return logInit();
    }
    return log.validate('Log')(logDoc.data());
}

function setLog(tx: FirebaseFirestore.Transaction, log: log.Log) {
    tx.set(logRef, log);
}

async function getView(tx: FirebaseFirestore.Transaction, version: number, v: ViewType): Promise<log.Entry> {
    const doc = await tx.get(viewRef(version, v));
    if (!doc.exists) {
        throw Error('doc not found');
    }
    return log.validate('Entry')(doc.data());
}

function setView(tx: FirebaseFirestore.Transaction, version: number, v: ViewType, e: log.Entry) {
    tx.set(viewRef(version, v), e);
}

async function getAction(tx: FirebaseFirestore.Transaction, version: number): Promise<Action> {
    const entry = await getView(tx, version, 'root');
    return ValidateAction(JSON.parse(entry.body));
}

function setAction(tx: FirebaseFirestore.Transaction, version: number, action: Action) {
    setView(tx, version, 'root', { body: JSON.stringify(action) });
}

async function getHistory(tx: FirebaseFirestore.Transaction, version: number): Promise<history.History> {
    if (version == -1) {
        return history.init();
    }
    const entry = await getView(tx, version, 'history');
    return history.validate('History')(JSON.parse(entry.body));
}

function setHistory(tx: FirebaseFirestore.Transaction, version: number, history: history.History) {
    setView(tx, version, 'history', { body: JSON.stringify(history) });
}

function getViewVersion(l: log.Log, v: ViewType): number {
    return l.views[v] || 0;
}

function incrementViewVersion(l: log.Log, v: ViewType) {
    l.views[v] = 1 + (l.views[v] || 0);
}

async function applyActionToHistory(tx: FirebaseFirestore.Transaction, action: Action, actionVersion: number): Promise<history.History> {
    const acc = await getHistory(tx, actionVersion - 1);
    return history.reduce(acc, action);
}

async function processAction(action: Action): Promise<void> {
    return await db.runTransaction(async (tx: FirebaseFirestore.Transaction): Promise<void> => {
        // Things that may be generated.
        let historyNext: history.History | null = null;

        const l = await getLog(tx);
        const nextVersion = getViewVersion(l, 'root');

        // Compute the history, if ready.
        if (nextVersion === getViewVersion(l, 'history')) {
            historyNext = await applyActionToHistory(tx, action, nextVersion);
        }

        // Commit the action.
        setAction(tx, getViewVersion(l, 'root'), action);

        // Commit the history.
        if (historyNext !== null) {
            setHistory(tx, nextVersion, historyNext);
        }

        // Commit the log.
        setLog(tx, produce(l, (draft) => {
            incrementViewVersion(draft, 'root');
            if (historyNext !== null) {
                incrementViewVersion(draft, 'history');
            }
        }));
    });
}

app.post('/', function(req: Request<Dictionary<string>>, res) {
    let action: Action;
    try {
        action = ValidateAction(req.body);
    } catch (e) {
        res.status(400);
        res.send(e.message);
        return;
    }

    processAction(action).then(() => res.json({}));
});

type DebugInfo = {
    l: log.Log
    v: VersionDebug[]
}

type VersionDebug = {
    root: Action
    history: history.History | null
}

app.get('/debug', async function(req: Request<Dictionary<string>>, res) {
    const dbi = await db.runTransaction(async (tx: FirebaseFirestore.Transaction): Promise<DebugInfo> => {
        const l = await getLog(tx);
        const vp = Array.from({ length: l.views['root'] }, async (_: unknown, idx: number): Promise<VersionDebug> => {
            const action = getAction(tx, idx);
            const history = idx < l.views['history'] ? getHistory(tx, idx) : Promise.resolve(null);

            return {
                root: await action,
                history: await history,
            }
        });
        return { l, v: await Promise.all(vp) };
    });

    res.json(dbi);
});

async function backfillAction(tx: FirebaseFirestore.Transaction): Promise<'DONE' | 'MORE'> {
    const l = await getLog(tx);
    const nextVersion = getViewVersion(l, 'root');
    const historyVersion = getViewVersion(l, 'history');

    // Compute the history, if ready.
    if (nextVersion === historyVersion) {
        return 'DONE';
    }

    const action = await getAction(tx, historyVersion);
    const historyNext = await applyActionToHistory(tx, action, historyVersion);

    // Commit the history.
    setHistory(tx, nextVersion, historyNext);

    // Commit the log.
    setLog(tx, produce(l, (draft) => {
            incrementViewVersion(draft, 'history');
    }));
    return 'MORE';
}

app.post('/backfill_history', async function(req: Request<Dictionary<string>>, res) {
    while (true) {
        const status = await db.runTransaction(backfillAction);
        if (status == 'DONE') {
            res.status(200);
            res.send('ok')
            return;
        }
    }
});

app.post('/clear_history', async function(req: Request<Dictionary<string>>, res) {
    await db.runTransaction(async (tx: FirebaseFirestore.Transaction): Promise<void> => {
        const l = await getLog(tx);
        setLog(tx, produce(l, (draft) => {
            delete draft.views['history'];
        }));
    });
    res.status(200);
    res.send('ok')
});

const port = process.env.PORT || 3000;
app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`);
});
