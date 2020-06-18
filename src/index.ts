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
    "ANNOTATIONS,1.1.1": db.Table<state1_1_1.Annotations>
    "LABELS,1.1.1,games": db.Table<Reference>
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
        "ANNOTATIONS,1.1.1": db.open({
            schema: ['annotations-1.1.1'],
            validator: VALIDATORS['1.1.1']('Annotations')
        }),
        "LABELS,1.1.1,games": db.open({
            schema: ['labels-1.1.1'],
            validator: validateSchema('Reference')
        }),

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

type FetchedFacet<TFacet> = {
    label: string,
    actionId: string,
    value: Option<TFacet>
}

function doAction<TResult, TFacet>(impl: fw.Revision<TResult, TFacet>, action: AnyAction): Promise<TResult> {
    return db.runTransaction(fsDb)(async (d: db.Database): Promise<TResult> => {
        const fetched: FetchedFacet<TFacet>[] = []

        const annotationsTable = d.open({
            schema: [`annotations-${impl.id}`],
            validator: impl.validateAnnotation,
        })

        const labelsTable = d.open({
            schema: [`labels-${impl.id}`],
            validator: validateSchema('Reference')
        })

        const inputs: fw.Input<TFacet> = {
            async getFacet(label: string): Promise<Option<TFacet>> {
                const maybeRef = await readables.getOption(labelsTable, [label]);
                return await option.from(maybeRef).andThenAsync(async ref => {
                    const annos = option.from(await readables.getOption(annotationsTable, [ref.actionId])).unwrap();
                    const value = option.fromData(option.of(annos.facets[label]).unwrap());

                    fetched.push({
                        label,
                        actionId: ref.actionId,
                        value,
                    })
                    return value
                })
            }
        }

        const { result, facets } = await impl.integrate(action, inputs);

        const labelToParent: Record<string, Reference> = {};
        for (const { label, actionId } of fetched) {
            labelToParent[label] = { actionId };
        }
        const parentList: string[] = ix.toArray(ix.from(fetched).pipe(
            ixop.map(({ actionId }) => actionId),
            ixop.orderBy(actionId => actionId),
            ixop.distinct(),
        ))

        const savedAction: SavedAction = { parents: parentList, action };
        const actionId = getActionId(savedAction);

        const actionsWriter = openAll(d)["ACTIONS"].openWriter("action", db.WriterRole.PRIMARY);
        actionsWriter.set([actionId], savedAction)

        const annotationsWriter = annotationsTable.openWriter("action", db.WriterRole.PRIMARY);
        const labelsWriter = labelsTable.openWriter("action", db.WriterRole.PRIMARY);

        annotationsWriter.set([actionId], { parents: labelToParent, facets })
        for (const label in facets) {
            labelsWriter.set([label], { actionId });
            const maybeParentFacet = option.from(find(fetched, ({ label: l }) => l === label))
            const maybeOldValue = maybeParentFacet.andThen(({ value }) => value);
            await impl.activateFacet(d, label, maybeOldValue.data, facets[label])
        }

        return result;
    })
}

function replayAction<TResult, TFacet>(impl: fw.Revision<TResult, TFacet>, actionId: string, action: SavedAction): Promise<void> {
    return db.runTransaction(fsDb)(async (d: db.Database): Promise<void> => {
        const fetched: FetchedFacet<TFacet>[] = []

        const annotationsTable = d.open({
            schema: [`annotations-${impl.id}`],
            validator: impl.validateAnnotation,
        })

        const labelsTable = d.open({
            schema: [`labels-${impl.id}`],
            validator: validateSchema('Reference')
        })

        const inputs: fw.Input<TFacet> = {
            async getFacet(label: string): Promise<Option<TFacet>> {
                const maybeRef = await readables.getOption(labelsTable, [label]);
                return await option.from(maybeRef).andThenAsync(async ref => {
                    const annos = option.from(await readables.getOption(annotationsTable, [ref.actionId])).unwrap();
                    const value = option.fromData(option.of(annos.facets[label]).unwrap());

                    fetched.push({
                        label,
                        actionId: ref.actionId,
                        value,
                    })
                    return value
                })
            }
        }

        const { facets } = await impl.integrate(action.action, inputs);

        const labelToParent: Record<string, Reference> = {};
        for (const { label, actionId } of fetched) {
            labelToParent[label] = { actionId };
        }
        for (const f of fetched) {
            if (action.parents.indexOf(f.actionId) === -1) {
                throw new Error("Illegal parent fetch!");
            }
        }

        const annotationsWriter = annotationsTable.openWriter("replay", db.WriterRole.PRIMARY);
        const labelsWriter = labelsTable.openWriter("replay", db.WriterRole.PRIMARY);

        annotationsWriter.set([actionId], { parents: labelToParent, facets })
        for (const label in facets) {
            labelsWriter.set([label], { actionId });
            const maybeParentFacet = option.from(find(fetched, ({ label: l }) => l === label))
            const maybeOldValue = maybeParentFacet.andThen(({ value }) => value);
            await impl.activateFacet(d, label, maybeOldValue.data, facets[label])
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

function checkAction<TResult, TFacet>(impl: fw.Revision<TResult, TFacet>,
    actionId: string, action: SavedAction, annotations: fw.Annotations<TFacet>): Promise<void> {
    return db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {

        const annotationsTable = db.open({
            schema: [`annotations-${impl.id}`],
            validator: impl.validateAnnotation,
        })


        const fetched: FetchedFacet<TFacet>[] = []
        const inputs: fw.Input<TFacet> = {
            async getFacet(label: string): Promise<Option<TFacet>> {
                const maybeParent = option.of(annotations.parents[label]);

                return await maybeParent.andThenAsync(async ref => {
                    const annos = option.from(await readables.getOption(annotationsTable, [ref.actionId])).unwrap();
                    const value = option.fromData(option.of(annos.facets[label]).unwrap());

                    fetched.push({
                        label,
                        actionId: ref.actionId,
                        value,
                    })
                    return value
                })
            }
        }

        const { facets } = await impl.integrate(action.action, inputs);

        const labelToParent: Record<string, Reference> = {};
        for (const { label, actionId } of fetched) {
            labelToParent[label] = { actionId };
        }
        const parentList: string[] = ix.toArray(ix.from(fetched).pipe(
            ixop.map(({ actionId }) => actionId),
            ixop.orderBy(actionId => actionId),
            ixop.distinct(),
        ))

        const actualAnnotations: fw.Annotations<TFacet> = {
            parents: labelToParent,
            facets,
        }

        assert.deepEqual(parentList, action.parents);
        assert.deepEqual(actualAnnotations, annotations);
    })
}

async function handleReplay<TResult, TFacet>(impl: fw.Revision<TResult, TFacet>): Promise<void> {
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
                console.log(`CHECK ${actionId}`)

                await checkAction(impl, actionId, savedAction, annos)
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
        if (resp.data.status === 'err') {
            res.status(resp.data.error.status_code)
            res.json(resp)
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
        handleReplay(REVISION1_1_1).then(result => {
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

    res.post('/delete/:collectionId', function(req: Request<DeleteCollectionRequest>, res, next) {
        deleteCollection(db.runTransaction(fsDb), req.params.collectionId as CollectionId).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    return res
}

async function deleteCollection(runner: db.TxRunner, collectionId: CollectionId): Promise<void> {
    await runner(async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        switch (collectionId) {
            case '1.1.1':
                await deleteTable(ts['ANNOTATIONS,1.1.1'])
                await deleteTable(ts["LABELS,1.1.1,games"]);
        }
    })
}
