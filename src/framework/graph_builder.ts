

import { Readable, Diff, ReadWrite } from './base';
import { Op, getSchema, InputInfo, MapFn } from './graph';
import { assertIsPermutation } from '../util';

export type DirectoryOp<StateSpec, DerivedSpec> = {
    [K in keyof DerivedSpec]: Op<StateSpec, DerivedSpec[K]>
}

// export type Readables<StateSpec> = {
//     [K in keyof StateSpec]: Readable<StateSpec[K]>
// }

export type DBs<StateSpec> = {
    [K in keyof StateSpec]: ReadWrite<StateSpec[K]>
}

export class OpBuilder<InputSpec, T> {
    private op: Op<InputSpec, T>
    constructor(op: Op<InputSpec, T>) { this.op = op; }

    static load<InputSpec, K extends keyof InputSpec>(key: K, schema: string[]): OpBuilder<InputSpec, InputSpec[K]> {
        return new OpBuilder({
            kind: 'load',
            schema,
            visit<R>(go: <K2 extends keyof InputSpec>(k: K2, ii_cast: (t: InputInfo<InputSpec[K2]>) => InputInfo<InputSpec[K]>,
                diff_cast: (t: Diff<InputSpec[K2]>[]) => Diff<InputSpec[K]>[]) => R): R {
                return go(key, x => x, x => x);
            }
        })
    }

    multiMap<O>(subSchema: string[], fn: (k: string[], i: T) => [string[], O][]): OpBuilder<InputSpec, O> {
        const self = this;
        return new OpBuilder({
            kind: 'map',
            visit<R>(go: (input: Op<InputSpec, T>, map: MapFn<T, O>) => R): R {
                return go(self.op, {
                    subSchema: subSchema,
                    map: fn
                })
            }
        })
    }

    map<O>(fn: (k: string[], i: T) => O): OpBuilder<InputSpec, O> {
        return this.multiMap([], (k, i) => { return [[[], fn(k, i)]] });
    }

    narrow<O>(fn: (k: string[], i: T) => i is T & O): OpBuilder<InputSpec, O> {
        return this.multiMap([], (k, i) => {
            if (fn(k, i)) {
                return [[[], i]]
            } else {
                return [];
            }
        });
    }

    indexBy(subSchema: string[], fn: (k: string[], i: T) => string[][]): OpBuilder<InputSpec, T> {
        return this.multiMap(subSchema, (k, i) => {
            const res: [string[], T][] = [];
            for (const subKey of fn(k, i)) {
                res.push([subKey, i]);
            }
            return res;
        });
    }

    reindex(newSchema: string[]): OpBuilder<InputSpec, T> {
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

    build(): Op<InputSpec, T> {
        return this.op;
    }
}
