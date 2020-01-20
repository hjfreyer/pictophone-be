import { SortedCollection, MappedSortedCollection, DBCollection } from "./framework/incremental";
import * as v1_0 from './model/v1.0'
import * as v1_1 from './model/v1.1'
import { Firestore, Transaction } from "@google-cloud/firestore";
import validator from "./model/validator";

export type BaseCollections = {
    'v1.0-state': SortedCollection<v1_0.State>
}

export function makeBaseCollections(db: Firestore, tx: Transaction): BaseCollections {
    return {
        'v1.0-state': new DBCollection(db, tx, ['v1.0-universe'], validator('v1.0', 'State'))
    }
}


export function derivedCollections(input: BaseCollections) {
    return {
        'v1.1-state': new MappedSortedCollection(
            ['v1.1-state-universe', 'v1.1-state-games'],
            v1_1.upgradeStateMapper,
            input['v1.0-state']
        )
    }
}