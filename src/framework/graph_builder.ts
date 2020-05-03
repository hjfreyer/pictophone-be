

import {Readable, Diff, ReadWrite} from './base';
import {Op, getSchema, InputInfo, MapFn} from './graph';
import {assertIsPermutation} from '../util';

export type DirectoryOp<StateSpec, IntermediateSpec, DerivedSpec> = {
    [K in keyof DerivedSpec]: Op<StateSpec, IntermediateSpec, DerivedSpec[K]>
}

export type Readables<StateSpec> = {
    [K in keyof StateSpec]: Readable<StateSpec[K]>
}

export type DBs<StateSpec> = {
    [K in keyof StateSpec]: ReadWrite<StateSpec[K]>
}

export class OpBuilder<InputSpec, IntermediateSpec, T> {
    private op: Op<InputSpec, IntermediateSpec, T>
    constructor(op: Op<InputSpec, IntermediateSpec, T>) { this.op = op; }

    static load<InputSpec, IntermediateSpec, K extends keyof InputSpec>(key: K, schema: string[]): OpBuilder<InputSpec, IntermediateSpec, InputSpec[K]> {
        return new OpBuilder({
            kind: 'load',
            schema,
            visit<R>(go: <K2 extends keyof InputSpec>(k: K2, ii_cast: (t: InputInfo<InputSpec[K2]>) => InputInfo<InputSpec[K]>,
                diff_cast: (t: Diff<InputSpec[K2]>[]) => Diff<InputSpec[K]>[]) => R): R {
                return go(key, x => x, x => x);
            }
        })
    }

    multiMap<O>(subSchema: string[], fn: (k: string[], i: T) => [string[], O][]): OpBuilder<InputSpec, IntermediateSpec, O> {
        const self = this;
        return new OpBuilder({
            kind: 'map',
            visit<R>(go: (input: Op<InputSpec, IntermediateSpec, T>, map: MapFn<T, O>) => R): R {
                return go(self.op, {
                    subSchema: subSchema,
                    map: fn
                })
            }
        })
    }

    map<O>(fn: (k: string[], i: T) => O): OpBuilder<InputSpec, IntermediateSpec, O> {
        return this.multiMap([], (k, i) => { return [[[], fn(k, i)]] });
    }

    indexBy(subSchema: string[], fn: (k: string[], i: T) => string[][]): OpBuilder<InputSpec, IntermediateSpec, T> {
        return this.multiMap(subSchema, (k, i) => {
            const res: [string[], T][] = [];
            for (const subKey of fn(k, i)) {
                res.push([subKey, i]);
            }
            return res;
        });
    }

    reindex(newSchema: string[]): OpBuilder<InputSpec, IntermediateSpec, T> {
        const schema = getSchema(this.op);

        // Might be backwards
        const permutation = newSchema.map(part => schema.indexOf(part));
        assertIsPermutation(permutation);
        return new OpBuilder({
            kind: 'transpose',
            input: this.op,
            permutation,
        })
    }

    build(): Op<InputSpec, IntermediateSpec, T> {
        return this.op;
    }
}