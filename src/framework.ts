import * as db from './db'
import {
    AnyAction,
    Reference
} from './schema'
import { Option } from './util'
import { OptionData } from './util/option'

export interface Input<TFacet> {
    getFacet(label: string): Promise<Option<TFacet>>
}

export interface Annotations<TFacet> {
    parents: Record<string, Reference>
    facets: Record<string, OptionData<TFacet>>
}

export interface Revision<TResult, TFacet> {
    id: string
    validateAnnotation(u: unknown): Annotations<TFacet>
    integrate(action: AnyAction, inputs: Input<TFacet>): Promise<IntegrationResult<TResult, TFacet>>
    activateFacet(db: db.Database, label: string, previous: OptionData<TFacet>, current: OptionData<TFacet>): Promise<void>
}

export interface IntegrationResult<TResult, TFacets> {
    result: TResult
    facets: Record<string, OptionData<TFacets>>
}
