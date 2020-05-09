import { MonoOp, Key, keySuccessor, ItemIterable, OrderedKey } from "./base";
import { Range, Bound, isSingleValue, singleValue } from "./range";
import _ from 'lodash';
import { permute, lexCompare , invertPermutation} from "./util";


class MapOp<I, O> implements MonoOp<I, O>{
    constructor(private subschema: string[], private fn: (key: Key, value: I) => Iterable<[Key, O]>) { }

    schema(inputSchema: string[]) {
        return [...inputSchema, ...this.subschema];
    }

    image(inputRange: Range<OrderedKey>): Range<OrderedKey> {
        const subschemaPad = Array(this.subschema.length).fill("")
        return {
            start: ((): Bound<OrderedKey> => {
                switch (inputRange.start.kind) {
                    case "unbounded":
                        return { kind: "unbounded" }
                    case "inclusive":
                        return {
                            kind: "inclusive",
                            value: new OrderedKey([...inputRange.start.value.key, ...subschemaPad])
                        }
                    case "exclusive":
                        return {
                            kind: "inclusive",
                            value: new OrderedKey([...keySuccessor(inputRange.start.value.key), ...subschemaPad])
                        }
                }
            })(),
            end: ((): Bound<OrderedKey> => {
                switch (inputRange.end.kind) {
                    case "unbounded":
                        return { kind: "unbounded" }
                    case "inclusive":
                        return {
                            kind: "exclusive",
                            value: new OrderedKey([...keySuccessor(inputRange.end.value.key), ...subschemaPad])
                        }
                    case "exclusive":
                        return {
                            kind: "exclusive",
                            value: new OrderedKey([...inputRange.end.value.key, ...subschemaPad])
                        }
                }
            })(),
        }
    }

    preimage(outputRange: Range<OrderedKey>): Range<OrderedKey> {
        const stripSubschema = (key: Key)=>             key.slice(0, key.length - this.subschema.length);
        const subschemaPad = Array(this.subschema.length).fill("");
        return {
            start: ((): Bound<OrderedKey> => {
                switch (outputRange.start.kind) {
                    case "unbounded":
                        return { kind: "unbounded" }
                    case "inclusive":
                    case "exclusive":
                        return {
                            kind: "inclusive",
                            value: new OrderedKey(stripSubschema(outputRange.start.value.key))
                        }
                }
            })(),
            end: ((): Bound<OrderedKey> => {
                switch (outputRange.end.kind) {
                    case "unbounded":
                        return { kind: "unbounded" }
                    case "inclusive":
                        return {
                            kind: "inclusive",
                            value: new OrderedKey(stripSubschema(outputRange.end.value.key))
                        }
                    case "exclusive":
                        const endpointTruncated = [...stripSubschema(outputRange.end.value.key), ...subschemaPad];
                        // If we're excluding the first value in the subspace, then we can exclude the prefix 
                        // as well.
                        if (lexCompare(outputRange.end.value.key, endpointTruncated) === 0) {
                            return {
                                kind: "exclusive",
                                value: new OrderedKey(stripSubschema(outputRange.end.value.key)),
                            }
                        } else{
                            return {
                                kind: "inclusive",
                                value: new OrderedKey(stripSubschema(outputRange.end.value.key)),
                            }
                        }
                }
            })(),
        }
    }

    async *apply(inputIter: ItemIterable<I>): ItemIterable<O> {
        for await (const [inputKey, inputValue] of inputIter) {
            for (const [extraPath, mappedValue] of this.fn(inputKey, inputValue)) {
                yield [[...inputKey, ...extraPath], mappedValue]
            }
        }
    }
}

export type SortedStreamMapFn<I, O> = (key: Key, value: I) => Iterable<[Key, O]>;

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

    schema(inputSchema: string[]):string[] {
        return permute(this.permutation, inputSchema);
    }

    image(inputRange: Range<OrderedKey>): Range<OrderedKey> {
        const singleVal = isSingleValue(inputRange);
        if (!singleVal.some) {
            return {start: {kind: 'unbounded'}, end: {kind: 'unbounded'}};
        }
        return singleValue(new OrderedKey(permute(this.permutation, singleVal.value.key)));
    }

    preimage(outputRange: Range<OrderedKey>): Range<OrderedKey> {
        const singleVal = isSingleValue(outputRange);
        if (!singleVal.some) {
            return {start: {kind: 'unbounded'}, end: {kind: 'unbounded'}};
        }
        return singleValue(new OrderedKey(permute(invertPermutation( this.permutation), singleVal.value.key)));
    }

    async *apply(inputIter: ItemIterable<T>): ItemIterable<T> {
        for await (const [inputKey, inputValue] of inputIter) {
            yield [permute(this.permutation, inputKey), inputValue];
        }
    }
}

export function transpose<T>(permutation: number[]): MonoOp<T, T> {
return new TransposeOp(permutation);
}