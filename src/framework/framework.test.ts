import { index, Collection, InMemoryCollection, transpose, reduce1 } from "./inmem"
import {  } from "./incremental"

type PhilState = {
    state: 'thinking'
} | {
    state: 'eating'
    forkId: string
}

type ForkState = 'free' | 'busy'

describe('set up a pipeline', () => {
    const pipeline = (c: Collection<PhilState>): Collection<number> => {
        const op1 = index('forks', ([path, state]: [string[], PhilState]): Record<string, ForkState> => {
            if (state.state === 'thinking') { return {} }
            return {
                [state.forkId]: 'busy'
            }
        })
        const op2 = transpose<ForkState>([{newName: 'holders', newPosition: 1}, {newName: 'forks', newPosition: 0}])


        const inverted = op2(op1(c))

        return reduce1((path, values): number=>{
            return Object.values(values).length
        }, inverted)
    }
    test('basic stuff', () => {
        const c :Collection<PhilState> = new InMemoryCollection(['phils'], [
            [['a'], {state: 'thinking'}],
            [['b'], {state: 'eating', forkId: '1'}],
            [['c'], {state: 'eating', forkId: '1'}],
            [['d'], {state: 'eating', forkId: '2'}],
        ])
        expect(pipeline(c)).toMatchSnapshot()
    })


})
