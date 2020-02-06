import { SortedCollection, MappedSortedCollection, SortedDynamicCollection, Diff, MappedSortedDynamicCollection, TransposedCollection } from "./framework/incremental";
import * as v1_0 from './model/v1.0'
import * as v1_1 from './model/v1.1'
import { Firestore, Transaction } from "@google-cloud/firestore";
import validator from "./model/validator";
import { DBCollection } from "./framework/db";

export type SavedCollections = {
    'v1.0-state': SortedCollection<v1_0.State>
    'v1.0-exports': SortedCollection<v1_0.Export>
    'v1.1-state': SortedCollection<v1_1.State>
}

export function makeSavedCollections(db: Firestore, tx: Transaction): SavedCollections {
    return {
        'v1.0-state': new DBCollection(db, tx, ['v1.0-universe'], validator('v1.0', 'State')),
        'v1.0-exports': new DBCollection(
            db, tx, ['v1.0-exports', 'v1.0-exports-players', 'v1.0-exports-games'],
            validator('v1.0', 'Export')),
        'v1.1-state': new DBCollection(db, tx, ['v1.1-state-universe', 'v1.1-state-games'],
            validator('v1.1', 'State'))
    }
}

export function derivedDynamicCollections(
    input: SortedDynamicCollection<v1_0.State, v1_0.Action, Diff<v1_0.State>>) {
    return {
        'v1.1-state': new MappedSortedDynamicCollection(
            ['v1.1-state-universe', 'v1.1-state-games'],
            v1_1.upgradeStateMapper,
            input
        ),
        'v1.0-exports': new MappedSortedDynamicCollection(
            ['v1.0-exports', 'v1.0-exports-players', 'v1.0-exports-games'],
            v1_0.exportMapper,
            input)
    }
}

export function derivedCollections(input: SortedCollection<v1_0.State>) {
    const state1_1=new MappedSortedCollection(
            ['v1.1-state-universe', 'v1.1-state-games'],
            v1_1.upgradeStateMapper,
            input
        )
    const exports1_1_bad_order = new MappedSortedCollection(
            ['v1.1-exports', 'v1.1-exports-games', 'v1.1-exports-players'],
            v1_1.exportMapper,
            state1_1)

    const exports1_1 = new TransposedCollection(
        ['v1.1-exports', 'v1.1-exports-players', 'v1.1-exports-games'],
        [0, 2, 1],
        exports1_1_bad_order)

    return {
        'v1.1-state':state1_1 ,
        'v1.1-exports': exports1_1,
        'v1.0-exports': new MappedSortedCollection(
            ['v1.0-exports', 'v1.0-exports-players', 'v1.0-exports-games'],
            v1_0.exportMapper,
            input)
    }
}