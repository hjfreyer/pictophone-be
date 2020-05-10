import { MonoOp, Key, keySuccessor, ItemIterable, ScrambledSpace, SliceIterable, Slice, Item } from "./base";
import { Range, isSingleValue, singleValue } from "./range";
import _ from 'lodash';
import { permute, lexCompare, invertPermutation } from "./util";
import { from, of } from "ix/asynciterable";
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
        const subschemaPad = Array(this.subschema.length).fill("")

        return {
            schema: outputSchema,
            seekTo(outputKey: Key): SliceIterable<O> {
                const inputKey = outputKey.slice(0, outputKey.length - self.subschema.length);
                return from(input.seekTo(inputKey))
                    .pipe(iterMap((inputSlice: Slice<I>): Slice<O> => {
                        const outputStart = [...inputSlice.range.start, ...subschemaPad];
                        const outputRange: Range = inputSlice.range.kind === 'bounded'
                            ? { kind: 'bounded', start: outputStart, end: [...inputSlice.range.end, ...subschemaPad] }
                            : { kind: 'unbounded', start: outputStart };
                        return {
                            schema: outputSchema,
                            range: outputRange,
                            seekTo(outputKey: Key): ItemIterable<O> {
                                const inputKey = outputKey.slice(0, outputKey.length - self.subschema.length);
                                const inputIter = inputSlice.seekTo(inputKey);

                                return from(inputIter)
                                    .pipe(flatMap(([inputKey, inputValue]) => {
                                        return from(self.fn(inputKey, inputValue))
                                            .pipe(iterMap(([extension, outputValue]): Item<O> => [[...inputKey, ...extension], outputValue]));
                                    }),
                                        tap(_ => console.log("map")),
                                        skipWhile(([k,]) => lexCompare(k, outputKey) < 0))
                            }
                        }
                    }))
            }
        }
    }
    //     schema(inputSchema: string[]) {
    //         return [...inputSchema, ...this.subschema];
    //     }

    //     image(inputRange: Range<OrderedKey>): Range<OrderedKey> {
    //         const subschemaPad = Array(this.subschema.length).fill("")
    //         return {
    //             start: ((): Bound<OrderedKey> => {
    //                 switch (inputRange.start.kind) {
    //                     case "unbounded":
    //                         return { kind: "unbounded" }
    //                     case "inclusive":
    //                         return {
    //                             kind: "inclusive",
    //                             value: new OrderedKey([...inputRange.start.value.key, ...subschemaPad])
    //                         }
    //                     case "exclusive":
    //                         return {
    //                             kind: "inclusive",
    //                             value: new OrderedKey([...keySuccessor(inputRange.start.value.key), ...subschemaPad])
    //                         }
    //                 }
    //             })(),
    //             end: ((): Bound<OrderedKey> => {
    //                 switch (inputRange.end.kind) {
    //                     case "unbounded":
    //                         return { kind: "unbounded" }
    //                     case "inclusive":
    //                         return {
    //                             kind: "exclusive",
    //                             value: new OrderedKey([...keySuccessor(inputRange.end.value.key), ...subschemaPad])
    //                         }
    //                     case "exclusive":
    //                         return {
    //                             kind: "exclusive",
    //                             value: new OrderedKey([...inputRange.end.value.key, ...subschemaPad])
    //                         }
    //                 }
    //             })(),
    //         }
    //     }

    //     preimage(outputRange: Range<OrderedKey>): Range<OrderedKey> {
    //         const stripSubschema = (key: Key)=>             key.slice(0, key.length - this.subschema.length);
    //         const subschemaPad = Array(this.subschema.length).fill("");
    //         return {
    //             start: ((): Bound<OrderedKey> => {
    //                 switch (outputRange.start.kind) {
    //                     case "unbounded":
    //                         return { kind: "unbounded" }
    //                     case "inclusive":
    //                     case "exclusive":
    //                         return {
    //                             kind: "inclusive",
    //                             value: new OrderedKey(stripSubschema(outputRange.start.value.key))
    //                         }
    //                 }
    //             })(),
    //             end: ((): Bound<OrderedKey> => {
    //                 switch (outputRange.end.kind) {
    //                     case "unbounded":
    //                         return { kind: "unbounded" }
    //                     case "inclusive":
    //                         return {
    //                             kind: "inclusive",
    //                             value: new OrderedKey(stripSubschema(outputRange.end.value.key))
    //                         }
    //                     case "exclusive":
    //                         const endpointTruncated = [...stripSubschema(outputRange.end.value.key), ...subschemaPad];
    //                         // If we're excluding the first value in the subspace, then we can exclude the prefix 
    //                         // as well.
    //                         if (lexCompare(outputRange.end.value.key, endpointTruncated) === 0) {
    //                             return {
    //                                 kind: "exclusive",
    //                                 value: new OrderedKey(stripSubschema(outputRange.end.value.key)),
    //                             }
    //                         } else{
    //                             return {
    //                                 kind: "inclusive",
    //                                 value: new OrderedKey(stripSubschema(outputRange.end.value.key)),
    //                             }
    //                         }
    //                 }
    //             })(),
    //         }
    //     }

    //     async *apply(inputIter: ItemIterable<I>): ItemIterable<O> {
    //         for await (const [inputKey, inputValue] of inputIter) {
    //             for (const [extraPath, mappedValue] of this.fn(inputKey, inputValue)) {
    //                 yield [[...inputKey, ...extraPath], mappedValue]
    //             }
    //         }
    //     }
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
            seekTo(outputKey: Key): SliceIterable<T> {
                const inputKey = permute(invertPermutation(self.permutation), outputKey);
                return from(input.seekTo(inputKey))
                    .pipe(flatMap((inputSlice: Slice<T>): SliceIterable<T> => {
                        return from(inputSlice.seekTo(inputKey))
                            .pipe(iterMap(([inputKey, inputValue]): Slice<T> => {
                                const outputKey = permute(self.permutation, inputKey);
                                return {
                                    schema: outputSchema,
                                    // TODO: Can do better than splitting every 
                                    // value into its own slice, if the permutation
                                    // starts with [0, 1, 2, ...].
                                    range: singleValue(outputKey),
                                    seekTo(startAtOutputKey: Key): ItemIterable<T> {
                                        if (lexCompare(outputKey, startAtOutputKey) !== 0) {
                                            throw new Error(`tried to seek to key outside of slice range. Seeked to ${JSON.stringify(startAtOutputKey)}, range is ${JSON.stringify(singleValue(outputKey))}`);
                                        } 
                                        return of([outputKey, inputValue] as Item<T>)
                                    }
                                }
                            }));
                    }));
            }
        }
    }

    // schema(inputSchema: string[]):string[] {
    //     return permute(this.permutation, inputSchema);
    // }

    // image(inputRange: Range<OrderedKey>): Range<OrderedKey> {
    //     const singleVal = isSingleValue(inputRange);
    //     if (!singleVal.some) {
    //         return {start: {kind: 'unbounded'}, end: {kind: 'unbounded'}};
    //     }
    //     return singleValue(new OrderedKey(permute(this.permutation, singleVal.value.key)));
    // }

    // preimage(outputRange: Range<OrderedKey>): Range<OrderedKey> {
    //     const singleVal = isSingleValue(outputRange);
    //     if (!singleVal.some) {
    //         return {start: {kind: 'unbounded'}, end: {kind: 'unbounded'}};
    //     }
    //     return singleValue(new OrderedKey(permute(invertPermutation( this.permutation), singleVal.value.key)));
    // }

    // async *apply(inputIter: ItemIterable<T>): ItemIterable<T> {
    //     for await (const [inputKey, inputValue] of inputIter) {
    //         yield [permute(this.permutation, inputKey), inputValue];
    //     }
    // }
}

export function transpose<T>(permutation: number[]): MonoOp<T, T> {
    return new TransposeOp(permutation);
}