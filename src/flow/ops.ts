import { MonoOp, Key, keySuccessor, ItemIterable } from "./base";
import { Range, Bound } from "./range";
import _ from 'lodash';
import { lexCompare } from "./util";


class MapOp<I, O> implements MonoOp<I, O>{
    constructor(private subschema: string[], private fn: (key: Key, value: I) => Iterable<[Key, O]>) { }

    schema(inputSchema: string[]) {
        return [...inputSchema, ...this.subschema];
    }

    image(inputRange: Range<Key>): Range<Key> {
        const subschemaPad = Array(this.subschema.length).fill("")
        return {
            start: ((): Bound<Key> => {
                switch (inputRange.start.kind) {
                    case "unbounded":
                        return { kind: "unbounded" }
                    case "inclusive":
                        return {
                            kind: "inclusive",
                            value: [...inputRange.start.value, ...subschemaPad]
                        }
                    case "exclusive":
                        return {
                            kind: "inclusive",
                            value: [...keySuccessor(inputRange.start.value), ...subschemaPad]
                        }
                }
            })(),
            end: ((): Bound<Key> => {
                switch (inputRange.end.kind) {
                    case "unbounded":
                        return { kind: "unbounded" }
                    case "inclusive":
                        return {
                            kind: "exclusive",
                            value: [...keySuccessor(inputRange.end.value), ...subschemaPad]
                        }
                    case "exclusive":
                        return {
                            kind: "exclusive",
                            value: [...inputRange.end.value, ...subschemaPad]
                        }
                }
            })(),
        }
    }

    preimage(outputRange: Range<Key>): Range<Key> {
        const stripSubschema = (key: Key)=>             key.slice(0, key.length - this.subschema.length);
        const subschemaPad = Array(this.subschema.length).fill("");
        return {
            start: ((): Bound<Key> => {
                switch (outputRange.start.kind) {
                    case "unbounded":
                        return { kind: "unbounded" }
                    case "inclusive":
                    case "exclusive":
                        return {
                            kind: "inclusive",
                            value: stripSubschema(outputRange.start.value)
                        }
                }
            })(),
            end: ((): Bound<Key> => {
                switch (outputRange.end.kind) {
                    case "unbounded":
                        return { kind: "unbounded" }
                    case "inclusive":
                        return {
                            kind: "inclusive",
                            value: stripSubschema(outputRange.end.value)
                        }
                    case "exclusive":
                        const endpointTruncated = [...stripSubschema(outputRange.end.value), ...subschemaPad];
                        // If we're excluding the first value in the subspace, then we can exclude the prefix 
                        // as well.
                        if (lexCompare(outputRange.end.value, endpointTruncated) === 0) {
                            return {
                                kind: "exclusive",
                                value: stripSubschema(outputRange.end.value),
                            }
                        } else{
                            return {
                                kind: "inclusive",
                                value: stripSubschema(outputRange.end.value),
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