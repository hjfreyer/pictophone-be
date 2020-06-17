import { CollectionReference } from '@google-cloud/firestore'
import { strict as assert } from 'assert'
import cors from 'cors'
import deepEqual from 'deep-equal'
import express, { Router } from 'express'
import { Dictionary, Request } from 'express-serve-static-core'
import admin from 'firebase-admin'
import produce from 'immer'
import * as ixa from "ix/asynciterable"
import * as ix from "ix/iterable"
import * as ixop from "ix/iterable/operators"
import { applyChangesSimple, diffToChange, getActionId } from './base'
import * as db from './db'
import * as diffs from './diffs'
import { Change, Diff, Item, item, Key } from './interfaces'
import * as model1_0 from './model/1.0'
import { validate as validate1_0 } from './model/1.0.validator'
import * as model1_1 from './model/1.1'
import * as state1_1_1 from './model/1.1.1'
import { validate as validate1_1_1 } from './model/1.1.1.validator'
import { validate as validate1_1 } from './model/1.1.validator'
import * as readables from './readables'
import {
    AnyAction, AnyError, CollectionId,
    deleteTable, Reference, SavedAction
} from './schema'
import { validate as validateSchema } from './schema/interfaces.validator'
import * as util from './util'
import { Defaultable, defaultable, Option, option, Result, result } from './util'
import { OptionData } from './util/option'

export interface Input<TFacet> {
    getFacet(label: string): Promise<Option<TFacet>>
}

export interface Annotation<TFacet> {
    parents: Record<string, Reference>
    facets: Record<string, OptionData<TFacet>>
}

export interface Revision<TResult, TFacet> {
    id: string
    validateAnnotation(u: unknown): Annotation<TFacet>
    integrate(action: AnyAction, inputs: Input<TFacet>): Promise<IntegrationResult<TResult, TFacet>>
    activateFacet(db: db.Database, label: string, previous: OptionData<TFacet>, current: OptionData<TFacet>): Promise<void>
}

export interface IntegrationResult<TResult, TFacets> {
    result: TResult
    facets: Record<string, OptionData<TFacets>>
}
