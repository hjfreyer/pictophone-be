import express from 'express';
import { Request, Dictionary } from 'express-serve-static-core';

import admin from 'firebase-admin';
import deepEqual from 'deep-equal';
import produce from 'immer';

import * as actions from './actions';
import * as history from './history';
import * as log from './log';
import * as projection from './projection';

import { validate } from './types.validator';

admin.initializeApp({
    credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

// Create a new express application instance
const app: express.Application = express();
app.set('json spaces', 2)
app.use(express.json());

type ViewType = 'root' | 'history' | 'projection' | 'materialize';

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
    return validate('Log')(logDoc.data());
}

function setLog(tx: FirebaseFirestore.Transaction, log: log.Log) {
    tx.set(logRef, log);
}

async function getView(tx: FirebaseFirestore.Transaction, version: number, v: ViewType): Promise<log.Entry> {
    const doc = await tx.get(viewRef(version, v));
    if (!doc.exists) {
        throw Error('doc not found');
    }
    return validate('Entry')(doc.data());
}

function setView(tx: FirebaseFirestore.Transaction, version: number, v: ViewType, e: log.Entry) {
    tx.set(viewRef(version, v), e);
}

async function getAction(tx: FirebaseFirestore.Transaction, version: number): Promise<actions.Action> {
    const entry = await getView(tx, version, 'root');
    return validate('Action')(JSON.parse(entry.body));
}

function setAction(tx: FirebaseFirestore.Transaction, version: number, action: actions.Action) {
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

async function getProjection(tx: FirebaseFirestore.Transaction, version: number): Promise<projection.HistoryProjection> {
    const entry = await getView(tx, version, 'projection');
    return validate('HistoryProjection')(JSON.parse(entry.body));
}

function setProjection(tx: FirebaseFirestore.Transaction, version: number, proj: projection.HistoryProjection) {
    setView(tx, version, 'projection', { body: JSON.stringify(proj) });
}

function getViewVersion(l: log.Log, v: ViewType): number {
    return l.views[v] || 0;
}

function incrementViewVersion(l: log.Log, v: ViewType) {
    l.views[v] = 1 + (l.views[v] || 0);
}

function setViewVersion(l: log.Log, v: ViewType, version: number) {
    l.views[v] = version;
}

async function applyActionToHistory(tx: FirebaseFirestore.Transaction,
    action: actions.Action, actionVersion: number): Promise<history.History> {
    const acc = await getHistory(tx, actionVersion - 1);
    return history.reduce(acc, action);
}

type Diff = {
    eraseKeys: string[]
    setKeys: { [key: string]: any }
}

// TODO: this is wrong.
function diffProjections(before: projection.HistoryProjection, after: projection.HistoryProjection): Diff {
    const res: Diff = {
        eraseKeys: [],
        setKeys: {},
    }
    for (const collectionName in after) {
        const collection = (after as any)[collectionName];
        for (const key in collection) {
            if (!deepEqual((before as any)[collectionName][key], collection[key])) {
                res.setKeys[key] = collection[key];
            }
        }
    }
    return res;
}

function applyDiff(tx: FirebaseFirestore.Transaction, prefix: string, diff: Diff) {
    for (const key in diff.setKeys) {
        console.log(prefix+key)
        tx.set(db.doc(prefix + key), diff.setKeys[key]);
    }
}

async function processAction(action: actions.Action): Promise<void> {
    return await db.runTransaction(async (tx: FirebaseFirestore.Transaction): Promise<void> => {
        // Things that may be generated.
        let historyNext: history.History | null = null;
        let projectionNext: projection.HistoryProjection | null = null;
        let materialized = false;

        const l = await getLog(tx);
        const nextVersion = getViewVersion(l, 'root');

        // Compute the history, if ready.
        if (nextVersion === getViewVersion(l, 'history')) {
            historyNext = await applyActionToHistory(tx, action, nextVersion);
        }

        // Compute the projection, if ready.
        if (historyNext !== null && nextVersion === getViewVersion(l, 'projection')) {
            projectionNext = projection.projectHistory(historyNext);
        }

        // Materialize the projection, if ready. Must come last.
        const lastMaterialized = getViewVersion(l, 'materialize');
        if (projectionNext !== null && nextVersion === lastMaterialized) {
            const prevProj = (lastMaterialized - 1) < 0 ? projection.init()
                : await getProjection(tx, lastMaterialized - 1);
            applyDiff(tx, 'projections/v0/', diffProjections(prevProj, projectionNext));
            materialized = true;
        }

        // Commit the action.
        setAction(tx, getViewVersion(l, 'root'), action);

        // Commit the history.
        if (historyNext !== null) {
            setHistory(tx, nextVersion, historyNext);
        }

        if (projectionNext !== null) {
            setProjection(tx, nextVersion, projectionNext);
        }

        // Commit the log.
        setLog(tx, produce(l, (draft) => {
            const newLen = 1 + nextVersion;
            setViewVersion(draft, 'root', newLen);
            if (historyNext !== null) {
                setViewVersion(draft, 'history', newLen);
            }
            if (projectionNext !== null) {
                setViewVersion(draft, 'projection', newLen);
            }
            if (materialized) {
                setViewVersion(draft, 'materialize', newLen);
            }
        }));
    });
}

app.post('/', function(req: Request<Dictionary<string>>, res) {
    let action: actions.Action;
    try {
        action = validate('Action')(req.body);
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
    root: actions.Action
    history: history.History | null
    proj: projection.HistoryProjection | null
}

app.get('/debug', async function(req: Request<Dictionary<string>>, res) {
    const dbi = await db.runTransaction(async (tx: FirebaseFirestore.Transaction): Promise<DebugInfo> => {
        const l = await getLog(tx);
        const vp = Array.from({ length: l.views['root'] }, async (_: unknown, idx: number): Promise<VersionDebug> => {
            const action = getAction(tx, idx);
            const history = idx < l.views['history'] ? getHistory(tx, idx) : Promise.resolve(null);
            const proj = idx < l.views['projection'] ? getProjection(tx, idx) : Promise.resolve(null);

            return {
                root: await action,
                history: await history,
                proj: await proj,
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
    const projectionVersion = getViewVersion(l, 'projection');

    if (projectionVersion < historyVersion) {
        setProjection(tx, projectionVersion, projection.projectHistory(
            await getHistory(tx, projectionVersion)));
        setLog(tx, produce(l, (draft) => {
            incrementViewVersion(draft, 'projection');
        }));
        return 'MORE';
    }

    if (historyVersion < nextVersion) {
        const action = await getAction(tx, historyVersion);
        const historyNext = await applyActionToHistory(tx, action, historyVersion);
        setHistory(tx, nextVersion, historyNext);

        // Commit the log.
        setLog(tx, produce(l, (draft) => {
            incrementViewVersion(draft, 'history');
        }));
        return 'MORE';
    }

    return 'DONE';
}

app.post('/backfill', async function(req: Request<Dictionary<string>>, res) {
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
