import express from 'express';
import { Request, Dictionary } from 'express-serve-static-core';

import admin from 'firebase-admin';

import Action from './types/Action';
import ValidateAction from './types/Action.validator';

admin.initializeApp({
    credential: admin.credential.applicationDefault()
});


const db = admin.firestore();

const collectionsRef : FirebaseFirestore.CollectionReference = db.collection('collections');
const actionLogRef : FirebaseFirestore.DocumentReference = 
    collectionsRef.doc('actions').collection('logs').doc('omni');
const actionLogVersionsRef : FirebaseFirestore.CollectionReference = 
    actionLogRef.collection('versions');
const historyLogRef : FirebaseFirestore.DocumentReference = 
    collectionsRef.doc('history').collection('logs').doc('omni');
const historyLogVersionsRef : FirebaseFirestore.CollectionReference = 
    historyLogRef.collection('versions');

// Create a new express application instance
const app: express.Application = express();

type CollectionType = 'actions' | 'history';

function logMetaRef(c : CollectionType): FirebaseFirestore.DocumentReference {
    return db.collection('collections').doc(c)
        .collection('logs').doc('omni');
}

function logRef(c : CollectionType, version: number): FirebaseFirestore.DocumentReference {
    return logMetaRef(c).collection('versions').doc('' + version);
}

app.use(express.json());

type MessageId = {
    collection: string,
    version: number,
};

// function messageIdToRef()

type Log = {
    versions: number
}

function logInit(): Log {
    return {versions: 0};
}

type Response = {};

type History = {};

function historyInit(): History {
    return {};
}

function historyReduce(acc: History, action: Action): [History, Response] {
    return [{}, {}];
}


// let docRef = db.collection('users').doc('alovelace');

// let setAda = docRef.set({
//   first: 'Ada',
//   last: 'Lovelace',
//   born: 1815
// });

async function processAction(action : Action): Promise<Response> {
    return await db.runTransaction(async (tx: FirebaseFirestore.Transaction) : Promise<Response> => {
        const actionLog : Log = (await tx.get(logMetaRef('actions'))).data() as Log || logInit();
        const historyLog : Log = (await tx.get(logMetaRef('history'))).data() as Log || logInit();

        const historyAcc : History = historyLog.versions == 0 ? historyInit() : (
            await tx.get(logRef('history', historyLog.versions - 1))).data()!;

        const [historyNext, resp] = historyReduce(historyAcc, action);

        tx.set(logMetaRef('actions'), {...actionLog, versions: actionLog.versions + 1});
        tx.set(logRef('actions', actionLog.versions), { action: action });

        tx.set(logMetaRef('history'), {...historyLog, versions: historyLog.versions + 1});
        tx.set(logRef('history', historyLog.versions), historyNext);

        return resp;
    });
}

app.post('/', function (req : Request<Dictionary<string>>, res) {
    let action : Action;
    try {
        action = ValidateAction(req.body);
    } catch (e) {
        res.status(400);
        res.send(e.message);
        return;
    }

    processAction(action).then(() => res.json({bar:'qux'}));
});

app.get('/actions', async function (req : Request<Dictionary<string>>, res) {
    const meta = (await actionLogRef.get()).data();
    const versions = (await actionLogVersionsRef.get()).docs.map(q=> q.data());
    
    res.json({meta, versions});
});

app.get('/history', async function (req : Request<Dictionary<string>>, res) {
    const meta = (await logMetaRef('history').get()).data();
    const versions = (await logMetaRef('history').collection('versions').get()).docs.map(q=> q.data());
    
    res.json({meta, versions});
});

const port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log(`Example app listening on port ${port}!`);
});
