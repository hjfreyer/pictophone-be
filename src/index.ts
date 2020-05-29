import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import GetConfig from './config'
import { Action1_1, AnyAction, Action1_0, Game1_0, Game1_1, TaggedGame1_0, SavedAction, ActionTableMetadata, NumberValue } from './model'
import * as model from './model'
import { validate as validateModel } from './model/index.validator'
import { Drawing, UploadResponse } from './model/rpc'
import { validate as validateRpc } from './model/rpc.validator'
import * as util from './util'
import deepEqual from 'deep-equal'
import timestamp from 'timestamp-nano';

import { sha256 } from 'js-sha256';
import _ from 'lodash';
import * as ix from "ix/iterable"
import * as ixop from "ix/iterable/operators"
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import * as db from './db'
import * as readables from './readables'
import * as ranges from './ranges'
import { Readable, Diff, ItemIterable, Range, Key, Item, Live, Change } from './interfaces'
import { strict as assert } from 'assert';
import {
    openAll, Tables, applyOutputs1_1_0, applyOutputs1_1_1, Outputs1_1_0, Outputs1_1_1,
    Inputs1_1_0, Inputs1_1_1, getTrackedInputs1_1_0, getTrackedInputs1_1_1, deleteCollection
} from './schema.auto';


admin.initializeApp({
    credential: admin.credential.applicationDefault()
})

const storage = new Storage()
const fsDb = admin.firestore()

// Create a new express application instance
const app: express.Application = express()
app.set('json spaces', 2)
app.use(express.json())

const port = process.env.PORT || 3000
app.listen(port, function() {
    console.log(`Example app listening on port ${port}!`)
})

const HASH_HEX_CHARS_LEN = (32 / 8) * 2;  // 32 bits of hash
function serializeActionId(date: Date, hashHex: string): string {
    return `0${date.toISOString()}${hashHex.slice(0, HASH_HEX_CHARS_LEN)}`
}

function parseActionId(serialized: string): [Date, string] {
    if (serialized[0] !== '0') {
        throw new Error('unknown action ID format');
    }

    const dateStr = serialized.slice(1, serialized.length - HASH_HEX_CHARS_LEN);
    const hashStr = serialized.slice(serialized.length - HASH_HEX_CHARS_LEN);

    return [new Date(dateStr), hashStr]
}

export function getActionId(action: SavedAction): string {
    // TODO: JSON.stringify isn't deterministic, so what's saved in the DB
    // should really be a particular serialization, but I'm not worrying
    // about that at the moment.
    const hashHex = sha256.hex(JSON.stringify(action));
    const maxDate = _.max(action.parents.map(id => parseActionId(id)[0]));

    let now = new Date();

    // TODO: just fake the date rather than waiting.
    while (maxDate !== undefined && now < maxDate) {
        now = new Date();
    }
    return serializeActionId(now, hashHex);
}

const MAX_POINTS = 50_000

async function doUpload(body: unknown): Promise<UploadResponse> {
    const upload = validateRpc('Upload')(body)

    if (MAX_POINTS < numPoints(upload)) {
        throw new Error('too many points in drawing')
    }

    const id = `uuid/${uuid()}`
    await storage.bucket(GetConfig().gcsBucket).file(id).save(JSON.stringify(upload))

    return { id }
}

function numPoints(drawing: Drawing): number {
    let res = 0
    for (const path of drawing.paths) {
        res += path.length / 2
    }
    return res
}

function upgradeAction(action: AnyAction): Action1_1 {
    switch (action.version) {
        case '1.0':
            action = upgradeAction1_0(action);
        case '1.1':
            return action;
    }
}

function doAction(fsDb: FirebaseFirestore.Firestore, body: unknown): Promise<void> {
    const anyAction = validateModel('AnyAction')(body)

    return db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        const [actionId, savedAction] = await doLiveIntegration1_1_0(upgradeAction(anyAction), ts);

        await doReplay1_1_1(actionId, savedAction, ts);
    })
}

function doReplay1_1_0(actionId: string, savedAction: model.SavedAction, ts: Tables): Promise<void> {
    return replayCollection(ts, getTrackedInputs1_1_0, actionId, savedAction, 'state-1.1.0',
        replayIntegration1_1_0, applyOutputs1_1_0)
}

function doReplay1_1_1(actionId: string, savedAction: model.SavedAction, ts: Tables): Promise<void> {
    return replayCollection(ts, getTrackedInputs1_1_1, actionId, savedAction, 'state-1.1.1',
        replayIntegration1_1_1, applyOutputs1_1_1)
}

app.options('/action', cors())
app.post('/action', cors(), function(req: Request<Dictionary<string>>, res, next) {
    doAction(fsDb, req.body).then((resp) => {
        res.status(200)
        res.json(resp)
    }).catch(next)
})

app.options('/upload', cors())
app.post('/upload', cors(), function(req: Request<Dictionary<string>>, res, next) {
    doUpload(req.body).then(resp => {
        res.status(200)
        res.json(resp)
    }).catch(next)
})


app.use('/batch', batch())


function defaultGame1_1(): Game1_1 {
    return {
        state: 'UNCREATED'
    }
}

function upgradeAction1_0(a: Action1_0): Action1_1 {
    switch (a.kind) {
        case 'join_game':
            return {
                version: '1.1',
                kind: 'join_game',
                gameId: a.gameId,
                playerId: a.playerId,
                createIfNecessary: true,
            }
    }
}


async function integrate1_1_0MiddleHelper(a: Action1_1, inputs: Inputs1_1_0): Promise<Outputs1_1_0> {
    // Action1_1 + Game state + scuc state => Diffs of Games
    const gameDiffs = await integrate1_1_0Helper(a, inputs);

    // Diffs of games => Diffs of numbers indexed by short code.
    const indexedShortCodeDiffs = diffThroughMapper(mapShortCode, gameDiffs);

    // Diffs of indexed short code count => diffs of sums to apply to DB.
    const shortCodeUsageCountDiffs = await combine(SUM_COMBINER, inputs.shortCodeUsageCount, indexedShortCodeDiffs)

    return {
        games: gameDiffs,
        shortCodeUsageCount: shortCodeUsageCountDiffs,
    }
}

async function integrate1_1_0Helper(a: Action1_1, inputs: Inputs1_1_0): Promise<Diff<Game1_1>[]> {
    const game = await readables.get(inputs.games, [a.gameId], defaultGame1_1());
    switch (a.kind) {
        case 'join_game':
            if (game.state === 'UNCREATED') {
                if (a.createIfNecessary) {
                    return [{
                        kind: 'replace',
                        key: [a.gameId],
                        oldValue: game,
                        newValue: {
                            state: 'CREATED',
                            players: [a.playerId],
                            shortCode: '',
                        }
                    }]
                } else {
                    return []
                }
            }
            if (game.players.indexOf(a.playerId) !== -1) {
                return []
            }
            return [{
                kind: 'replace',
                key: [a.gameId],
                oldValue: game,
                newValue: {
                    ...game,
                    players: [...game.players, a.playerId],

                }
            }]

        case 'create_game':
            if (game.state !== 'UNCREATED') {
                return []
            }
            if (a.shortCode === '') {
                return []
            }
            const scCount = await readables.get(inputs.shortCodeUsageCount, [a.shortCode], { value: 0 });
            if (scCount.value !== 0) {
                return []
            }
            return [{
                kind: 'replace',
                key: [a.gameId],
                oldValue: game,
                newValue: {
                    state: 'CREATED',
                    players: [],
                    shortCode: a.shortCode
                }
            }]
    }
}


interface Combiner<T> {
    identity(): T
    opposite(n: T): T
    combine(a: T, b: T): T
}

const SUM_COMBINER: Combiner<NumberValue> = {
    identity(): NumberValue { return { value: 0 } },
    opposite(n: NumberValue): NumberValue { return { value: -n.value } },
    combine(a: NumberValue, b: NumberValue): NumberValue {
        return { value: a.value + b.value }
    }
}

function combine<T>(
    combiner: Combiner<T>,
    accTable: Readable<T>,
    diffs: Diff<T>[]): Promise<Diff<T>[]> {
    const deltas: Item<T>[] = Array.from(ix.from(diffs).pipe(
        ixop.flatMap((diff: Diff<T>): Item<T>[] => {
            switch (diff.kind) {
                case 'add':
                    return [[diff.key, diff.value]];
                case 'delete':
                    return [[diff.key, combiner.opposite(diff.value)]];
                case 'replace':
                    return [[diff.key, diff.newValue], [diff.key, combiner.opposite(diff.oldValue)]];
            }
        }),
        ixop.groupBy(
            ([key, delta]) => JSON.stringify(key),
            ([key, delta]) => delta,
            (key_json, deltas) => {
                return [JSON.parse(key_json), ix.reduce(deltas, combiner.combine, combiner.identity())]
            })
    ))

    const reducer: Reducer<T, T> = {
        start: combiner.identity(),
        reduce(key: Key, acc: T, delta: T): T {
            return combiner.combine(acc, delta)
        }
    }

    return ixa.toArray(reduce(reducer, accTable, deltas))
}

const SUM_REDUCER: Reducer<NumberValue, NumberValue> = {
    start: { value: 0 },
    reduce(_key: Key, acc: NumberValue, action: NumberValue): NumberValue {
        return { value: acc.value + action.value }
    }
}

interface Reducer<TAction, TAccumulator> {
    start: TAccumulator
    reduce(key: Key, acc: TAccumulator, action: TAction): TAccumulator
}

function reduce<TAction, TAccumulator>(
    reducer: Reducer<TAction, TAccumulator>,
    accTable: Readable<TAccumulator>,
    actions: Item<TAction>[]): AsyncIterable<Diff<TAccumulator>> {
    return ixa.from(actions).pipe(
        ixaop.flatMap(async ([key, action]: Item<TAction>): Promise<AsyncIterable<Diff<TAccumulator>>> => {
            const oldAccOrNull = await readables.get(accTable, key, null);
            const oldAcc = oldAccOrNull !== null ? oldAccOrNull : reducer.start;
            const newAcc = reducer.reduce(key, oldAcc, action);
            if (deepEqual(oldAcc, newAcc)) {
                return ixa.empty();
            }
            if (oldAccOrNull === null) {
                return ixa.of({
                    kind: 'add',
                    key,
                    value: newAcc
                })
            } else {
                return ixa.of({
                    kind: 'replace',
                    key,
                    oldValue: oldAcc,
                    newValue: newAcc,
                })
            }
        })
    )
}

async function integrate1_1_1MiddleHelper(a: Action1_1, inputs: Inputs1_1_0): Promise<Outputs1_1_1> {
    const outputs1_1 = await integrate1_1_0MiddleHelper(a, inputs);

    return {
        ...outputs1_1,
        gamesByPlayer: diffThroughMapper(gameToGamesByPlayer, outputs1_1.games)
    }
}

function gameToGamesByPlayer([gameKey, game]: Item<Game1_1>): Item<Game1_1>[] {
    if (game.state !== 'CREATED') {
        return []
    }
    return util.sorted(game.players).map((playerId): Item<Game1_1> => [[playerId, ...gameKey], game])
}

interface Mapper<I, O> {
    // Must be injective: input items with different keys must never produce 
    // output items with the same key.
    (item: Item<I>): Item<O>[]
}

function diffThroughMapper<I, O>(mapper: Mapper<I, O>, diffs: Diff<I>[]): Diff<O>[] {
    return _.flatMap(diffs, d => singleDiffThroughMapper(mapper, d))
}

function singleDiffThroughMapper<I, O>(mapper: Mapper<I, O>, diff: Diff<I>): Diff<O>[] {
    const [oldMapped, newMapped] = (() => {
        switch (diff.kind) {
            case 'add':
                return [[], mapper([diff.key, diff.value])]
            case 'delete':
                return [mapper([diff.key, diff.value]), []]
            case 'replace':
                return [mapper([diff.key, diff.oldValue]), mapper([diff.key, diff.newValue])]
        }
    })()
    type AgedItem = { age: 'old' | 'new', key: Key, value: O };
    const tagger = (age: 'old' | 'new') => ([key, value]: Item<O>): AgedItem => ({ age, key, value });

    const aged: ix.IterableX<AgedItem> = ix.concat(
        oldMapped.map(tagger('old')),
        newMapped.map(tagger('new')));
    return Array.from(aged.pipe(
        ixop.groupBy(({ key }) => JSON.stringify(key), x => x, (_, valueIter) => {
            const values = Array.from(valueIter);
            if (values.length === 0) {
                throw new Error("wtf")
            }
            if (2 < values.length) {
                throw new Error("mapper must have returned the same key multiple times")
            }
            if (values.length === 1) {
                const [{ age, key, value }] = values;
                return {
                    kind: age === 'old' ? 'delete' : 'add',
                    key,
                    value,
                }
            }
            // Else, values has 2 elements.
            if (values[0].age === values[1].age) {
                throw new Error("mapper must have returned the same key multiple times")
            }
            return {
                kind: 'replace',
                key: values[0].key,
                oldValue: values[0].age === 'old' ? values[0].value : values[1].value,
                newValue: values[0].age === 'new' ? values[0].value : values[1].value,
            }
        })
    ))
}

function mapShortCode([key, game]: Item<Game1_1>): Item<NumberValue>[] {
    if (game.state !== 'CREATED' || game.shortCode === '') {
        return []
    }
    return [[[game.shortCode], { value: 1 }]]
}

async function doLiveIntegration1_1_0(action: Action1_1, ts: Tables): Promise<[string, SavedAction]> {
    // Set up inputs.
    const [parentSet, inputs] = getTrackedInputs1_1_0(ts);

    // Get outputs.
    const outputs = await integrate1_1_0MiddleHelper(action, inputs)

    // Save the action and metadata.
    const savedAction: SavedAction = { parents: util.sorted(parentSet), action }
    const actionId = getActionId(savedAction)

    ts.actions.set([actionId], savedAction);

    applyOutputs1_1_0(ts, actionId, outputs)

    return [actionId, savedAction]
}

function replayIntegration1_1_0(a: AnyAction, inputs: Inputs1_1_0): Promise<Outputs1_1_0> {
    return integrate1_1_0MiddleHelper(upgradeAction(a), inputs)
}

function replayIntegration1_1_1(a: AnyAction, inputs: Inputs1_1_1): Promise<Outputs1_1_1> {
    return integrate1_1_1MiddleHelper(upgradeAction(a), inputs)
}

async function replayCollection<Inputs, Outputs>(
    ts: Tables,
    inputGetter: (ts: Tables) => [Set<string>, Inputs],
    actionId: string,
    savedAction: SavedAction,
    collectionId: string,
    integrator: (a: AnyAction, inputs: Inputs) => Promise<Outputs>,
    outputSaver: (ts: Tables, actionId: string, outputs: Outputs) => void): Promise<void> {
    // Set up inputs.
    const [parentSet, inputs] = inputGetter(ts);

    const meta = await readables.get(ts.actionTableMetadata, [actionId, collectionId], null);
    if (meta !== null) {
        // Already done.
        console.log(`- ${collectionId}: PASS`)
        return;
    }

    const parentMetas = ixa.from(savedAction.parents).pipe(
        ixaop.map(p => readables.get(ts.actionTableMetadata, [p, collectionId], null)),
    )

    if (await ixa.some(parentMetas, meta => meta === null)) {
        console.log(`- ${collectionId}: PASS`)
        return;
    }
    console.log(`- ${collectionId}: REPLAY`)
    const outputs = await integrator(savedAction.action, inputs);

    for (const usedParent of parentSet) {
        if (savedAction.parents.indexOf(usedParent) === -1) {
            throw new Error("tried to access state not specified by a parent")
        }
    }

    outputSaver(ts, actionId, outputs)
}

async function replay(): Promise<{}> {
    let cursor: Key = [''];
    console.log('REPLAY')
    while (true) {
        const nextAction = await db.runTransaction(fsDb)(
            async (db: db.Database): Promise<string | null> => {
                const tables = openAll(db);
                const first = await ixa.first(ixa.from(readables.readAllAfter(tables.actions, cursor!)));
                if (first === undefined) {
                    return null;
                }
                const [[actionId],] = first;
                return actionId;
            }
        );
        if (nextAction === null) {
            break;
        }
        const replayers = [
            doReplay1_1_0,
            doReplay1_1_1,
        ]
        console.log(`REPLAY ${nextAction}`)

        for (const replayer of replayers) {
            await db.runTransaction(fsDb)(async (db: db.Database): Promise<void> => {
                const ts = openAll(db);

                const savedAction = (await readables.get(ts.actions, [nextAction], null));
                if (savedAction === null) {
                    throw new Error('wut');
                }

                await replayer(nextAction, savedAction, ts);
            });
        }

        cursor = [nextAction];
    }
    console.log('DONE')
    return {}
}

type DeleteCollectionRequest = {
    collectionId: string
}

function batch(): Router {
    const res = Router()

    // res.post('/check', function(_req: Request<{}>, res, next) {
    //     const cursor = _req.body as BackwardsCheckCursor
    //     check(db, cursor).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    res.post('/replay', function(req: Request<{}>, res, next) {
        replay().then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    // res.post('/backfill', function(_req: Request<{}>, res, next) {
    //     const cursor = _req.body as BackwardsCheckCursor
    //     backfill(db, cursor).then(result => {
    //         res.status(200)
    //         res.json(result)
    //     }).catch(next)
    // })

    res.post('/delete/:collectionId', function(req: Request<DeleteCollectionRequest>, res, next) {
        deleteCollection(db.runTransaction(fsDb), req.params.collectionId).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    return res
}
