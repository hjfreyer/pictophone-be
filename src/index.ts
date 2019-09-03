import express from 'express';
import { Request, Dictionary } from 'express-serve-static-core';

import admin from 'firebase-admin';

import Action from './types/Action';
import ValidateAction from './types/Action.validator';
import * as history from './reducers/history';

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
app.set('json spaces', 2)

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


// let docRef = db.collection('users').doc('alovelace');

// let setAda = docRef.set({
//   first: 'Ada',
//   last: 'Lovelace',
//   born: 1815
// });

async function processAction(action : Action): Promise<void> {
    return await db.runTransaction(async (tx: FirebaseFirestore.Transaction) : Promise<void> => {
        const actionLog : Log = (await tx.get(logMetaRef('actions'))).data() as Log || logInit();
        const historyLog : Log = (await tx.get(logMetaRef('history'))).data() as Log || logInit();

        const historyAcc : history.History = historyLog.versions == 0 ? history.init() : (
            await tx.get(logRef('history', historyLog.versions - 1))).data()! as history.History;

        tx.set(logMetaRef('actions'), {...actionLog, versions: actionLog.versions + 1});
        tx.set(logRef('actions', actionLog.versions), { action: action });

        if (historyLog.versions == actionLog.versions) {
            const historyNext = history.reduce(historyAcc, action);
            tx.set(logMetaRef('history'), {...historyLog, versions: historyLog.versions + 1});
            tx.set(logRef('history', historyLog.versions), historyNext);
        }

        return;
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

app.post('/backfill_history', async function (req : Request<Dictionary<string>>, res) {
    while (true) {
        const status = await db.runTransaction(async (tx: FirebaseFirestore.Transaction) : Promise<'DONE' | 'MORE'> => {
            const actionLog : Log = (await tx.get(logMetaRef('actions'))).data() as Log || logInit();
            const historyLog : Log = (await tx.get(logMetaRef('history'))).data() as Log || logInit();

            if (historyLog.versions >= actionLog.versions) {
                return 'DONE';
            }

            const action : Action = ValidateAction((await tx.get(logRef('actions', historyLog.versions))).data()!.action);

            const historyAcc : history.History = historyLog.versions == 0 ? history.init() : (
                await tx.get(logRef('history', historyLog.versions - 1))).data()! as history.History;

            tx.set(logMetaRef('history'), {...historyLog, versions: historyLog.versions + 1});

            console.log(historyAcc, action)
            const historyNext = history.reduce(historyAcc, action);
            console.log(historyNext)

            tx.set(logMetaRef('history'), {...historyLog, versions: historyLog.versions + 1});
            tx.set(logRef('history', historyLog.versions), historyNext);

            return 'MORE';
        });

        if (status == 'DONE') {
            res.status(200);
            res.send('ok')
            return;
        }
    }
});


app.post('/clear_history', async function (req : Request<Dictionary<string>>, res) {
    const metaDel = logMetaRef('history').delete();
    const versionsDel = logMetaRef('history').collection('versions').listDocuments().then(val => {
        val.map((val) => {
            val.delete()
        })
    })
    await metaDel;
    await versionsDel;
    res.status(200);
    res.send('ok')
});

const port = process.env.PORT || 3000;
app.listen(port, function () {
  console.log(`Example app listening on port ${port}!`);
});
