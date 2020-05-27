
import * as db from './db'
import { Live, Diff, Change } from './interfaces'
import { validate as validateModel } from './model/index.validator'

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
