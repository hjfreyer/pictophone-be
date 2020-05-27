import { DocumentData, Transaction } from '@google-cloud/firestore'
import { Storage } from '@google-cloud/storage'
import cors from 'cors'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import uuid from 'uuid/v1'
import GetConfig from './config'
import { Action1_1, AnyAction, Action1_0, Game1_0, Game1_1, TaggedGame1_0, SavedAction, ActionTableMetadata, NumberValue } from './model'
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
import { Readable, Diff, ItemIterable, Range, Key, Item } from './interfaces'
import { strict as assert } from 'assert';


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

    return db.runTransaction(fsDb, async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        const [actionId, savedAction] = await doLiveIntegration1_1_0(upgradeAction(anyAction), ts);
        await replayIntegration1_1_1(actionId, savedAction, ts);
    })
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

type Tables = {
    actions: db.Table<SavedAction>
    actionTableMetadata: db.Table<ActionTableMetadata>
    state1_1_0_games: db.Table<Live<Game1_1>>
    state1_1_0_shortCodeUsageCount: db.Table<Live<NumberValue>>
    state1_1_1_games: db.Table<Live<Game1_1>>
    state1_1_1_shortCodeUsageCount: db.Table<Live<NumberValue>>
    state1_1_1_gamesByPlayer: db.Table<Live<Game1_1>>
}

function openAll(db: db.Database): Tables {
    return {
        actions: db.open({
            schema: ['actions'],
            validator: validateModel('SavedAction')
        }),
        actionTableMetadata: db.open({
            schema: ['actions', '_META_'],
            validator: validateModel('ActionTableMetadata')
        }),
        state1_1_0_games: db.open({
            schema: ['state-1.1.0-games'],
            validator: validateLive(validateModel('Game1_1'))
        }),
        state1_1_0_shortCodeUsageCount: db.open({
            schema: ['state-1.1.0-scuc'],
            validator: validateLive(validateModel('NumberValue'))
        }),
        state1_1_1_games: db.open({
            schema: ['state-1.1.1-games'],
            validator: validateLive(validateModel('Game1_1'))
        }),
        state1_1_1_shortCodeUsageCount: db.open({
            schema: ['state-1.1.1-scuc'],
            validator: validateLive(validateModel('NumberValue'))
        }),
        state1_1_1_gamesByPlayer: db.open({
            schema: ['players', 'state-1.1.1-games-by-player'],
            validator: validateLive(validateModel('Game1_1'))
        }),
    }
}

function validateLive<T>(validator: (u: unknown) => T): (u: unknown) => Live<T> {
    return (outerUnknown: unknown): Live<T> => {
        const outer = validateModel('LiveUnknown')(outerUnknown)
        if (outer.value === null) {
            return { actionId: outer.actionId, value: null };
        }
        return { actionId: outer.actionId, value: validator(outer.value) }
    }
}

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

type Inputs1_1 = {
    games: Readable<Game1_1>
    shortCodeUsageCount: Readable<NumberValue>
}

type Outputs1_1 = {
    games: Diff<Game1_1>[]
    shortCodeUsageCount: Diff<NumberValue>[]
}

type Outputs1_1_1 = {
    games: Diff<Game1_1>[]
    shortCodeUsageCount: Diff<NumberValue>[]
    gamesByPlayer: Diff<Game1_1>[]
}

function getTrackedInputs1_1(ts: Tables): [Set<string>, Inputs1_1] {
    const parentSet = new Set<string>();
    const inputs: Inputs1_1 = {
        games: {
            schema: ts.state1_1_0_games.schema,
            read(range: Range): ItemIterable<Game1_1> {
                const links = ixa.from(ts.state1_1_0_games.read(range))
                return links.pipe(
                    ixaop.tap(([, { actionId }]) => { parentSet.add(actionId) }),
                    ixaop.flatMap(([key, { value }]: Item<Live<Game1_1>>): ItemIterable<Game1_1> =>
                        value !== null ? ixa.of([key, value]) : ixa.empty())
                )
            }
        },
        shortCodeUsageCount: {
            schema: ts.state1_1_0_shortCodeUsageCount.schema,
            read(range: Range): ItemIterable<NumberValue> {
                const links = ixa.from(ts.state1_1_0_shortCodeUsageCount.read(range))
                return links.pipe(
                    ixaop.tap(([, { actionId }]) => { parentSet.add(actionId) }),
                    ixaop.flatMap(([key, { value }]: Item<Live<NumberValue>>): ItemIterable<NumberValue> =>
                        value !== null ? ixa.of([key, value]) : ixa.empty())
                )
            }
        }
    }
    return [parentSet, inputs]
}

function getTrackedInputs1_1_1(ts: Tables): [Set<string>, Inputs1_1] {
    const parentSet = new Set<string>();
    const inputs: Inputs1_1 = {
        games: {
            schema: ts.state1_1_1_games.schema,
            read(range: Range): ItemIterable<Game1_1> {
                const links = ixa.from(ts.state1_1_1_games.read(range))
                return links.pipe(
                    ixaop.tap(([, { actionId }]) => { parentSet.add(actionId) }),
                    ixaop.flatMap(([key, { value }]: Item<Live<Game1_1>>): ItemIterable<Game1_1> =>
                        value !== null ? ixa.of([key, value]) : ixa.empty())
                )
            }
        },
        shortCodeUsageCount: {
            schema: ts.state1_1_0_shortCodeUsageCount.schema,
            read(range: Range): ItemIterable<NumberValue> {
                const links = ixa.from(ts.state1_1_1_shortCodeUsageCount.read(range))
                return links.pipe(
                    ixaop.tap(([, { actionId }]) => { parentSet.add(actionId) }),
                    ixaop.flatMap(([key, { value }]: Item<Live<NumberValue>>): ItemIterable<NumberValue> =>
                        value !== null ? ixa.of([key, value]) : ixa.empty())
                )
            }
        }
    }
    return [parentSet, inputs]
}

function applyChanges<T>(t: db.Table<Live<T>>, actionId: string, changes: Change<T>[]): void {
    for (const change of changes) {
        switch (change.kind) {
            case 'set':
                t.set(change.key, { actionId, value: change.value });
                break;
            case 'delete':
                t.set(change.key, { actionId, value: null });
                break;
        }
    }
}

function applyOutputs1_1(ts: Tables, actionId: string, outputs: Outputs1_1): void {
    ts.actionTableMetadata.set([actionId, 'state-1.1.0'], getChangelog1_1(outputs));
    applyChanges(ts.state1_1_0_games, actionId, outputs.games.map(diffToChange))
    applyChanges(ts.state1_1_0_shortCodeUsageCount, actionId, outputs.shortCodeUsageCount.map(diffToChange))
}

function applyOutputs1_1_1(ts: Tables, actionId: string, outputs: Outputs1_1_1): void {
    ts.actionTableMetadata.set([actionId, 'state-1.1.1'], getChangelog1_1_1(ts, outputs));
    applyChanges(ts.state1_1_1_games, actionId, outputs.games.map(diffToChange))
    applyChanges(ts.state1_1_1_shortCodeUsageCount, actionId, outputs.shortCodeUsageCount.map(diffToChange))
    applyChanges(ts.state1_1_1_gamesByPlayer, actionId, outputs.gamesByPlayer.map(diffToChange))
}

function getChangelog1_1(outputs: Outputs1_1): ActionTableMetadata {
    return {
        tables: [{
            schema: ['state-1.1.0-games-symlinks'],
            changes: outputs.games.map(diffToChange),
        }, {
            schema: ['state-1.1.0-scuc-symlinks'],
            changes: outputs.shortCodeUsageCount.map(diffToChange),
        }]
    }
}

function getChangelog1_1_1(ts: Tables, outputs: Outputs1_1_1): ActionTableMetadata {
    return {
        tables: [{
            schema: ts.state1_1_1_games.schema,
            changes: outputs.games.map(diffToChange),
        }, {
            schema: ts.state1_1_1_shortCodeUsageCount.schema,
            changes: outputs.shortCodeUsageCount.map(diffToChange),
        }, {
            schema: ts.state1_1_1_gamesByPlayer.schema,
            changes: outputs.gamesByPlayer.map(diffToChange),
        }]
    }
}

async function integrate1_1MiddleHelper(a: Action1_1, inputs: Inputs1_1): Promise<Outputs1_1> {
    // Action1_1 + Game state + scuc state => Diffs of Games
    const gameDiffs = await integrate1_1Helper(a, inputs);

    // Diffs of games => Diffs of numbers indexed by short code and game.
    const indexedShortCodeDiffs = diffThroughMapper(mapShortCode, gameDiffs);

    // Diff of numbers indexed by short code => effective change
    // to count of each short code.
    const shortCodeDeltas = combineShortCodeDiffs(indexedShortCodeDiffs)

    // Effective delta + scuc state = scuc diffs.
    const aggregatedShortCodeDiffs = await integrate1_1SCUCs(shortCodeDeltas, inputs)

    return {
        games: gameDiffs,
        shortCodeUsageCount: aggregatedShortCodeDiffs,
    }
}

async function integrate1_1Helper(a: Action1_1, inputs: Inputs1_1): Promise<Diff<Game1_1>[]> {
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

const SUM_INTEGRATOR: Integrator<NumberValue, NumberValue> = {
    start: { value: 0 },
    integrate(key: Key, acc: NumberValue, action: NumberValue): NumberValue {
        return { value: acc.value + action.value }
    }
}

function integrate1_1SCUCs(as: Item<NumberValue>[], inputs: Inputs1_1): Promise<Diff<NumberValue>[]> {
    return ixa.toArray(integrate(SUM_INTEGRATOR, inputs.shortCodeUsageCount, as))
}

interface Integrator<TAction, TAccumulator> {
    start: TAccumulator
    integrate(key: Key, acc: TAccumulator, action: TAction): TAccumulator
}

function integrate<TAction, TAccumulator>(
    integrator: Integrator<TAction, TAccumulator>,
    accTable: Readable<TAccumulator>,
    actions: Item<TAction>[]): AsyncIterable<Diff<TAccumulator>> {
    return ixa.from(actions).pipe(
        ixaop.flatMap(async ([key, action]: Item<TAction>): Promise<AsyncIterable<Diff<TAccumulator>>> => {
            console.log(key, action)
            const oldAccOrNull = await readables.get(accTable, key, null);
            const oldAcc = oldAccOrNull !== null ? oldAccOrNull : integrator.start;
            const newAcc = integrator.integrate(key, oldAcc, action);
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

async function integrate1_1_1MiddleHelper(a: Action1_1, inputs: Inputs1_1): Promise<Outputs1_1_1> {
    const outputs1_1 = await integrate1_1MiddleHelper(a, inputs);

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
    return [[[game.shortCode, ...key], { value: 1 }]]
}

function combineShortCodeDiffs(diffs: Diff<NumberValue>[]): Item<NumberValue>[] {
    return Array.from(ix.from(diffs).pipe(
        ixop.map((diff: Diff<NumberValue>): [string, number] => {
            // Strip out gameId and turn the diff into a delta.
            const sc = diff.key[0]
            switch (diff.kind) {
                case 'add':
                    return [sc, diff.value.value]
                case 'delete':
                    return [sc, -diff.value.value]
                case 'replace':
                    return [sc, diff.newValue.value - diff.oldValue.value]
            }
        }),

        // Combine and drop 0-deltas.
        ixop.groupBy(([sc,]) => sc, ([, delta]) => delta,
            (sc, deltas): Item<NumberValue> => [[sc], { value: ix.sum(deltas) }]),
        ixop.filter(([, delta]) => delta.value !== 0),
    ))
}

async function doLiveIntegration1_1_0(action: Action1_1, ts: Tables): Promise<[string, SavedAction]> {
    // Set up inputs.
    const [parentSet, inputs] = getTrackedInputs1_1(ts);

    // Get outputs.
    const outputs = await integrate1_1MiddleHelper(action, inputs)

    // Save the action and metadata.
    const savedAction: SavedAction = { parents: util.sorted(parentSet), action }
    const actionId = getActionId(savedAction)

    ts.actions.set([actionId], savedAction);

    applyOutputs1_1(ts, actionId, outputs)

    return [actionId, savedAction]
}

export function diffToChange<T>(d: Diff<T>): Change<T> {
    switch (d.kind) {
        case 'add':
            return {
                kind: 'set',
                key: d.key,
                value: d.value,
            }
        case 'replace':
            return {
                kind: 'set',
                key: d.key,
                value: d.newValue,
            }
        case 'delete':
            return {
                kind: 'delete',
                key: d.key,
            }
    }
}

export type Change<V> = {
    key: string[]
    kind: 'set'
    value: V
} | {
    key: string[]
    kind: 'delete'
}

export interface Live<T> {
    actionId: string
    value: T | null
}

// TODO: these replays need to delete any errant orphans.

async function replayIntegration1_1_0(actionId: string, savedAction: SavedAction, ts: Tables): Promise<void> {
    // Set up inputs.
    const [parentSet, inputs] = getTrackedInputs1_1(ts);

    // Integrate the action.
    const outputs = await integrate1_1MiddleHelper(upgradeAction(savedAction.action), inputs)

    for (const usedParent of parentSet) {
        if (savedAction.parents.indexOf(usedParent) === -1) {
            throw new Error("tried to access state not specified by a parent")
        }
    }

    applyOutputs1_1(ts, actionId, outputs)
}


async function replayIntegration1_1_1(actionId: string, savedAction: SavedAction, ts: Tables): Promise<void> {
    // Set up inputs.
    const [parentSet, inputs] = getTrackedInputs1_1_1(ts);

    // Integrate the action.
    const outputs = await integrate1_1_1MiddleHelper(upgradeAction(savedAction.action), inputs)

    for (const usedParent of parentSet) {
        if (savedAction.parents.indexOf(usedParent) === -1) {
            throw new Error("tried to access state not specified by a parent")
        }
    }

    applyOutputs1_1_1(ts, actionId, outputs)
}

async function replay(): Promise<{}> {
    let cursor: Key = [''];
    console.log('REPLAY')
    while (true) {
        const nextAction = await db.runTransaction(fsDb,
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
            { collectionId: 'state-1.1.0', integrator: replayIntegration1_1_0 },
            { collectionId: 'state-1.1.1', integrator: replayIntegration1_1_1 },
        ]
        console.log(`REPLAY ${nextAction}`)

        for (const { collectionId, integrator } of replayers) {
            await db.runTransaction(fsDb, async (db: db.Database): Promise<void> => {
                const tables = openAll(db);
                const savedAction = (await readables.get(tables.actions, [nextAction], null));

                if (savedAction === null) {
                    throw new Error('wut');
                }

                const meta = await readables.get(tables.actionTableMetadata, [nextAction, collectionId], null);
                if (meta !== null) {
                    // Already done.
                    console.log(`- ${collectionId}: PASS`)
                    return;
                }

                const parentMetas = ixa.from(savedAction.parents).pipe(
                    ixaop.map(p => readables.get(tables.actionTableMetadata, [p, collectionId], null)),
                )

                if (await ixa.some(parentMetas, meta => meta === null)) {
                    console.log(`- ${collectionId}: PASS`)
                    return;
                }
                console.log(`- ${collectionId}: REPLAY`)
                await integrator(nextAction, savedAction, tables);
            });
        }
        cursor = [nextAction];
    }
    console.log('DONE')
    return {}
}

type DeleteRequest = {
    tableId: keyof Tables
}

async function deleteTable({ tableId }: DeleteRequest): Promise<void> {
    if (tableId === 'actions') {
        throw new Error('nope')
    }
    await db.runTransaction(fsDb, async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        if (!(tableId in ts)) {
            throw new Error(`no such table: "${tableId}"`)
        }
        const table: db.Table<unknown> = ts[tableId as keyof typeof ts];
        for await (const [k,] of readables.readAll(table)) {
            table.delete(k)
        }
    })
}
type DeleteMetaRequest = {
    collectionId: string
}

async function deleteMeta({ collectionId }: DeleteMetaRequest): Promise<void> {
    await db.runTransaction(fsDb, async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        for await (const [k,] of readables.readAll(ts.actionTableMetadata)) {
            if (k[k.length - 1] === collectionId) {
                ts.actionTableMetadata.delete(k)
            }
        }
    })
}

type DeleteCollectionRequest = {
    collectionId: string
}

async function deleteCollection({ collectionId }: DeleteCollectionRequest): Promise<void> {
    switch (collectionId) {
        case 'state-1.1.0':
            await deleteMeta({ collectionId: 'state-1.1.0' })
            await deleteTable({ tableId: 'state1_1_0_games' })
            await deleteTable({ tableId: 'state1_1_0_shortCodeUsageCount' })
            break
        case 'state-1.1.1':
            await deleteMeta({ collectionId: 'state-1.1.1' })
            await deleteTable({ tableId: 'state1_1_1_games' })
            await deleteTable({ tableId: 'state1_1_1_shortCodeUsageCount' })
            await deleteTable({ tableId: 'state1_1_1_gamesByPlayer' })
            break
        default:
            throw new Error("invalid option")
    }
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
        deleteCollection(req.params).then(result => {
            res.status(200)
            res.json(result)
        }).catch(next)
    })

    return res
}
