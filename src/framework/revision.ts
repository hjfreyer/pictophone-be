import { InputOp, Op, MapFn, MapFn2, Op2 } from "./graph";
import { Item, Diff, Readable, ReadWrite } from "./base";

export type DirectoryOp<SourceDir, DerivedDir> = {
    [K in keyof DerivedDir]: Op<SourceDir, DerivedDir[K]>
}

export type InputOps<StateSpec> = {
    [K in keyof StateSpec]: InputOp<StateSpec[K]>
}

export type OutputOps<StateSpec, DerivedSpec> = {
    [K in keyof DerivedSpec]: Op<StateSpec, DerivedSpec[K]>
}

export type Readables<StateSpec> = {
    [K in keyof StateSpec]: Readable<StateSpec[K]>
}

export type DBs<StateSpec> = {
    [K in keyof StateSpec]: ReadWrite<StateSpec[K]>
}

export type Diffs<StateSpec> = {
    [K in keyof StateSpec]: Diff<StateSpec[K]>[]
}
export type Source<S> = {
    [K in keyof S]: InputInfo<S[K]>
}


export interface InputInfo<T> {
    schema: string[]
    collectionId: string
    validator: (u: unknown) => T
}



export class OpBuilder<SourceDir, T> {
    private op: Op2<SourceDir, T>
    constructor(op: Op2<SourceDir, T>) { this.op = op; }

    static load<SourceDir, K extends keyof SourceDir>(k: K): OpBuilder<SourceDir, SourceDir[K]> {
        return new OpBuilder({
            kind: 'load',
            load(source: Source<SourceDir>): InputInfo<SourceDir[K]> {
                return source[k];
            }
        })
    }

    map<O>(fn: MapFn2<T, O>): OpBuilder<SourceDir, O> {
        const self = this;
        return new OpBuilder({
            kind: 'map',
            visit<R>(go: (input: Op2<SourceDir, T>, map: MapFn2<T, O>) => R): R {
                return go(self.op, fn)
            }
        })
    }
}

export type GetAction<Revision> = Revision extends InitialRevision<infer A, infer _, infer _> ? A : never;

export type GetSources<Revision> = Revision extends InitialRevision<infer _, infer S, infer _> ? S : never;

export interface InitialRevision<Action, Sources, Derived> {
    derive(): DirectoryOp<Sources, Derived>
    integrate(action: Action, sources: Readables<Sources>): Promise<Diffs<Sources>>
}

export interface Revision<Action, Sources, Derived, Previous> {
    derive(): DirectoryOp<Sources, Derived>
    integrate(action: Action, sources: Readables<Sources>): Promise<Diffs<Sources>>
    upgradeAction(old_action: GetAction<Previous>): Action
    upgradeSources(): DirectoryOp<GetSources<Previous>, Sources>
    downgradeSources(): DirectoryOp<Sources, GetSources<Previous>>
}

// export interface DerivedRevision {
//     preActionCollections(): any
//     postActionCollections(): any
//     evolve(action: any, sources : SourceCollection): any
//     upgradeState()
//     downgradeState()
//     upgradeAction()
// }
