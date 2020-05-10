import { MonoOp, Key, keySuccessor, ItemIterable, ScrambledSpace, SliceIterable, Slice, Item } from "./base";
import { Range, isSingleValue, singleValue } from "./range";
import _ from 'lodash';
import { permute, lexCompare, invertPermutation } from "./util";
import { from, of, first } from "ix/asynciterable";
import { map as iterMap, flatMap, skipWhile, tap } from "ix/asynciterable/operators";


export type SortedStreamMapFn<I, O> = (key: Key, value: I) => Iterable<[Key, O]>;


class MapOp<I, O> implements MonoOp<I, O>{
    constructor(private subschema: string[], private fn: SortedStreamMapFn<I, O>) { }

    impactedOutputRange(key: Key): Range {
        const subschemaPad = Array(this.subschema.length).fill("")
        return {
            kind: 'bounded',
            start: [...key, ...subschemaPad],
            end: [...keySuccessor(key), ...subschemaPad],
        }
    }

    map(input: ScrambledSpace<I>): ScrambledSpace<O> {
        const self = this;
        const outputSchema = [...input.schema, ...this.subschema];

        return {
            schema: outputSchema,
            seekTo(outputKey: Key): SliceIterable<O> {
                const inputKey = outputKey.slice(0, outputKey.length - self.subschema.length);
                return from(input.seekTo(inputKey))
                    .pipe(iterMap((inputSlice: Slice<I>): Slice<O> => {
                        const outputStart = [...inputSlice.range.start, ...self.subschema.map(_ => '')]
                        const outputRange: Range = inputSlice.range.kind === 'bounded'
                            ? {
                                kind: 'bounded', start: outputStart,
                                end: [...inputSlice.range.end, ...self.subschema.map(_ => '')]
                            }
                            : { kind: 'unbounded', start: outputStart };
                        return {
                            range: outputRange,
                            iter: from(inputSlice.iter)
                                .pipe(flatMap(([inputKey, inputValue]) => {
                                    return from(self.fn(inputKey, inputValue))
                                        .pipe(iterMap(([extension, outputValue]): Item<O> => [[...inputKey, ...extension], outputValue]));
                                }),
                                    skipWhile(([k,]) => lexCompare(k, outputKey) < 0))
                        }
                    }))
            }
        }
    }
}


export function sortedStreamMap<I, O>(subschema: string[], fn: SortedStreamMapFn<I, O>): MonoOp<I, O> {
    return new MapOp(subschema, fn);
}

export function map<I, O>(fn: (key: Key, value: I) => O): MonoOp<I, O> {
    return new MapOp([], (key, value) => [[[], fn(key, value)]]);
}

export function multiIndexBy<T>(field: string, extractor: (k: Key, t: T) => string[]): MonoOp<T, T> {
    return new MapOp([field], (key, value): Iterable<[Key, T]> => {
        const indices = extractor(key, value);
        indices.sort();
        return indices.map(idx => [[idx], value]);
    });
}

class TransposeOp<T> implements MonoOp<T, T>{
    constructor(private permutation: number[]) { }

    impactedOutputRange(key: Key): Range {
        return singleValue(permute(this.permutation, key));
    }

    map(input: ScrambledSpace<T>): ScrambledSpace<T> {
        const self = this;
        const outputSchema = permute(this.permutation, input.schema);

        return {
            schema: outputSchema,
            seekTo(outputStartAt: Key): SliceIterable<T> {
                const inputStartAt = permute(invertPermutation(self.permutation), outputStartAt);
                return from(input.seekTo(inputStartAt))
                    .pipe(flatMap((inputSlice: Slice<T>): SliceIterable<T> => {                        
                        return from(inputSlice.iter)
                            .pipe(iterMap(([inputKey, inputValue]): Slice<T> => {
                                const outputKey = permute(self.permutation, inputKey);
                                return {
                                    // TODO: Can do better than splitting every 
                                    // value into its own slice, under some circumstances.
                                    range: singleValue(outputKey),
                                    iter: of([outputKey, inputValue] as Item<T>)
                                }
                            }));
                    }));
            }
        }
    }
}

export function transpose<T>(permutation: number[]): MonoOp<T, T> {
    return new TransposeOp(permutation);
}