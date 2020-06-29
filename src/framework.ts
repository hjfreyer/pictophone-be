import * as db from './db'
import {
    AnyAction, SavedAction,
} from './model'
import { Option } from './util'
import { OptionData } from './util/option'
import { Key, Item } from './interfaces'


export interface Input2<TState> {
    getParent(label: string): Promise<Option<TState>>
}

export interface ParentLink {
    actionId: OptionData<string>
}

export interface Annotation2<TState> {
    labels: string[]
    parents: Record<string, ParentLink>
    state: TState
}

export interface Revision2<TState> {
    id: string
    validateAnnotation(u: unknown): Annotation2<TState>
    integrate(action: AnyAction, inputs: Input2<TState>): Promise<IntegrationResult2<TState>>
}

export interface IntegrationResult2<TState> {
    labels: string[]
    state: TState
}

export interface CollectionDiff {
    addedMembers: string[]
    deletedMembers: string[]
}

export interface IntegrationResult<TResult> {
    result: TResult
    impactedReferenceIds: string[]
    impactedCollections: Record<string, CollectionDiff>
}

export interface Integrator<TResult> {
    getNeededReferenceIds(db: db.Database, action: AnyAction): Promise<{ docs: string[], collections: string[] }>
    integrate(db: db.Database, savedAction: SavedAction): Promise<IntegrationResult<TResult>>
}
