
import * as db from './db'
import { Live, Diff, Change } from './interfaces'
import { validate as validateModel } from './model/index.validator'
import { AnyAction, AnyError, SavedAction } from './model';
import { sha256 } from 'js-sha256';
import _ from 'lodash';
import { Tables } from './schema.auto';
import * as util from './util'
import * as ixa from "ix/asynciterable"
import * as ixaop from "ix/asynciterable/operators"
import * as readables from './readables'


export function validateLive<T>(validator: (u: unknown) => T): (u: unknown) => Live<T> {
    return (outerUnknown: unknown): Live<T> => {
        const outer = validateModel('LiveUnknown')(outerUnknown)
        if (outer.value === null) {
            return { actionId: outer.actionId, value: null };
        }
        return { actionId: outer.actionId, value: validator(outer.value) }
    }
}

export function applyChanges<T>(t: db.Table<Live<T>>, actionId: string, changes: Change<T>[]): void {
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

export async function integrateLive<Inputs, Outputs>(
    inputGetter: (ts: Tables) => [Set<string>, Inputs],
    integrator: (a: AnyAction, inputs: Inputs) => Promise<util.Result<Outputs, AnyError>>,
    outputSaver: (ts: Tables, actionId: string, outputs: Outputs) => void,
    ts: Tables,
    action: AnyAction): Promise<[string, SavedAction, AnyError | null]> {
    // Set up inputs.
    const [parentSet, inputs] = inputGetter(ts);

    // Get outputs.
    const outputsOrError = await integrator(action, inputs)

    // Save the action and metadata.
    const savedAction: SavedAction = { parents: util.sorted(parentSet), action }
    const actionId = getActionId(savedAction)

    ts.actions.set([actionId], savedAction);

    if (outputsOrError.status === 'ok') {
        outputSaver(ts, actionId, outputsOrError.value)
    }

    return [actionId, savedAction, outputsOrError.status === 'ok' ? null : outputsOrError.error];
}

export async function integrateReplay<Inputs, Outputs>(
    collectionId: string,
    inputGetter: (ts: Tables) => [Set<string>, Inputs],
    integrator: (a: AnyAction, inputs: Inputs) => Promise<util.Result<Outputs, AnyError>>,
    outputSaver: (ts: Tables, actionId: string, outputs: Outputs) => void,
    ts: Tables,
    actionId: string,
    savedAction: SavedAction): Promise<void> {
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

    if (outputs.status === 'ok') {
        outputSaver(ts, actionId, outputs.value)
    }
}
