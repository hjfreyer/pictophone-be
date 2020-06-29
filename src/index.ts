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
import { Item, Key, ItemIterable, item } from './interfaces'
import * as logic1_1_1 from './logic/1.1.1'
import { AnyAction, AnyError, SavedAction } from './model'
import * as model1_0 from './model/1.0'
import { validate as validate1_0 } from './model/1.0.validator'
import * as model1_1 from './model/1.1'
import { validate as validate1_1_1 } from './model/1.1.1.validator'
import { validate as validate1_1 } from './model/1.1.validator'
import { DocVersionSpec, VersionSpec, VersionSpecRequest, Pointer } from './model/base'
import { validate as validateBase } from './model/base.validator'
import { validate as validateSchema } from './model/index.validator'
import * as util from './util'
import { Option, option, Result } from './util'
import { ResultData } from './util/result'
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


export async function getAction(db: db.Database, actionId: string): Promise<Option<SavedAction>> {
    const data = await db.getRaw(actionId);
    return option.from(data).map(validateSchema('SavedAction'))
}

export async function resolveVersionSpec(db: db.Database, { docs, collections }: VersionSpecRequest): Promise<VersionSpec> {
    const allDocs = [...docs]
    for (const collectionId of collections) {
        const members = option.from(await db.getRaw(collectionId))
            .map(validateBase('Kollection'))
            .map(col => col.members)
            .orElse(() => [])
        for (const doc of members) {
            if (allDocs.indexOf(doc) === -1) {
                allDocs.push(doc)
            }
        }
    }
    const res: VersionSpec = { docs: {}, collections: collections }
    for (const docId of allDocs) {
        res.docs[docId] = option.from(await db.getRaw(docId))
            .map(validateBase('Pointer'))
            .map<DocVersionSpec>(p => ({ exists: true, actionId: p.actionId }))
            .orElse(() => ({ exists: false }))
    }
    return res;
}

export interface Table<T> {
    getLatestVersionRequest(d: db.Database, key: Key): Promise<VersionSpecRequest>
    getState(d: db.Database, version: VersionSpec): ItemIterable<T>
}

export async function getLatestValue<T>(d: db.Database, table: Table<T>, key: Key): Promise<Option<T>> {
    const version = await resolveVersionSpec(d, await table.getLatestVersionRequest(d, key))
    return option.from(await findItemAsync(table.getState(d, version), key)).map(item => item.value)
}

export type Errors = {
    '1.0': Result<null, model1_0.Error>,
    '1.1': Result<null, model1_1.Error>,
}

function handleAction(action: AnyAction): Promise<Result<null, AnyError>> {
    return db.runTransaction(fsDb)(async (db: db.Database): Promise<Result<null, AnyError>> => {
        const parents = await resolveVersionSpec(db, await logic1_1_1.REVISION.getNeededReferenceIds(db, action))

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

        for (const [collectionPath, diffs] of Object.entries(res.impactedCollections)) {
            if (0 < diffs.deletedMembers.length) {
                db.tx.set(db.db.doc(collectionPath), {
                    members: admin.firestore.FieldValue.arrayRemove(...diffs.deletedMembers)
                }, { merge: true })
            }
            if (0 < diffs.addedMembers.length) {
                db.tx.set(db.db.doc(collectionPath), {
                    members: admin.firestore.FieldValue.arrayUnion(...diffs.addedMembers)
                }, { merge: true })
            }
        }

        return res.result[action.version]
    })
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
        const { impactedReferenceIds } = await logic1_1_1.REVISION.integrate(db, savedAction)

        for (const refId of impactedReferenceIds) {
            const newPointer: Pointer = option.from(await db.getRaw(refId))
                .map(validateBase('Pointer'))
                .map(ptr => ({
                    actionId: compareActionIds(ptr.actionId, actionId) < 0 ? actionId : ptr.actionId
                }))
                .orElse(() => ({ actionId }))

            db.tx.set(db.db.doc(refId), newPointer);
        }
    })
}


async function handleCheck(): Promise<void> {
    console.log('CHECK')
    for await (const docPath of listAllDocsExceptActions()) {
        console.log('CHECKING', docPath)
        await checkDoc(docPath)
    }
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
            const savedAction = option.from(await getAction(db, actionId)).unwrap()
            const { impactedReferenceIds } = await logic1_1_1.REVISION.integrate(db, savedAction)
            if (!impactedReferenceIds.includes(docPath)) {
                throw new Error(`Incorrect pointer at ${JSON.stringify(docPath)}`)
            }

            const collections = (await logic1_1_1.getCollections(db, savedAction))[docPath];
            for (const collectionPath of collections) {
                db.tx.set(db.db.doc(collectionPath), {
                    members: admin.firestore.FieldValue.arrayUnion(docPath)
                }, { merge: true })
            }
        })
    }
    if (util.lexCompare(schema, ['players-to-games']) === 0) {
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

                const savedAction = option.from(await getAction(db, actionId)).unwrap()
                const collections = (await logic1_1_1.getCollections(db, savedAction))[memberDocPath];
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

    res.options('/players/:playerId/games', cors())
    res.get('/players/:playerId/games', cors(), optionHandler(req => {
        return db.runTransaction(fsDb)(
            db => getLatestValue(
                db, logic1_1_1.PLAYER_TO_GAMES, [req.params['playerId']]))
    }))

    res.options('/players/:playerId/games/:gameId', cors())
    res.get('/players/:playerId/games/:gameId', cors(), optionHandler(req => {
        return db.runTransaction(fsDb)(
            db => getLatestValue(
                db, logic1_1_1.PLAYER_GAME1_1, [req.params['playerId'], req.params['gameId']]))
    }))

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
    res.get('/players/:playerId/games', cors(), optionHandler(req => {
        return db.runTransaction(fsDb)(
            db => getLatestValue(
                db, logic1_1_1.PLAYER_TO_GAMES, [req.params['playerId']]))
    }))

    res.options('/players/:playerId/games/:gameId', cors())
    res.get('/players/:playerId/games/:gameId', cors(), optionHandler(req => {
        return db.runTransaction(fsDb)(
            db => getLatestValue(
                db, logic1_1_1.PLAYER_GAME1_1, [req.params['playerId'], req.params['gameId']]))
    }))

    return res
}


app.use('/1.0', v1_0())
app.use('/1.1', v1_1())
app.use('/batch', batch())

type DeleteCollectionRequest = {
    collectionId: string
}

export function getActionIdsForSchema(targetSchema: Key): OperatorAsyncFunction<[string, DocVersionSpec], Item<string>> {
    return ixaop.flatMap(([docId, docVersion]): ItemIterable<string> => {
        const { schema, key } = db.parseDocPath(docId);
        if (util.lexCompare(schema, targetSchema) === 0 && docVersion.exists) {
            return ixa.of(item(key, docVersion.actionId))
        } else {
            return ixa.empty()
        }
    })
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

    res.post('/cross-check', function(_req: Request<{}>, res, next) {
        handleCrossCheck().then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    res.post('/backfill-docs', function(req: Request<{}>, res, next) {
        handleBackfillDocs().then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })
    res.post('/check', function(req: Request<{}>, res, next) {
        handleCheck().then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })
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
