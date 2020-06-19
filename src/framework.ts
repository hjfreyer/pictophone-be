import * as db from './db'
import {
    AnyAction,
    Reference
} from './schema'
import { Option } from './util'
import { OptionData } from './util/option'
import { Key, Item } from './interfaces'

export interface Input<TFacet> {
    getFacet(label: string): Promise<Option<TFacet>>
}

export interface Input2<TState> {
    getParent(label: string): Promise<Option<TState>>
}

export interface ParentLink {
    actionId: OptionData<string>
}

export interface Annotations<TFacet> {
    parents: Record<string, Reference>
    facets: Record<string, OptionData<TFacet>>
}

export interface Annotation2<TState> {
    labels: string[]
    parents: Record<string, ParentLink>
    state: TState
}


export interface Revision<TResult, TFacet> {
    id: string
    validateAnnotation(u: unknown): Annotations<TFacet>
    integrate(action: AnyAction, inputs: Input<TFacet>): Promise<IntegrationResult<TResult, TFacet>>
    activateFacet(db: db.Database, label: string, previous: OptionData<TFacet>, current: OptionData<TFacet>): Promise<void>
}

export interface Revision2<TState> {
    id: string
    validateAnnotation(u: unknown): Annotation2<TState>
    integrate(action: AnyAction, inputs: Input2<TState>): Promise<IntegrationResult2<TState>>
}

export interface IntegrationResult<TResult, TFacets> {
    result: TResult
    facets: Record<string, OptionData<TFacets>>
}

export interface IntegrationResult2<TState> {
    labels: string[]
    state: TState
}
