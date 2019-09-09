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

const collectionsRef: FirebaseFirestore.CollectionReference = db.collection('collections');
const actionLogRef: FirebaseFirestore.DocumentReference =
    collectionsRef.doc('actions').collection('logs').doc('omni');
const actionLogVersionsRef: FirebaseFirestore.CollectionReference =
    actionLogRef.collection('versions');
const historyLogRef: FirebaseFirestore.DocumentReference =
    collectionsRef.doc('history').collection('logs').doc('omni');
const historyLogVersionsRef: FirebaseFirestore.CollectionReference =
    historyLogRef.collection('versions');

// Create a new express application instance
const app: express.Application = express();
app.set('json spaces', 2)

type CollectionType = 'actions' | 'history';

function logMetaRef(c: CollectionType): FirebaseFirestore.DocumentReference {
    return db.collection('collections').doc(c)
        .collection('logs').doc('omni');
}

function logRef(c: CollectionType, version: number): FirebaseFirestore.DocumentReference {
    return logMetaRef(c).collection('versions').doc('' + version);
}

app.use(express.json());

// function messageIdToRef()

function logInit(): log.Log {
    return { versions: 0, derived: {} };
}

// let docRef = db.collection('users').doc('alovelace');

// let setAda = docRef.set({
//   first: 'Ada',
//   last: 'Lovelace',
//   born: 1815
// });

async function getLog(tx: FirebaseFirestore.Transaction, c: CollectionType): Promise<log.Log> {
    const logDoc = await tx.get(logMetaRef(c));
    if (!logDoc.exists) {
        return logInit();
    }
    return log.validate('Log')(logDoc.data());
}

function setLog(tx: FirebaseFirestore.Transaction, c: CollectionType, log: log.Log) {
    tx.set(logMetaRef(c), log);
}

async function getEntry(tx: FirebaseFirestore.Transaction, c: CollectionType,
    version: number): Promise<log.Entry> {
    const doc = await tx.get(logRef(c, version));
    if (!doc.exists) {
        throw Error('doc not found');
    }
    console.log(c, version);
    console.log(doc.data())
    return log.validate('Entry')(doc.data());
}

function setEntry(tx: FirebaseFirestore.Transaction, c: CollectionType, version: number, e: log.Entry) {
    tx.set(logRef(c, version), e);
}

async function getAction(tx: FirebaseFirestore.Transaction, version: number): Promise<Action> {
    const entry = await getEntry(tx, 'actions', version);
    return ValidateAction(JSON.parse(entry.body));
}

function setAction(tx: FirebaseFirestore.Transaction, version: number, action: Action) {
    setEntry(tx, 'actions', version, { body: JSON.stringify(action) });
}

async function getHistory(tx: FirebaseFirestore.Transaction, version: number): Promise<history.History> {
    if (version == -1) {
        return history.init();
    }
    const entry = await getEntry(tx, 'history', version);
    return history.validate('History')(JSON.parse(entry.body));
}

function setHistory(tx: FirebaseFirestore.Transaction, version: number, history: history.History) {
    setEntry(tx, 'history', version, { body: JSON.stringify(history) });
}


// function setEntry(tx: FirebaseFirestore.Transaction, c: CollectionType, log: log.Log) {
//     tx.set(logMetaRef(c), log);
// }


async function applyActionToHistory(tx: FirebaseFirestore.Transaction, action: Action, actionVersion: number): Promise<history.History> {
    const acc = await getHistory(tx, actionVersion - 1);
    return history.reduce(acc, action);
}

async function processAction(action: Action): Promise<void> {
    return await db.runTransaction(async (tx: FirebaseFirestore.Transaction): Promise<void> => {
        // Things that may be generated.
        let historyNext: { log: log.Log, next: history.History } | null = null;

        // Compute the action (no-op, we have it).
        const actionLog = await getLog(tx, 'actions');

        // Compute the history, if ready.
        if (actionLog.versions == (actionLog.derived['history'] || 0)) {
            historyNext = {
                log: await getLog(tx, 'history'),
                next: await applyActionToHistory(tx, action, actionLog.versions),
            }
        }

        // Commit the action.
        setLog(tx, 'actions', produce(actionLog, (draft) => {
            draft.versions++;
            if (historyNext !== null) {
                draft.derived['history'] = draft.versions;
            }
        }));
        setAction(tx, actionLog.versions, action);

        // Commit the history.
        if (historyNext !== null) {
            setLog(tx, 'history', produce(historyNext.log, (draft) => {
                draft.versions++;
            }));
            setHistory(tx, historyNext.log.versions, historyNext.next);
        }
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

app.get('/actions', async function(req: Request<Dictionary<string>>, res) {
    const meta = (await actionLogRef.get()).data();
    const versions = (await actionLogVersionsRef.get()).docs.map(q => JSON.parse(q.data().body));

    res.json({ meta, versions });
});

app.get('/history', async function(req: Request<Dictionary<string>>, res) {
    const meta = (await logMetaRef('history').get()).data();
    const versions = (await logMetaRef('history').collection('versions').get()).docs.map(
        q => JSON.parse(q.data().body));

    res.json({ meta, versions });
});

app.get('/project', async function(req: Request<Dictionary<string>>, res) {
    const lastVersion = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
        const log = await getLog(tx, 'history');
        return await getHistory(tx, log.versions - 1);
    });

    res.json(projectors.projectHistory(lastVersion.current));
});

async function project(tx: FirebaseFirestore.Transaction, history: history.History):void {
    
}

async function backfillAction(tx: FirebaseFirestore.Transaction): Promise<'DONE' | 'MORE'> {
    // Things that may be generated.
    let historyNext: { log: log.Log, next: history.History } | null = null;

    // Get action to process.
    const actionLog = await getLog(tx, 'actions');

    // Compute the history, if ready.
    if (actionLog.versions == (actionLog.derived['history'] || 0)) {
        return 'DONE';
    }

    const action = await getAction(tx, actionLog.derived['history'] || 0);

    historyNext = {
        log: await getLog(tx, 'history'),
        next: await applyActionToHistory(tx, action, actionLog.derived['history'] || 0),
    }

    // Commit the action.
    setLog(tx, 'actions', produce(actionLog, (draft) => {
        if (historyNext !== null) {
            const nextNumber = 1 + (draft.derived['history'] || 0)
            draft.derived['history'] = nextNumber;
        }
    }));

    // Commit the history.
    setLog(tx, 'history', produce(historyNext.log, (draft) => {
        draft.versions = 1 + (actionLog.derived['history'] || 0);
    }));
    setHistory(tx, actionLog.derived['history'] || 0, historyNext.next);
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
        const actionLog = await getLog(tx, 'actions');
        tx.set(logMetaRef('actions'), produce(actionLog, (draft) => {
            delete draft.derived['history'];
        }));
        tx.delete(logMetaRef('history'));
    });
    res.status(200);
    res.send('ok')
});

const port = process.env.PORT || 3000;
app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`);
});
