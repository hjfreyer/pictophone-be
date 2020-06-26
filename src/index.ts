import { CollectionReference, DocumentReference, Firestore } from '@google-cloud/firestore'
import { strict as assert } from 'assert'
import cors from 'cors'
import deepEqual from 'deep-equal'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import produce from 'immer'
import * as ixa from "ix/asynciterable"
import * as ix from "ix/iterable"
import * as ixop from "ix/iterable/operators"
import * as ixaop from "ix/asynciterable/operators"
import { applyChangesSimple, diffToChange, getActionId } from './base'
import * as db from './db'
import * as diffs from './diffs'
import { Change, Diff, Item, item, Key } from './interfaces'
import * as model1_0 from './model/1.0'
import { validate as validate1_0 } from './model/1.0.validator'
import * as model1_1 from './model/1.1'
import * as state1_1_1 from './model/1.1.1'
import { validate as validate1_1_1 } from './model/1.1.1.validator'
import { validate as validate1_1 } from './model/1.1.validator'
import * as readables from './readables'
// import {
//     //AnyAction, AnyError, CollectionId,
//     // deleteTable,
//     // Reference
// } from './schema'
import { SavedAction, AnyAction, AnyError, ReferenceGroup, Pointer } from './model'
import { validate as validateSchema } from './model/index.validator'
import * as util from './util'
import { Defaultable, defaultable, Option, option, Result, result } from './util'
import { OptionData } from './util/option'
// import { REVISION as REVISION1_1_1 } from './logic/1.1.1'
// import { REVISION as REVISION1_2_0 } from './logic/1.2.0'
import * as logic1_1_1 from './logic/1.1.1'
import * as logic1_2_0 from './logic/1.2.0'
import * as fw from './framework';
import { OperatorAsyncFunction, OperatorFunction } from 'ix/interfaces'
import { ResultData } from './util/result'
import { dirname, basename } from 'path'
import asyncHandler from 'express-async-handler';

admin.initializeApp({
    credential: admin.credential.applicationDefault()
})

const fsDb = admin.firestore()

// Create a new express application instance
const app: express.Application = express()
app.set('json spaces', 2)
app.use(express.json())

const port = process.env.PORT || 3000
app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`)
})

const VALIDATORS = {
    '1.0': validate1_0,
    '1.1': validate1_1,
    '1.1.1': validate1_1_1,
}

export interface UnifiedInterface {
    '1.0': ResultData<Interface1_0, model1_0.Error>
    '1.1': ResultData<Interface1_1, model1_1.Error>
}

export interface Interface1_0 {
    playerGames: Item<model1_0.PlayerGame>[]
}

export interface Interface1_1 {
    playerGames: Item<model1_1.PlayerGame>[]
}

function compareInterfaces(expected: UnifiedInterface, actual: UnifiedInterface) {
    if (!deepEqual(expected, actual)) {
        console.log("skew between implementation versions: ", expected, actual)
    }
}

export async function getCurrentRefGroup(db: db.Database, refId: string): Promise<ReferenceGroup> {
    if (refId.endsWith("/*")) {
        const res: ReferenceGroup = {
            kind: 'collection',
            id: dirname(refId),
            members: {},
        }

        const collection = await db.tx.get(db.db.collection(dirname(refId)));
        for (const doc of collection.docs) {
            const ptr = validateSchema('Pointer')(doc.data())
            res.members[doc.id] = {
                kind: 'single',
                actionId: ptr.actionId,
            }
        }
        return res;
    } else {
        return option.from(await db.getRaw(refId))
            .map(validateSchema('Pointer'))
            .map((p): ReferenceGroup => ({ kind: 'single', actionId: p.actionId }))
            .orElse(() => ({ kind: 'none' }))
    }
}

function handleAction(action: AnyAction): Promise<Result<null, AnyError>> {
    return db.runTransaction(fsDb)(async (db: db.Database): Promise<Result<null, AnyError>> => {
        const refIds = await logic1_1_1.REVISION.getNeededReferenceIds(db, action)

        const parents: Record<string, ReferenceGroup> = {}
        for (const refId of refIds) {
            parents[refId] = await getCurrentRefGroup(db, refId)
        }

        const savedAction: SavedAction = (() => {
            switch (action.version) {
                case '1.0':
                    return { parents, version: action.version, action: action.action }
                case '1.1':
                    return { parents, version: action.version, action: action.action }
            }
        })();
        const actionId = getActionId(savedAction);

        const res = await logic1_1_1.REVISION.integrate(db, savedAction)

        db.tx.set(db.db.doc(actionId), savedAction)
        for (const refId of res.impactedReferenceIds) {
            db.tx.set(db.db.doc(refId), { actionId })
        }

        return res.result[action.version]
    })
}

async function handleRefacetForAction(actionId: string): Promise<void> {
    await db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {

        const facetIds = await logic1_2_0.getAffectedFacets(db, { kind: 'replay', actionId })
        for (const facetId of facetIds) {
            const newPointer: Pointer = option.from(await db.getRaw(facetId))
                .map(validateSchema('Pointer'))
                .map(ptr => ({
                    actionId: ptr.actionId < actionId ? actionId : ptr.actionId
                }))
                .orElse(() => ({ actionId }))

            db.tx.set(db.db.doc(facetId), newPointer);
        }
    })
}

function listGameRefs(db: db.Database): AsyncIterable<string> {
    return ixa.from(db.tx.get(db.db.collection('games'))).pipe(
        ixaop.flatMap(snapshot => ixa.from(snapshot.docs)),
        ixaop.map(doc => doc.ref.path)
    )
}

async function getNextAction(startAfter: Option<string>): Promise<Option<[string, SavedAction]>> {
    const snapshot = await option.from(startAfter)
        .map(startAfter => fsDb
            .collectionGroup('actions')
            .orderBy(admin.firestore.FieldPath.documentId())
            .startAfter(fsDb.doc(startAfter)))
        .orElse(() => fsDb.collectionGroup('actions')
            .orderBy(admin.firestore.FieldPath.documentId()))
        .limit(1)
        .get();

    return snapshot.empty
        ? option.none()
        : option.some([snapshot.docs[0].ref.path,
        validateSchema('SavedAction')(snapshot.docs[0].data())]);
}

async function handleCrossCheck(): Promise<void> {
    let cursor: Option<string> = option.none();
    console.log('REPLAY')
    while (true) {
        const maybeNextAction = await getNextAction(cursor);
        if (!maybeNextAction.data.some) {
            break;
        }
        const [actionId, savedAction] = maybeNextAction.data.value;
        // await handleCrossCheckForAction(actionId, savedAction)

        cursor = option.some(actionId);
    }
    console.log('DONE')
}

function v1_0(): Router {
    const res = Router()

    res.options('/action', cors())
    res.post('/action', cors(), function(req: Request<{}>, res, next) {
        const action = validate1_0('Action')(req.body);
        handleAction({ version: "1.0", action }).then((resp) => {
            if (resp.data.status === 'err') {
                res.status(resp.data.error.status_code)
                res.json(resp.data.error)
            } else {
                res.status(200)
                res.json()
            }
        }).catch(next)
    })

    return res
}

function v1_1(): Router {
    const res = Router()

    res.options('/action', cors())
    res.post('/action', cors(), function(req: Request<{}>, res, next) {
        const action = validate1_1('Action')(req.body);
        handleAction({ version: "1.1", action }).then((resp) => {
            if (resp.data.status === 'err') {
                res.status(resp.data.error.status_code)
                res.json(resp.data.error)
            } else {
                res.status(200)
                res.json()
            }
        }).catch(next)
    })

    res.options('/players/:playerId/games', cors())
    res.get('/players/:playerId/games', cors(), asyncHandler(async (req, res, next) => {
        const pg = await db.runTransaction(fsDb)(db =>
            logic1_1_1.handleGetGamesForPlayerRequest(db, req.params['playerId']))
        res.status(200)
        res.json(pg)
    }))

    res.options('/players/:playerId/games/:gameId', cors())
    res.get('/players/:playerId/games/:gameId', cors(), asyncHandler(async (req, res, next) => {
        const pg = await db.runTransaction(fsDb)(db =>
            logic1_1_1.getPlayerGame1_1(db, req.params['playerId'], req.params['gameId']))
        option.from(pg).split({
            onSome: (pg) => {
                res.status(200)
                res.json(pg)
            },
            onNone: () => {
                res.status(404)
                res.json(pg)
            }
        })
    }))

    return res
}


app.use('/1.0', v1_0())
app.use('/1.1', v1_1())
app.use('/batch', batch())

type DeleteCollectionRequest = {
    collectionId: string
}


function listAllDocsExceptActions(): AsyncIterable<string> {
    const expandDocRef = (docRef: Option<DocumentReference>): AsyncIterable<Option<DocumentReference>> => {
        const collections = option.from<DocumentReference | Firestore>(
            docRef).orElse(() => fsDb).listCollections()
        return ixa.from(collections).pipe(
            ixaop.flatMap(collections => ixa.from(collections)),
            // Never purge the "actions" collection.
            ixaop.filter(colRef => colRef.id !== 'actions'),
            ixaop.map(colRef => colRef.listDocuments()),
            ixaop.flatMap(docs => ixa.from(docs)),
            ixaop.map(option.some),
        )
    }

    const allDocs: AsyncIterable<Option<DocumentReference>> =
        ixa.of(option.none())

    return ixa.from(allDocs).pipe(
        ixaop.expand(expandDocRef),
        util.filterNoneAsync(),
        ixaop.map(docRef => docRef.path)
    )
}


async function handlePurge(): Promise<void> {
    for await (const docPath of listAllDocsExceptActions()) {
        console.log("Deleting:", docPath)
        fsDb.doc(docPath).delete()
    }
}

function batch(): Router {
    const res = Router()

    res.post('/cross-check', function(_req: Request<{}>, res, next) {
        handleCrossCheck().then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    // res.post('/reexport', function(req: Request<{}>, res, next) {
    //     FRAMEWORK.handleReexport().then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })
    // res.post('/check', function(req: Request<{}>, res, next) {
    //     FRAMEWORK.handleCheck().then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })
    res.post('/purge', function(_req: Request<{}>, res, next) {
        handlePurge().then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    // res.post('/delete/:collectionId', function(req: Request<DeleteCollectionRequest>, res, next) {
    //     deleteCollection(db.runTransaction(fsDb), req.params.collectionId as CollectionId).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    return res
}
