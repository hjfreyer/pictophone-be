
import * as ix from "ix/iterable";
import * as ixop from "ix/iterable/operators";
import * as ixa from "ix/asynciterable";
import * as ixaop from "ix/asynciterable/operators";
import { Diff, Item, Key, ItemIterable } from './interfaces';
import * as util from './util';
import deepEqual from "deep-equal";
import * as ixi from "ix/interfaces";
import * as fw from "./framework";
import * as db from './db';
import { VersionSpec, VersionSpecRequest } from "./model/base";
import { Option, option } from './util'

export function newDiff<T>(key: Key, oldValue: Option<T>, newValue: Option<T>): Option<Diff<T>> {
    if (!oldValue.data.some && !newValue.data.some) {
        return option.none()
    }
    if (!oldValue.data.some && newValue.data.some) {
        return option.some({
            key,
            kind: 'add',
            value: newValue.data.value,
        })
    }
    if (oldValue.data.some && !newValue.data.some) {
        return option.some({
            key,
            kind: 'delete',
            value: oldValue.data.value,
        })
    }
    if (oldValue.data.some && newValue.data.some) {
        if (deepEqual(oldValue, newValue, { strict: true })) {
            return option.none()
        } else {
            return option.some({
                key,
                kind: 'replace',
                oldValue: oldValue.data.value,
                newValue: newValue.data.value,
            })
        }
    }
    throw new Error("unreachable")
}
