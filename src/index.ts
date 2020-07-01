import { DocumentReference, Firestore } from '@google-cloud/firestore'
import cors from 'cors'
import deepEqual from 'deep-equal'
import express, { NextFunction, Response, Router } from 'express'
import { Params, ParamsDictionary, Query, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import { getActionId, findItemAsync, compareActionIds } from './base'
import * as db from './db'
import { Item, Key, ItemIterable, item, Diff } from './interfaces'
import * as logic1_1_1 from './logic/1.1.1'
import * as logic1_2_0 from './logic/1.2.0'
import { AnyAction, SavedAction } from './model'
import * as model1_0 from './model/1.0'
import { validate as validate1_0 } from './model/1.0.validator'
import * as model1_1 from './model/1.1'
import * as model1_2 from './model/1.2'
import { validate as validate1_1_1 } from './model/1.1.1.validator'
import { validate as validate1_1 } from './model/1.1.validator'
import { validate as validate1_2 } from './model/1.2.validator'
import { DocVersionSpec, VersionSpec, VersionSpecRequest, Pointer } from './model/base'
import { validate as validateBase } from './model/base.validator'
import { validate as validateSchema } from './model/index.validator'
import * as util from './util'
import { Option, option, Result } from './util'
import { ResultData } from './util/result'
import * as fw from './framework';
import { OperatorAsyncFunction } from 'ix/interfaces'

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

function asyncHandler<P extends Params = ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = Query>(
    handler: express.RequestHandler<P, ResBody, ReqBody, ReqQuery>): express.RequestHandler<P, ResBody, ReqBody, ReqQuery> {
    return (req: Request<P, ResBody, ReqBody, ReqQuery>, res: Response<ResBody>, next: NextFunction): any => {
        const fnReturn = handler(req, res, next)
        return Promise.resolve(fnReturn).catch(next)
    }
}

function optionHandler<P extends Params = ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = Query>(
    handler: (req: Request<P, ResBody, ReqBody, ReqQuery>) => Promise<Option<ResBody>>): express.RequestHandler<P, ResBody, ReqBody, ReqQuery> {
    return asyncHandler(async (req, res, next): Promise<void> => {
        const output = await handler(req);
        option.from(output).split({
            onSome: (output) => {
                res.status(200)
                res.json(output)
            },
            onNone: () => {
                res.status(404)
                res.json()
            }
        })
    })
}


function compareInterfaces(expected: UnifiedInterface, actual: UnifiedInterface) {
    if (!deepEqual(expected, actual)) {
        console.log("skew between implementation versions: ", expected, actual)
    }
}

export type Errors = {
    '1.0': Result<null, model1_0.Error>,
    '1.1': Result<null, model1_1.Error>,
}

async function handleAction(action: AnyAction): Promise<Errors> {
    const d = new db.Database2(fsDb);

    while (true) {
        const result = await logic1_2_0.integrate(d, action);

        const committed = await d.commitAction({
            previousDocVersions: result.previousDocVersions,
            previousCollectionMembers: result.previousCollectionMembers,
            action,
            diffs: result.diffs,
        })

        if (committed) {
            return result.result
        }
    }


}

async function handleBackfillDocs(): Promise<void> {
    let cursor: Option<string> = option.none();
    console.log('BACKFILL DOCS')
    while (true) {
        const maybeNextAction = await getNextAction(cursor);
        if (!maybeNextAction.data.some) {
            break;
        }
        const [actionId, savedAction] = maybeNextAction.data.value;
        await backfillDocsForAction(actionId, savedAction)

        cursor = option.some(actionId);
    }
    console.log('DONE')
}

async function backfillDocsForAction(actionId: string, savedAction: SavedAction): Promise<void> {
    await db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {
        const { facetDiffs } = await logic1_1_1.REVISION.integrate(db, savedAction)

        for (const facetId of Object.keys(facetDiffs)) {
            const newPointer: Pointer = option.from(await db.getRaw(facetId))
                .map(validateBase('Pointer'))
                .map(ptr => ({
                    actionId: compareActionIds(ptr.actionId, actionId) < 0 ? actionId : ptr.actionId
                }))
                .orElse(() => ({ actionId }))

            db.tx.set(db.db.doc(facetId), newPointer);
        }
    })
}


async function handleCheck(): Promise<void> {
    console.log('CHECK')
    for await (const docPath of listAllDocsExceptActions()) {
        console.log('CHECKING', docPath)
        await checkDoc(docPath)
    }
    console.log('DONE')
}

async function checkDoc(docPath: string): Promise<void> {
    const { schema } = db.parseDocPath(docPath)
    if (util.lexCompare(schema, ['games']) === 0) {
        await db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {
            const maybeDoc = option.from(await db.getRaw(docPath))
                .map(validateBase('Pointer'));
            if (!maybeDoc.data.some) {
                return
            }
            const { actionId } = maybeDoc.data.value;
            const savedAction = option.from(await fw.getAction(db, actionId)).unwrap()
            const { facetDiffs } = await logic1_1_1.REVISION.integrate(db, savedAction)
            if (!(docPath in facetDiffs)) {
                throw new Error(`Incorrect pointer at ${JSON.stringify(docPath)}`)
            }

            const collections = (await logic1_1_1.getCollections(db, docPath, actionId));
            for (const collectionPath of collections) {
                db.tx.set(db.db.doc(collectionPath), {
                    members: admin.firestore.FieldValue.arrayUnion(docPath)
                }, { merge: true })
            }
        })
    }

    if (logic1_1_1.COLLECTION_SCHEMATA.some(s => util.lexCompare(schema, s) === 0)) {
        await db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {
            const maybeDoc = option.from(await db.getRaw(docPath))
                .map(validateBase('Kollection'))
            if (!maybeDoc.data.some) {
                return
            }
            const { members } = maybeDoc.data.value;
            for (const memberDocPath of members) {
                const { actionId } = option.from(await db.getRaw(memberDocPath))
                    .map(validateBase('Pointer'))
                    .unwrap()

                const collections = await logic1_1_1.getCollections(db, memberDocPath, actionId);
                if (!collections.includes(docPath)) {
                    throw new Error(`Doc ${JSON.stringify(memberDocPath)} is incorrectly marked as a member of ${docPath}`)
                }
            }
        })
    }
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

// async function handleCrossCheck(): Promise<void> {
//     let cursor: Option<string> = option.none();
//     console.log('REPLAY')
//     while (true) {
//         const maybeNextAction = await getNextAction(cursor);
//         if (!maybeNextAction.data.some) {
//             break;
//         }
//         const [actionId, savedAction] = maybeNextAction.data.value;
//         await checkAction(actionId, savedAction)

//         cursor = option.some(actionId);
//     }
//     console.log('DONE')
// }

// function checkAction(actionId: string, savedAction: SavedAction): Promise<void> {
//     console.log("X-CHECK", actionId)
//     return db.runTransaction(fsDb)(async (d: db.Database): Promise<void> => {
//         // Check next version doesn't request invalid parents.
//         const parents1_2_0 = await logic1_2_0.REVISION.getNeededReferenceIds(d, savedAction)
//         for (const docId of parents1_2_0.docs) {
//             if (!(docId in savedAction.parents.docs)) {
//                 throw new Error("Illegal parent lookup")
//             }
//         }
//         for (const collectionId of parents1_2_0.collections) {
//             if (!savedAction.parents.collections.includes(collectionId)) {
//                 throw new Error("Illegal parent lookup")
//             }
//         }

//         // Check the next version has the same impact.
//         const result1_1_1 = await logic1_1_1.REVISION.integrate(d, savedAction)
//         const result1_2_0 = await logic1_2_0.REVISION.integrate(d, savedAction)
//         if (!deepEqual(result1_1_1, result1_2_0)) {
//             throw new Error(`divergence at ${actionId}`)
//         }

//         for (const facetId of Object.keys(result1_1_1.facetDiffs)) {
//             // Check the exports agree.
//             const exports1_1_1 = await logic1_1_1.getFacetExports(d, facetId, actionId)
//             const exports1_2_0 = await logic1_2_0.getFacetExports(d, facetId, actionId)
//             if (!deepEqual(exports1_1_1, exports1_2_0)) {
//                 throw new Error(`divergence at ${facetId}@${actionId}`)
//             }
//         }
//     })
// }



function v1_0(): Router {
    const res = Router()

    res.options('/action', cors())
    res.post('/action', cors(), function(req: Request<{}>, res, next) {
        const action = validate1_0('Action')(req.body);
        handleAction({ version: "1.0", action }).then((errs) => {
            const resp = errs['1.0']
            if (resp.data.status === 'err') {
                res.status(resp.data.error.status_code)
                res.json(resp.data.error)
            } else {
                res.status(200)
                res.json()
            }
        }).catch(next)
    })

    // res.options('/players/:playerId/games', cors())
    // res.get('/players/:playerId/games', cors(), optionHandler(req => {
    //     return db.runTransaction(fsDb)(
    //         db => fw.getLatestValue(db, logic1_1_1.LIVE_PLAYERS_TO_GAMES,
    //             [req.params['playerId']]))
    // }))

    // res.options('/players/:playerId/games/:gameId', cors())
    // res.get('/players/:playerId/games/:gameId', cors(), optionHandler(req => {
    //     return db.runTransaction(fsDb)(
    //         db => fw.getLatestValue(
    //             db, logic1_1_1.PLAYER_GAMES1_0, [req.params['playerId'], req.params['gameId']]))
    // }))

    return res
}

function v1_1(): Router {
    const res = Router()

    res.options('/action', cors())
    res.post('/action', cors(), function(req: Request<{}>, res, next) {
        const action = validate1_1('Action')(req.body);
        handleAction({ version: "1.1", action }).then((errs) => {
            const resp = errs['1.1']
            if (resp.data.status === 'err') {
                res.status(resp.data.error.status_code)
                res.json(resp.data.error)
            } else {
                res.status(200)
                res.json()
            }
        }).catch(next)
    })

    // res.options('/players/:playerId/games', cors())
    // res.get('/players/:playerId/games', cors(), optionHandler(req => {
    //     return db.runTransaction(fsDb)(
    //         db => fw.getLatestValue(db, logic1_1_1.LIVE_PLAYERS_TO_GAMES,
    //             [req.params['playerId']]))
    // }))

    // res.options('/players/:playerId/games/:gameId', cors())
    // res.get('/players/:playerId/games/:gameId', cors(), optionHandler(req => {
    //     return db.runTransaction(fsDb)(
    //         db => fw.getLatestValue(
    //             db, logic1_1_1.PLAYER_GAMES1_1, [req.params['playerId'], req.params['gameId']]))
    // }))

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
            ixaop.flatMap(async colRef => ixa.from(await colRef.listDocuments())),
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

    // res.post('/cross-check', function(_req: Request<{}>, res, next) {
    //     handleCrossCheck().then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    // res.post('/backfill-docs', function(req: Request<{}>, res, next) {
    //     handleBackfillDocs().then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })
    // res.post('/check', function(req: Request<{}>, res, next) {
    //     handleCheck().then(result => {
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
