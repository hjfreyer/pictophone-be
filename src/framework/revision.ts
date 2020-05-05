import { Change } from "./base";
import { DirectoryOp, Readables } from "./graph_builder";

export type Changes<StateSpec> = {
    [K in keyof StateSpec]: Change<StateSpec[K]>[]
}

export interface Result<ActionResponse, StateSpec> {
    response: ActionResponse
    changes: Changes<StateSpec>
}

export type GetAction<Revision> = Revision extends InitialRevision<infer A, infer _,infer _, infer _, infer _> ? A : never;

export type GetState<Revision> = Revision extends InitialRevision<infer _,infer _, infer S, infer _, infer _> ? S : never;

export interface InitialRevision<Action, ActionResponse, StateSpec, IntermediateSpec, DerivedSpec> {
    derive(): DirectoryOp<StateSpec, DerivedSpec>
    deriveIntermediate(): DirectoryOp<StateSpec, IntermediateSpec>
    integrate(action: Action, sources: Readables<StateSpec>, intermediates: Readables<IntermediateSpec>): Promise<Result<ActionResponse, StateSpec>>
}


export interface Revision<Previous, Action, ActionResponse, StateSpec, IntermediateSpec, DerivedSpec> {
    derive(): DirectoryOp<StateSpec, DerivedSpec>
    deriveIntermediate(): DirectoryOp<StateSpec, IntermediateSpec>
    integrate(action: Action, sources: Readables<StateSpec>, intermediates: Readables<IntermediateSpec>): Promise<Result<ActionResponse, StateSpec>>
    upgradeAction(old_action: GetAction<Previous>): Action
    upgradeState(): DirectoryOp<GetState<Previous>, StateSpec>
    downgradeState(): DirectoryOp<StateSpec, GetState<Previous>>
}

// export interface DerivedRevision {
//     preActionCollections(): any
//     postActionCollections(): any
//     evolve(action: any, sources : SourceCollection): any
//     upgradeState()
//     downgradeState()
//     upgradeAction()
// }
