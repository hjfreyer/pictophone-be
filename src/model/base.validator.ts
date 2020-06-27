/* tslint:disable */
// generated by typescript-json-validator
import Ajv = require('ajv');
import { ReferenceGroup, Pointer } from './base';
export const ajv = new Ajv({ "allErrors": true, "coerceTypes": false, "format": "fast", "nullable": true, "unicode": true, "uniqueItems": true, "useDefaults": true });

ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));

export const Schema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "definitions": {
        "Pointer": {
            "defaultProperties": [
            ],
            "properties": {
                "actionId": {
                    "type": "string"
                }
            },
            "required": [
                "actionId"
            ],
            "type": "object"
        },
        "Record<string,ReferenceGroup>": {
            "defaultProperties": [
            ],
            "description": "Construct a type with a set of properties K of type T",
            "type": "object"
        },
        "ReferenceGroup": {
            "else": {
                "else": {
                    "else": {
                        "properties": {
                            "kind": {
                                "enum": [
                                    "single",
                                    "collection",
                                    "none"
                                ],
                                "type": "string"
                            }
                        },
                        "required": [
                            "kind"
                        ]
                    },
                    "if": {
                        "properties": {
                            "kind": {
                                "enum": [
                                    "none"
                                ],
                                "type": "string"
                            }
                        },
                        "required": [
                            "kind"
                        ]
                    },
                    "then": {
                        "defaultProperties": [
                        ],
                        "properties": {
                            "kind": {
                                "enum": [
                                    "none"
                                ],
                                "type": "string"
                            }
                        },
                        "required": [
                            "kind"
                        ],
                        "type": "object"
                    }
                },
                "if": {
                    "properties": {
                        "kind": {
                            "enum": [
                                "collection"
                            ],
                            "type": "string"
                        }
                    },
                    "required": [
                        "kind"
                    ]
                },
                "then": {
                    "defaultProperties": [
                    ],
                    "properties": {
                        "id": {
                            "type": "string"
                        },
                        "kind": {
                            "enum": [
                                "collection"
                            ],
                            "type": "string"
                        },
                        "members": {
                            "$ref": "#/definitions/Record<string,ReferenceGroup>"
                        }
                    },
                    "required": [
                        "id",
                        "kind",
                        "members"
                    ],
                    "type": "object"
                }
            },
            "if": {
                "properties": {
                    "kind": {
                        "enum": [
                            "single"
                        ],
                        "type": "string"
                    }
                },
                "required": [
                    "kind"
                ]
            },
            "then": {
                "defaultProperties": [
                ],
                "properties": {
                    "actionId": {
                        "type": "string"
                    },
                    "kind": {
                        "enum": [
                            "single"
                        ],
                        "type": "string"
                    }
                },
                "required": [
                    "actionId",
                    "kind"
                ],
                "type": "object"
            }
        }
    }
};
ajv.addSchema(Schema, 'Schema')
export function validate(typeName: 'ReferenceGroup'): (value: unknown) => ReferenceGroup;
export function validate(typeName: 'Pointer'): (value: unknown) => Pointer;
export function validate(typeName: string): (value: unknown) => any {
    const validator: any = ajv.getSchema(`Schema#/definitions/${typeName}`);
    return (value: unknown): any => {
        if (!validator) {
            throw new Error(`No validator defined for Schema#/definitions/${typeName}`)
        }

        const valid = validator(value);

        if (!valid) {
            throw new Error(
                'Invalid ' + typeName + ': ' + ajv.errorsText(validator.errors!.filter((e: any) => e.keyword !== 'if'), { dataVar: typeName }),
            );
        }

        return value as any;
    };
}
