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
import {
    AnyAction, AnyError, CollectionId,
    deleteTable, Reference, SavedAction
} from './schema'
import { validate as validateSchema } from './schema/interfaces.validator'
import * as util from './util'
import { Defaultable, defaultable, Option, option, Result, result } from './util'
import { OptionData } from './util/option'
import { REVISION as REVISION1_1_1 } from './logic/1.1.1'
import { REVISION as REVISION1_2_0 } from './logic/1.2.0'
import * as fw from './framework';
import { OperatorAsyncFunction, OperatorFunction } from 'ix/interfaces'

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

// type AllResults = {
//     '1.1.1': 
// }

function doAction<TState>(impl: fw.Revision2<TState>, action: AnyAction): Promise<RevisionResult<TState>> {
    return db.runTransaction(fsDb)(async (db: db.Database): Promise<RevisionResult<TState>> => {
        const fetched: FetchedState<TState>[] = []

        const annotationsTable = db.open({
            schema: [`annotations-${impl.id}`],
            validator: impl.validateAnnotation,
        })

        const labelsTable = db.open({
            schema: [`labels-${impl.id}`],
            validator: validateSchema('Reference')
        })

        const inputs: fw.Input2<TState> = {
            async getParent(label: string): Promise<Option<TState>> {
                const maybeRef = await readables.getOption(labelsTable, [label]);
                const f: FetchedState<TState> = {
                    label,
                    actionId: option.from(maybeRef).map(({ actionId }) => actionId),
                    state: await option.from(maybeRef).mapAsync(async ref => {
                        const annos = option.from(await readables.getOption(annotationsTable, [ref.actionId])).unwrap();

                        return annos.state
                    })
                }
                fetched.push(f)
                return f.state
            }
        }

        const { labels, state } = await impl.integrate(action, inputs);

        const labelToParent: Record<string, fw.ParentLink> = {};
        for (const { label, actionId } of fetched) {
            labelToParent[label] = {
                actionId: actionId.data
            };
        }
        const parentList: string[] = ix.toArray(ix.from(fetched).pipe(
            ixop.map(({ actionId }) => actionId),
            util.filterNone(),
            ixop.orderBy(actionId => actionId),
            ixop.distinct(),
        ))

        const savedAction: SavedAction = { parents: parentList, action };
        const actionId = getActionId(savedAction);

        openAll(db)["ACTIONS"].set([actionId], savedAction)
        annotationsTable.set([actionId], { labels, parents: labelToParent, state })
        const oldStates: Record<string, Option<TState>> = {};

        for (const label of labels) {
            const oldFetched = option.of(ix.find(fetched, f => f.label === label)).expect("No blind writes");
            oldStates[label] = oldFetched.state;
            labelsTable.set([label], { actionId });
        }

        return {
            newState: state,
            oldStates,
        };
    })
}

function replayAction<TState>(impl: fw.Revision2<TState>, actionId: string, action: SavedAction): Promise<void> {
    return db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {
        const fetched: FetchedState<TState>[] = []

        const annotationsTable = db.open({
            schema: [`annotations-${impl.id}`],
            validator: impl.validateAnnotation,
        })

        const labelsTable = db.open({
            schema: [`labels-${impl.id}`],
            validator: validateSchema('Reference')
        })

        const inputs: fw.Input2<TState> = {
            async getParent(label: string): Promise<Option<TState>> {
                const maybeRef = await readables.getOption(labelsTable, [label]);
                const f: FetchedState<TState> = {
                    label,
                    actionId: option.from(maybeRef).map(({ actionId }) => actionId),
                    state: await option.from(maybeRef).mapAsync(async ref => {
                        const annos = option.from(await readables.getOption(annotationsTable, [ref.actionId])).unwrap();

                        return annos.state
                    })
                }
                fetched.push(f)
                return f.state
            }
        }

        const { labels, state } = await impl.integrate(action.action, inputs);

        const labelToParent: Record<string, fw.ParentLink> = {};
        for (const { label, actionId } of fetched) {
            labelToParent[label] = { actionId: actionId.data };
            if (actionId.data.some && action.parents.indexOf(actionId.data.value) === -1) {
                throw new Error(`Requested actionId ${JSON.stringify(actionId.data.value)} for label ${JSON.stringify(label)} 
not on allowed list: ${JSON.stringify(action.parents)}`);
            }
        }

        annotationsTable.set([actionId], { parents: labelToParent, labels, state })
        for (const label of labels) {
            labelsTable.set([label], { actionId });
        }
    })
}

function find<T>(items: Iterable<T>, pred: (t: T) => boolean): Option<T> {
    const first = ix.first(ix.from(items).pipe(ixop.filter(pred)));

    if (first === undefined) {
        return option.none();
    } else {
        return option.some(first)
    }
}

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

async function handleReplay<TState>(impl: fw.Revision2<TState>): Promise<void> {
    let cursor: string = '';
    console.log('REPLAY')
    while (true) {

        const nextActionOrNull = await getNextAction(db.runTransaction(fsDb), cursor);
        if (nextActionOrNull === null) {
            break;
        }
        const [actionId, savedAction] = nextActionOrNull;
        const annos = await db.runTransaction(fsDb)(db => {
            const annotationsTable = db.open({
                schema: [`annotations-${impl.id}`],
                validator: impl.validateAnnotation,
            })

            return readables.getOption(annotationsTable, [actionId])
        });
        await option.from(annos).split({
            async onSome(annos): Promise<void> {
                // console.log(`CHECK ${actionId}`)

                // await checkAction(impl, actionId, savedAction, annos)
            },
            async onNone(): Promise<void> {
                console.log(`REPLAY ${actionId}`)

                await replayAction(impl, actionId, savedAction)
            }
        })

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
    doAction(REVISION1_1_1, validateSchema('AnyAction')(req.body)).then((resp) => {
        if (resp.newState.game.status === 'err') {
            res.status(resp.newState.game.error.status_code)
            res.json(resp.newState.game.error)
        } else {
            res.status(200)
            res.json()
        }
    }).catch(next)
})

app.use('/batch', batch())

type DeleteCollectionRequest = {
    collectionId: string
}

async function handlePurge(): Promise<void> {
    for (const collection of await fsDb.listCollections()) {
        // Never purge the "actions" collection.
        if (collection.id !== 'actions') {
            await purgeCollection(collection)
        }
    }
}

async function purgeCollection(cref: CollectionReference): Promise<void> {
    // Never purge the "actions" collection.
    if (cref.id === 'actions') {
        throw new Error("unexpected 'actions' collection.")
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

    res.post('/replay', function(_req: Request<{}>, res, next) {
        handleReplay(REVISION1_2_0).then(result => {
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
