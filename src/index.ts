import { CollectionReference } from '@google-cloud/firestore'
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
import { dirname } from 'path'

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

type Tables = {
    "ACTIONS": db.Table<SavedAction>
    // "ANNOTATIONS,1.1.1": db.Table<state1_1_1.Annotation2>
    // "LABELS,1.1.1,games": db.Table<Reference>
    // "IMPLEXP,1.1.1,1.0,gamesByPlayer": db.Table<import('../model/1.0').PlayerGame>
    // "IMPLEXP,1.1.1,1.1,gamesByPlayer": db.Table<import('../model/1.1').PlayerGame>
    "EXP,1.0,gamesByPlayer": db.Table<import('./model/1.0').PlayerGame>
    "EXP,1.1,gamesByPlayer": db.Table<import('./model/1.1').PlayerGame>
}

function openAll(db: db.Database): Tables {
    return {
        "ACTIONS": db.open({
            schema: ['actions'],
            validator: validateSchema('SavedAction')
        }),
        // "ANNOTATIONS,1.1.1": db.open({
        //     schema: ['annotations-1.1.1'],
        //     validator: VALIDATORS['1.1.1']('Annotations')
        // }),
        // "LABELS,1.1.1,games": db.open({
        //     schema: ['labels-1.1.1'],
        //     validator: validateSchema('Reference')
        // }),

        "EXP,1.0,gamesByPlayer": db.open({
            schema: ['players', 'games-gamesByPlayer-1.0'],
            validator: VALIDATORS['1.0']('PlayerGame'),
        }),
        "EXP,1.1,gamesByPlayer": db.open({
            schema: ['players', 'games-gamesByPlayer-1.1'],
            validator: VALIDATORS['1.1']('PlayerGame'),
        }),
    }
}

type FetchedState<TState> = {
    label: string,
    actionId: Option<string>,
    state: Option<TState>
}

type RevisionResult<TState> = {
    newState: TState
    oldStates: Record<string, Option<TState>>
}
type DoActionResult<TState> = {
    actionId: string
    savedAction: SavedAction
    newState: TState
    oldStates: Record<string, Option<TState>>
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
        const refIds = logic1_1_1.getNeededReferenceIds(action)

        const parents: Record<string, ReferenceGroup> = {}
        for (const refId of refIds) {
            parents[refId] = await getCurrentRefGroup(db, refId)
        }

        const gameDiffs = await logic1_1_1.getGameDiffs(db, action, parents);
        const gamesByPlayer1_0Diffs = await logic1_1_1.getGameByPlayer1_0Diffs(db, action, parents);
        const gamesByPlayer1_1Diffs = await logic1_1_1.getGameByPlayer1_1Diffs(db, action, parents);

        console.log(JSON.stringify(gameDiffs, undefined, 2))

        const refsToUpdate = ix.concat(
            ix.from(gameDiffs).pipe(
                ixop.map(({ key }) => logic1_1_1.gameKeyToRefId(key))),
            ix.from(gamesByPlayer1_0Diffs).pipe(
                ixop.map(({ key }) => logic1_1_1.gameByPlayer1_0KeyToRefId(key))),
            ix.from(gamesByPlayer1_1Diffs).pipe(
                ixop.map(({ key }) => logic1_1_1.gameByPlayer1_1KeyToRefId(key))),
        ).pipe(
            ixop.distinct()
        )

        const savedAction: SavedAction = { parents, action };
        const actionId = getActionId(savedAction);

        db.tx.set(db.db.doc(actionId), savedAction)

        for (const refId of refsToUpdate) {
            db.tx.set(db.db.doc(refId), { actionId })
        }

        return result.ok(null)
    })
}



// await logic1_2_0.commitAction(db, action);
// return result.ok(null)

// const result1_1_1 = await doAction(db, REVISION1_1_1, action);
// const result1_2_0 = await replayActionForRevision(db, REVISION1_2_0, result1_1_1.actionId, result1_1_1.savedAction);

// const pg1_1_1 = logic1_1_1.getUnifiedInterface(action.gameId, result1_1_1.newState)
// option.from(result1_2_0).map(res => {
//     const pg1_2_0 = logic1_2_0.getUnifiedInterface(action.gameId, res.newState)
//     compareInterfaces(pg1_1_1, pg1_2_0)
// })

// const ts = openAll(db);
// result.fromData(pg1_1_1['1.0']).map(i => {
//     for (const { key, value } of i.playerGames) {
//         ts["EXP,1.0,gamesByPlayer"].set(key, value)
//     }
// })
// result.fromData(pg1_1_1['1.1']).map(i => {
//     for (const { key, value } of i.playerGames) {
//         ts["EXP,1.1,gamesByPlayer"].set(key, value)
//     }
// })
// switch (action.version) {
//     case '1.0':
//         return result.fromData(pg1_1_1[action.version]).map(() => null)
//     case '1.1':
//         return result.fromData(pg1_1_1[action.version]).map(() => null)
// }

// async function doAction<TState>(db: db.Database, impl: fw.Revision2<TState>, action: AnyAction): Promise<DoActionResult<TState>> {
//     const fetched: FetchedState<TState>[] = []

//     const annotationsTable = db.open({
//         schema: [`annotations-${impl.id}`],
//         validator: impl.validateAnnotation,
//     })

//     const labelsTable = db.open({
//         schema: [`labels-${impl.id}`],
//         validator: validateSchema('Reference')
//     })

//     const inputs: fw.Input2<TState> = {
//         async getParent(label: string): Promise<Option<TState>> {
//             const maybeRef = await readables.getOption(labelsTable, [label]);
//             const f: FetchedState<TState> = {
//                 label,
//                 actionId: option.from(maybeRef).map(({ actionId }) => actionId),
//                 state: await option.from(maybeRef).mapAsync(async ref => {
//                     const annos = option.from(await readables.getOption(annotationsTable, [ref.actionId])).unwrap();

//                     return annos.state
//                 })
//             }
//             fetched.push(f)
//             return f.state
//         }
//     }

//     const { labels, state } = await impl.integrate(action, inputs);

//     const labelToParent: Record<string, fw.ParentLink> = {};
//     for (const { label, actionId } of fetched) {
//         labelToParent[label] = {
//             actionId: actionId.data
//         };
//     }
//     const parentList: string[] = ix.toArray(ix.from(fetched).pipe(
//         ixop.map(({ actionId }) => actionId),
//         util.filterNone(),
//         ixop.orderBy(actionId => actionId),
//         ixop.distinct(),
//     ))

//     const savedAction: SavedAction = { parents: parentList, action };
//     const actionId = getActionId(savedAction);

//     openAll(db)["ACTIONS"].set([actionId], savedAction)
//     annotationsTable.set([actionId], { labels, parents: labelToParent, state })
//     const oldStates: Record<string, Option<TState>> = {};

//     for (const label of labels) {
//         const oldFetched = option.of(ix.find(fetched, f => f.label === label)).expect("No blind writes");
//         oldStates[label] = oldFetched.state;
//         labelsTable.set([label], { actionId });
//     }

//     return {
//         actionId,
//         savedAction,
//         newState: state,
//         oldStates,
//     };
// }

// type ReplayActionResult<TState> = {
//     kind: 'check' | 'replay'
//     newState: TState
//     oldStates: Record<string, Option<TState>>
// }

// function replayOrCheckAction<TState>(actionId: string, action: SavedAction): Promise<void> {
//     return db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {
//         const result1_1_1 = await replayOrCheckActionForRevision(db, REVISION1_1_1, actionId, action)
//         const result1_2_0 = await replayOrCheckActionForRevision(db, REVISION1_2_0, actionId, action)

//         const pg1_1_1 = option.from(result1_1_1).map(res => logic1_1_1.getUnifiedInterface(action.action.gameId, res.newState))
//         const pg1_2_0 = option.from(result1_2_0).map(res => logic1_2_0.getUnifiedInterface(action.action.gameId, res.newState))

//         pg1_1_1.and(pg1_2_0).map(([pg1_1_1, pg1_2_0]) => {
//             compareInterfaces(pg1_1_1, pg1_2_0)
//         })

//         const ts = openAll(db);
//         pg1_1_1.map(pg1_1_1 => {
//             result.fromData(pg1_1_1['1.0']).map(pg => {
//                 for (const pgs of pg.playerGames) {
//                     ts["EXP,1.0,gamesByPlayer"].set(pgs.key, pgs.value)
//                 }
//             })
//             result.fromData(pg1_1_1['1.1']).map(pg => {
//                 for (const pgs of pg.playerGames) {
//                     ts["EXP,1.1,gamesByPlayer"].set(pgs.key, pgs.value)
//                 }
//             })
//         })
//     })
// }

// async function replayOrCheckActionForRevision<TState>(db: db.Database, impl: fw.Revision2<TState>, actionId: string, action: SavedAction):
//     Promise<Option<ReplayActionResult<TState>>> {
//     const annotationsTable = db.open({
//         schema: [`annotations-${impl.id}`],
//         validator: impl.validateAnnotation,
//     })

//     const annos = await readables.getOption(annotationsTable, [actionId])

//     return await option.from(annos).split({
//         async onSome(annos): Promise<Option<ReplayActionResult<TState>>> {
//             // console.log(`CHECK ${actionId}`)

//             // await checkAction(impl, actionId, savedAction, annos)
//             // TODO
//             return option.none()
//         },
//         onNone: (): Promise<Option<ReplayActionResult<TState>>> => {
//             return replayActionForRevision(db, impl, actionId, action)
//         }
//     })
// }

// async function replayActionForRevision<TState>(db: db.Database, impl: fw.Revision2<TState>, actionId: string, action: SavedAction):
//     Promise<Option<ReplayActionResult<TState>>> {
//     console.log(`REPLAY ${impl.id} ${actionId}`)

//     const fetched: FetchedState<TState>[] = []

//     const annotationsTable = db.open({
//         schema: [`annotations-${impl.id}`],
//         validator: impl.validateAnnotation,
//     })

//     const labelsTable = db.open({
//         schema: [`labels-${impl.id}`],
//         validator: validateSchema('Reference')
//     })

//     for (const parent of action.parents) {
//         const parentAnnos = await readables.getOption(annotationsTable, [parent]);
//         if (!parentAnnos.data.some) {
//             // Not ready to replay.
//             return option.none()
//         }
//     }

//     const inputs: fw.Input2<TState> = {
//         async getParent(label: string): Promise<Option<TState>> {
//             const maybeRef = await readables.getOption(labelsTable, [label]);
//             const f: FetchedState<TState> = {
//                 label,
//                 actionId: option.from(maybeRef).map(({ actionId }) => actionId),
//                 state: await option.from(maybeRef).mapAsync(async ref => {
//                     const annos = option.from(await readables.getOption(annotationsTable, [ref.actionId])).unwrap();

//                     return annos.state
//                 })
//             }
//             fetched.push(f)
//             return f.state
//         }
//     }

//     const { labels, state } = await impl.integrate(action.action, inputs);

//     const labelToParent: Record<string, fw.ParentLink> = {};
//     for (const { label, actionId } of fetched) {
//         labelToParent[label] = { actionId: actionId.data };
//         if (actionId.data.some && action.parents.indexOf(actionId.data.value) === -1) {
//             throw new Error(`Requested actionId ${JSON.stringify(actionId.data.value)} for label ${JSON.stringify(label)} 
// not on allowed list: ${JSON.stringify(action.parents)}`);
//         }
//     }

//     annotationsTable.set([actionId], { parents: labelToParent, labels, state })
//     const oldStates: Record<string, Option<TState>> = {};

//     for (const label of labels) {
//         const oldFetched = option.of(ix.find(fetched, f => f.label === label)).expect("No blind writes");
//         oldStates[label] = oldFetched.state;
//         labelsTable.set([label], { actionId });
//     }

//     return option.some({ kind: 'replay', newState: state, oldStates })
// }

// function find<T>(items: Iterable<T>, pred: (t: T) => boolean): Option<T> {
//     const first = ix.first(ix.from(items).pipe(ixop.filter(pred)));

//     if (first === undefined) {
//         return option.none();
//     } else {
//         return option.some(first)
//     }
// }

// function checkAction<TResult, TFacet>(impl: fw.Revision<TResult, TFacet>,
//     actionId: string, action: SavedAction, annotations: fw.Annotations<TFacet>): Promise<void> {
//     return db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {

//         const annotationsTable = db.open({
//             schema: [`annotations-${impl.id}`],
//             validator: impl.validateAnnotation,
//         })


//         const fetched: FetchedFacet<TFacet>[] = []
//         const inputs: fw.Input<TFacet> = {
//             async getFacet(label: string): Promise<Option<TFacet>> {
//                 const maybeParent = option.of(annotations.parents[label]);

//                 return await maybeParent.andThenAsync(async ref => {
//                     const annos = option.from(await readables.getOption(annotationsTable, [ref.actionId])).unwrap();
//                     const value = option.fromData(option.of(annos.facets[label]).unwrap());

//                     fetched.push({
//                         label,
//                         actionId: ref.actionId,
//                         value,
//                     })
//                     return value
//                 })
//             }
//         }

//         const { facets } = await impl.integrate(action.action, inputs);

//         const labelToParent: Record<string, Reference> = {};
//         for (const { label, actionId } of fetched) {
//             labelToParent[label] = { actionId };
//         }
//         const parentList: string[] = ix.toArray(ix.from(fetched).pipe(
//             ixop.map(({ actionId }) => actionId),
//             ixop.orderBy(actionId => actionId),
//             ixop.distinct(),
//         ))

//         const actualAnnotations: fw.Annotations<TFacet> = {
//             parents: labelToParent,
//             facets,
//         }

//         assert.deepEqual(parentList, action.parents);
//         assert.deepEqual(actualAnnotations, annotations);
//     })
// }

// async function handleReplay<TState>(): Promise<void> {
//     let cursor: string = '';
//     console.log('REPLAY')
//     while (true) {

//         const nextActionOrNull = await getNextAction(db.runTransaction(fsDb), cursor);
//         if (nextActionOrNull === null) {
//             break;
//         }
//         const [actionId, savedAction] = nextActionOrNull;
//         await replayOrCheckAction(actionId, savedAction)

//         cursor = actionId;
//     }
//     console.log('DONE')
// }


async function handleRefacetForAction(actionId: string): Promise<void> {
    await db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {

        // const labelsTable = db.open({
        //     schema: ['labels-1.2.0'],
        //     validator: validateSchema('ReferenceGroup')
        // })

        const facetIds = await logic1_2_0.getAffectedFacets(db, { kind: 'replay', actionId })
        for (const facetId of facetIds) {
            const newPointer: Pointer = option.from(await db.getRaw(facetId))
                .map(validateSchema('Pointer'))
                .map(ptr => ({
                    actionId: ptr.actionId < actionId ? actionId : ptr.actionId
                }))
                .orElse(() => ({ actionId }))

            db.tx.set(db.db.doc(facetId), newPointer);

            // if (facetId.length === 1) {

            //     const [facetId] = facetId;

            //     const currentRef = option.from(await readables.getOption(labelsTable, [facetId])).orElse(() => ({ kind: 'nil' }));
            //     const newRef = ((): ReferenceGroup => {
            //         switch (currentRef.kind) {
            //             case "none":
            //                 return {
            //                     kind: "leaf",
            //                     actionId,
            //                 }
            //             case "leaf":
            //                 return {
            //                     kind: "leaf",
            //                     actionId: currentRef.actionId < actionId ? actionId : currentRef.actionId,
            //                 }
            //             case "node":
            //                 throw new Error("incompatible reference")
            //         }
            //     })();
            //     labelsTable.set([facetId], newRef)
            // } else if (facetId.length === 2) {
            //     const [first, second] = facetId;
            //     const currentRef = option.from(await readables.getOption(labelsTable, [first])).orElse(() => ({ kind: 'nil' }));
            //     const newRef = ((): ReferenceGroup => {
            //         switch (currentRef.kind) {
            //             case "nil":
            //                 return {
            //                     kind: "node",
            //                     members: {
            //                         [second]: { kind: 'leaf', actionId },
            //                     }
            //                 }
            //             case "leaf":
            //                 throw new Error("incompatible reference")

            //             case "node":
            //                 if (!(second in currentRef.subfacets)) {
            //                     return {
            //                         kind: "node",
            //                         members: {
            //                             ...currentRef.subfacets,
            //                             [second]: { kind: 'leaf', actionId },
            //                         }
            //                     }
            //                 } else {
            //                     const subfacet = currentRef.subfacets[second];
            //                     switch (subfacet.kind) {
            //                         case 'nil':
            //                             return {
            //                                 kind: "node",
            //                                 members: {
            //                                     ...currentRef.subfacets,
            //                                     [second]: { kind: 'leaf', actionId },
            //                                 }
            //                             }
            //                         case 'node':
            //                             throw new Error("incompatible reference")
            //                         case 'leaf':
            //                             return {
            //                                 kind: "node",
            //                                 members: {
            //                                     ...currentRef.subfacets,
            //                                     [second]: {
            //                                         kind: 'leaf', actionId:
            //                                             subfacet.actionId < actionId ? actionId : subfacet.actionId,
            //                                     },
            //                                 }
            //                             }
            //                     }
            //                 }
            //         }
            //     })();

            //     labelsTable.set([first], newRef)
            // } else {
            //     throw new Error('wtf')
            // }

        }
    })
}

async function handleRefacet(): Promise<void> {
    let cursor: string = '';
    console.log('REPLAY')
    while (true) {
        const nextActionOrNull = await getNextAction(db.runTransaction(fsDb), cursor);
        if (nextActionOrNull === null) {
            break;
        }
        const [actionId, savedAction] = nextActionOrNull;
        await handleRefacetForAction(`actions/${actionId}`)

        cursor = actionId;
    }
    console.log('DONE')
}

function getNextAction(tx: db.TxRunner, startAfter: string): Promise<([string, SavedAction] | null)> {
    return tx(async (db: db.Database): Promise<([string, SavedAction] | null)> => {
        const actions = openAll(db)["ACTIONS"];
        const first = await ixa.first(ixa.from(readables.readAllAfter(actions, [startAfter])));
        if (first === undefined) {
            return null;
        }
        const { key: [actionId], value: savedAction } = first;
        return [actionId, savedAction];
    });
}

app.options('/action', cors())
app.post('/action', cors(), function(req: Request<Dictionary<string>>, res, next) {
    handleAction(validateSchema('AnyAction')(req.body)).then((resp) => {
        if (resp.data.status === 'err') {
            res.status(resp.data.error.status_code)
            res.json(resp.data.error)
        } else {
            res.status(200)
            res.json()
        }
    }).catch(next)
})


app.get('/debug', cors(), function(req: Request<Dictionary<string>>, res, next) {
    const foo = async () => {

    }

    // handleAction(validateSchema('AnyAction')(req.query)).then((resp) => {
    //     if (resp.data.status === 'err') {
    //         res.status(resp.data.error.status_code)
    //         res.json(resp.data.error)
    //     } else {
    //         res.status(200)
    //         res.json()
    //     }
    // }).catch(next)
})

app.use('/batch', batch())

type DeleteCollectionRequest = {
    collectionId: string
}

async function handlePurge(): Promise<void> {
    for (const collection of await fsDb.listCollections()) {
        await purgeCollection(collection)
    }
}

async function purgeCollection(cref: CollectionReference): Promise<void> {
    // Never purge the "actions" collection.
    if (cref.id === 'actions') {
        return
    }
    for (const doc of await cref.listDocuments()) {
        console.log("Deleting:", doc.path)
        doc.delete()
        for (const subC of await doc.listCollections()) {
            await purgeCollection(subC)
        }
    }
}

function batch(): Router {
    const res = Router()

    // res.post('/replay', function(_req: Request<{}>, res, next) {
    //     handleReplay().then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })
    res.post('/refacet', function(_req: Request<{}>, res, next) {
        handleRefacet().then(result => {
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

// async function deleteCollection(runner: db.TxRunner, collectionId: CollectionId): Promise<void> {
//     await runner(async (db: db.Database): Promise<void> => {
//         const ts = openAll(db);
//         switch (collectionId) {
//             case '1.1.1':
//                 await deleteTable(ts['ANNOTATIONS,1.1.1'])
//                 await deleteTable(ts["LABELS,1.1.1,games"]);
//         }
//     })
// }

// async function debugMain() {
//     await db.runTransaction(fsDb)(async db => {



//         console.log(JSON.stringify(await logic1_2_0.getGameState(db, { kind: 'replay', actionId: "02020-06-19T17:43:18.392Z052beb85" }, "aa")))
//     })
// }

(global as any)['logic'] = logic1_2_0;
(global as any)['tx'] = db.runTransaction(fsDb);

// debugMain()
