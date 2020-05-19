import { MonoOp, Key, keySuccessor, Mutation, ItemIterable, ScrambledSpace, SliceIterable, Slice, Item } from "./base";
import { Range, isSingleValue, singleValue } from "./range";
import _ from 'lodash';
import { permute, lexCompare, invertPermutation, batchStreamBy } from "./util";
import * as ix from "ix/iterable";
import * as ixa from "ix/asynciterable";
import { map as iterMap, flatMap, skipWhile, tap } from "ix/asynciterable/operators";
import * as ixaop from "ix/asynciterable/operators";
import * as ixop from "ix/iterable/operators";
import { Mutations } from "../collections";


export type SortedStreamMapFn<I, O> = (key: Key, value: I) => Iterable<[Key, O]>;


class MapOp<I, O> implements MonoOp<I, O>{
    constructor(private subschema: string[], private fn: SortedStreamMapFn<I, O>) { }

    getSmallestInputRange(inputKey: Key): Range {
        return singleValue(inputKey);
    }

    preimage(outputKey: Key): Key {
        return outputKey.slice(0, outputKey.length - this.subschema.length);
    }
    schema(inputSchema: string[]): string[] {
        return [...inputSchema, ...this.subschema];
    }


    mapSlice(inputSlice: Slice<I>): SliceIterable<O> {
        const outputStart = [...inputSlice.range.start, ...this.subschema.map(_ => '')]
        const outputRange: Range = inputSlice.range.kind === 'bounded'
            ? {
                kind: 'bounded',
                start: outputStart,
                end: [...inputSlice.range.end, ...this.subschema.map(_ => '')]
            }
            : { kind: 'unbounded', start: outputStart };
        return ixa.of({
            range: outputRange,
            iter: ixa.from(inputSlice.iter)
                .pipe(
                    //                   tap(i=> console.log('in map',i)),
                    flatMap(item => this.mapItem(item))
                )
        })
    }

    mapItem([key, value]: Item<I>): Item<O>[] {
        return ix.toArray(ix.from(this.fn(key, value))
            .pipe(ixop.map(([extension, outputValue]): Item<O> => [[...key, ...extension], outputValue])))
    }

    //     mapMutations(input: Mutation<I>[]): Mutation<O>[] {
    //         return ix.from(input).pipe(
    //             ixop.flatMap((mutation) : Mutation<O>[] => {
    //                 switch (mutation.kind) {
    //                     case 'add':
    //                     case 'delete':
    //                         this.mapItem([mutation.key, mutation.value])
    //                 }

    // return ix.from(this.fn(inputKey, inputValue))
    //                             .pipe(iterMap(([extension, outputValue]): Item<O> => [[...inputKey, ...extension], outputValue]));

    //             })
    //         )

    //     }










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
                console.log('map got seek for', outputKey)
                const inputKey = outputKey.slice(0, outputKey.length - self.subschema.length);
                return ixa.from(input.seekTo(inputKey))
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
                            iter: ixa.from(inputSlice.iter)
                                .pipe(flatMap(([inputKey, inputValue]) => {
                                    return ixa.from(self.fn(inputKey, inputValue))
                                        .pipe(iterMap(([extension, outputValue]): Item<O> => [[...inputKey, ...extension], outputValue]));
                                }),
                                    tap(([k,]) => console.log("raw", k, outputKey)),
                                    skipWhile(([k,]) => lexCompare(k, outputKey) < 0),
                                    tap(([k,]) => console.log("refined", k, outputKey)),

                                )
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

    schema(inputSchema: string[]): string[] {
        return permute(this.permutation, inputSchema)
    }

    preimage(outputKey: Key): Key {
        return permute(invertPermutation(this.permutation), outputKey)
    }
    getSmallestInputRange(inputKey: Key): Range {
        return singleValue(inputKey);
    }

    mapSlice(inputSlice: Slice<T>): SliceIterable<T> {
        return ixa.from(inputSlice.iter)
            .pipe(//
                iterMap(([inputKey, inputValue]): Slice<T> => {
                    const outputKey = permute(this.permutation, inputKey);
                    return {
                        // TODO: Can do better than splitting every 
                        // value into its own slice, under some circumstances.
                        range: singleValue(outputKey),
                        iter: ixa.of([outputKey, inputValue] as Item<T>)
                    }
                }),
                //                                tap(_=>console.log('foo'))
            );
    }

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
                return ixa.from(input.seekTo(inputStartAt))
                    .pipe(flatMap((inputSlice: Slice<T>): SliceIterable<T> => {
                        return ixa.from(inputSlice.iter)
                            .pipe(
                                // tap(([ik,]) => console.log("in transpose", outputStartAt, ik)),
                                iterMap(([inputKey, inputValue]): Slice<T> => {
                                    const outputKey = permute(self.permutation, inputKey);
                                    return {
                                        // TODO: Can do better than splitting every 
                                        // value into its own slice, under some circumstances.
                                        range: singleValue(outputKey),
                                        iter: ixa.of([outputKey, inputValue] as Item<T>)
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

export type AggregateFn<I, O> = (baseKey: Key, values: Item<I>[]) => O;

class AggregateOp<I, O> implements MonoOp<I, O>{
    constructor(private aggregateDims: number, private fn: AggregateFn<I, O>) { }

    getSmallestInputRange(inputKey: Key): Range {
        const base = inputKey.slice(0, inputKey.length - this.aggregateDims);
        const pad = Array(this.aggregateDims).fill('');
        return { kind: 'bounded', start: [...base, ...pad], end: [...keySuccessor(base), ...pad] };
    }

    preimage(outputKey: Key): Key {
        return [...outputKey, ...Array(this.aggregateDims).fill('')];
    }

    schema(inputSchema: string[]): string[] {
        return inputSchema.slice(0, inputSchema.length - this.aggregateDims);
    }


    mapSlice(inputSlice: Slice<I>): SliceIterable<O> {
        const prefixLen = inputSlice.range.start.length - this.aggregateDims;
        const isAligned = (key: Key) => key.slice(0, prefixLen).every(x => x === '');
        if (!isAligned(inputSlice.range.start)) {
            throw new Error("Slice given to aggregate must begin at boundary");
        }

        if (inputSlice.range.kind === 'bounded' && !isAligned(inputSlice.range.end)) {
            throw new Error("Slice given to aggregate must end at boundary");
        }
        const rangeStart = inputSlice.range.start.slice(0, prefixLen);
        const range: Range = inputSlice.range.kind === 'unbounded' ? {
            kind: 'unbounded',
            start: rangeStart,
        } : {
                kind: 'bounded',
                start: rangeStart,
                end: inputSlice.range.end.slice(0, prefixLen),
            }

        const batched = ixa.from(batchStreamBy(inputSlice.iter,
            ([aKey,], [bKey,]) => lexCompare(aKey.slice(0, prefixLen), bKey.slice(0, prefixLen))));
        const aggregated = batched
            .pipe(ixaop.map((batch: Item<I>[]): Item<O> => {
                const batchKey = batch[0][0].slice(0, prefixLen);
                return [batchKey, this.fn(batchKey, batch.map(
                    ([k, v]: Item<I>): Item<I> => [k.slice(prefixLen), v]
                ))]
            }));
        return ixa.of({
            range,
            iter: aggregated,
        })
    }



}


export function aggregate<I, O>(levels: number, fn: AggregateFn<I, O>): MonoOp<I, O> {
    return new AggregateOp(levels, fn);
}
