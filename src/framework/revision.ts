import { Change } from "./base";
import { DirectoryOp, Readables } from "./graph_builder";

export type Changes<StateSpec> = {
    [K in keyof StateSpec]: Change<StateSpec[K]>[]
}

export type GetAction<Revision> = Revision extends InitialRevision<infer A, infer _, infer _, infer _> ? A : never;

export type GetInput<Revision> = Revision extends InitialRevision<infer _, infer S, infer _, infer _> ? S : never;

export interface InitialRevision<Action, StateSpec, IntermediateSpec, DerivedSpec> {
    derive(): DirectoryOp<StateSpec, IntermediateSpec, DerivedSpec>
    integrate(action: Action, sources: Readables<StateSpec>): Promise<Changes<StateSpec>>
}

// export interface Revision<Action, StateSpec, IntermediateSpec, DerivedSpec> {
//     derive(): DirectoryOp<StateSpec, IntermediateSpec, DerivedSpec>
//     integrate(action: Action, sources: Readables<Sources>): Promise<Diffs<Sources>>
//     upgradeAction(old_action: GetAction<Previous>): Action
//     upgradeSources(): DirectoryOp<GetSources<Previous>, Sources>
//     downgradeSources(): DirectoryOp<Sources, GetSources<Previous>>
// }

// export interface DerivedRevision {
//     preActionCollections(): any
//     postActionCollections(): any
//     evolve(action: any, sources : SourceCollection): any
//     upgradeState()
//     downgradeState()
//     upgradeAction()
// }
