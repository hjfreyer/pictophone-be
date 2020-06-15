/* tslint:disable */
// generated by typescript-json-validator
import Ajv = require('ajv');
import { JoinGameAction, StartGameAction, MakeMoveAction, Action, Error, UnstartedGame, UnstartedGamePlayer, StartedGame, StartedGamePlayer, Submission, Game, State, Annotations } from './1.1.1';
export const ajv = new Ajv({ "allErrors": true, "coerceTypes": false, "format": "fast", "nullable": true, "unicode": true, "uniqueItems": true, "useDefaults": true });

ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-06.json'));

export const Schema = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "definitions": {
        "Action": {
            "else": {
                "else": {
                    "else": {
                        "properties": {
                            "kind": {
                                "enum": [
                                    "join_game",
                                    "start_game",
                                    "make_move"
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
                                    "make_move"
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
                            "gameId": {
                                "maxLength": 1024,
                                "minLength": 1,
                                "pattern": "^[a-zA-Z0-9_-]*$",
                                "type": "string"
                            },
                            "kind": {
                                "enum": [
                                    "make_move"
                                ],
                                "type": "string"
                            },
                            "playerId": {
                                "maxLength": 1024,
                                "minLength": 1,
                                "pattern": "^[a-zA-Z0-9_-]*$",
                                "type": "string"
                            },
                            "submission": {
                                "anyOf": [
                                    {
                                        "defaultProperties": [
                                        ],
                                        "properties": {
                                            "kind": {
                                                "enum": [
                                                    "word"
                                                ],
                                                "type": "string"
                                            },
                                            "word": {
                                                "type": "string"
                                            }
                                        },
                                        "required": [
                                            "kind",
                                            "word"
                                        ],
                                        "type": "object"
                                    },
                                    {
                                        "defaultProperties": [
                                        ],
                                        "properties": {
                                            "drawingId": {
                                                "type": "string"
                                            },
                                            "kind": {
                                                "enum": [
                                                    "drawing"
                                                ],
                                                "type": "string"
                                            }
                                        },
                                        "required": [
                                            "drawingId",
                                            "kind"
                                        ],
                                        "type": "object"
                                    }
                                ]
                            }
                        },
                        "required": [
                            "gameId",
                            "kind",
                            "playerId",
                            "submission"
                        ],
                        "type": "object"
                    }
                },
                "if": {
                    "properties": {
                        "kind": {
                            "enum": [
                                "start_game"
                            ],
                            "type": "string"
                        }
                    },
                    "required": [
                        "kind"
                    ]
                },
                "then": {
                    "$ref": "#/definitions/StartGameAction"
                }
            },
            "if": {
                "properties": {
                    "kind": {
                        "enum": [
                            "join_game"
                        ],
                        "type": "string"
                    }
                },
                "required": [
                    "kind"
                ]
            },
            "then": {
                "$ref": "#/definitions/JoinGameAction"
            }
        },
        "Annotations": {
            "defaultProperties": [
            ],
            "properties": {
                "games": {
                    "items": {
                        "$ref": "#/definitions/Item<Game>"
                    },
                    "type": "array"
                }
            },
            "required": [
                "games"
            ],
            "type": "object"
        },
        "Error": {
            "else": {
                "else": {
                    "else": {
                        "else": {
                            "else": {
                                "else": {
                                    "properties": {
                                        "status": {
                                            "enum": [
                                                "GAME_NOT_STARTED",
                                                "PLAYER_NOT_IN_GAME",
                                                "MOVE_PLAYED_OUT_OF_TURN",
                                                "GAME_IS_OVER",
                                                "INCORRECT_SUBMISSION_KIND",
                                                "GAME_ALREADY_STARTED"
                                            ],
                                            "type": "string"
                                        }
                                    },
                                    "required": [
                                        "status"
                                    ]
                                },
                                "if": {
                                    "properties": {
                                        "status": {
                                            "enum": [
                                                "GAME_ALREADY_STARTED"
                                            ],
                                            "type": "string"
                                        }
                                    },
                                    "required": [
                                        "status"
                                    ]
                                },
                                "then": {
                                    "defaultProperties": [
                                    ],
                                    "properties": {
                                        "gameId": {
                                            "type": "string"
                                        },
                                        "status": {
                                            "enum": [
                                                "GAME_ALREADY_STARTED"
                                            ],
                                            "type": "string"
                                        },
                                        "status_code": {
                                            "enum": [
                                                400
                                            ],
                                            "type": "number"
                                        },
                                        "version": {
                                            "enum": [
                                                "1.0"
                                            ],
                                            "type": "string"
                                        }
                                    },
                                    "required": [
                                        "gameId",
                                        "status",
                                        "status_code",
                                        "version"
                                    ],
                                    "type": "object"
                                }
                            },
                            "if": {
                                "properties": {
                                    "status": {
                                        "enum": [
                                            "INCORRECT_SUBMISSION_KIND"
                                        ],
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "status"
                                ]
                            },
                            "then": {
                                "defaultProperties": [
                                ],
                                "properties": {
                                    "got": {
                                        "enum": [
                                            "drawing",
                                            "word"
                                        ],
                                        "type": "string"
                                    },
                                    "status": {
                                        "enum": [
                                            "INCORRECT_SUBMISSION_KIND"
                                        ],
                                        "type": "string"
                                    },
                                    "status_code": {
                                        "enum": [
                                            400
                                        ],
                                        "type": "number"
                                    },
                                    "version": {
                                        "enum": [
                                            "1.0"
                                        ],
                                        "type": "string"
                                    },
                                    "wanted": {
                                        "enum": [
                                            "drawing",
                                            "word"
                                        ],
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "got",
                                    "status",
                                    "status_code",
                                    "version",
                                    "wanted"
                                ],
                                "type": "object"
                            }
                        },
                        "if": {
                            "properties": {
                                "status": {
                                    "enum": [
                                        "GAME_IS_OVER"
                                    ],
                                    "type": "string"
                                }
                            },
                            "required": [
                                "status"
                            ]
                        },
                        "then": {
                            "defaultProperties": [
                            ],
                            "properties": {
                                "gameId": {
                                    "type": "string"
                                },
                                "status": {
                                    "enum": [
                                        "GAME_IS_OVER"
                                    ],
                                    "type": "string"
                                },
                                "status_code": {
                                    "enum": [
                                        400
                                    ],
                                    "type": "number"
                                },
                                "version": {
                                    "enum": [
                                        "1.0"
                                    ],
                                    "type": "string"
                                }
                            },
                            "required": [
                                "gameId",
                                "status",
                                "status_code",
                                "version"
                            ],
                            "type": "object"
                        }
                    },
                    "if": {
                        "properties": {
                            "status": {
                                "enum": [
                                    "MOVE_PLAYED_OUT_OF_TURN"
                                ],
                                "type": "string"
                            }
                        },
                        "required": [
                            "status"
                        ]
                    },
                    "then": {
                        "defaultProperties": [
                        ],
                        "properties": {
                            "gameId": {
                                "type": "string"
                            },
                            "playerId": {
                                "type": "string"
                            },
                            "status": {
                                "enum": [
                                    "MOVE_PLAYED_OUT_OF_TURN"
                                ],
                                "type": "string"
                            },
                            "status_code": {
                                "enum": [
                                    400
                                ],
                                "type": "number"
                            },
                            "version": {
                                "enum": [
                                    "1.0"
                                ],
                                "type": "string"
                            }
                        },
                        "required": [
                            "gameId",
                            "playerId",
                            "status",
                            "status_code",
                            "version"
                        ],
                        "type": "object"
                    }
                },
                "if": {
                    "properties": {
                        "status": {
                            "enum": [
                                "PLAYER_NOT_IN_GAME"
                            ],
                            "type": "string"
                        }
                    },
                    "required": [
                        "status"
                    ]
                },
                "then": {
                    "defaultProperties": [
                    ],
                    "properties": {
                        "gameId": {
                            "type": "string"
                        },
                        "playerId": {
                            "type": "string"
                        },
                        "status": {
                            "enum": [
                                "PLAYER_NOT_IN_GAME"
                            ],
                            "type": "string"
                        },
                        "status_code": {
                            "enum": [
                                403
                            ],
                            "type": "number"
                        },
                        "version": {
                            "enum": [
                                "1.0"
                            ],
                            "type": "string"
                        }
                    },
                    "required": [
                        "gameId",
                        "playerId",
                        "status",
                        "status_code",
                        "version"
                    ],
                    "type": "object"
                }
            },
            "if": {
                "properties": {
                    "status": {
                        "enum": [
                            "GAME_NOT_STARTED"
                        ],
                        "type": "string"
                    }
                },
                "required": [
                    "status"
                ]
            },
            "then": {
                "defaultProperties": [
                ],
                "properties": {
                    "gameId": {
                        "type": "string"
                    },
                    "status": {
                        "enum": [
                            "GAME_NOT_STARTED"
                        ],
                        "type": "string"
                    },
                    "status_code": {
                        "enum": [
                            400
                        ],
                        "type": "number"
                    },
                    "version": {
                        "enum": [
                            "1.0"
                        ],
                        "type": "string"
                    }
                },
                "required": [
                    "gameId",
                    "status",
                    "status_code",
                    "version"
                ],
                "type": "object"
            }
        },
        "Game": {
            "else": {
                "else": {
                    "properties": {
                        "state": {
                            "enum": [
                                "UNSTARTED",
                                "STARTED"
                            ],
                            "type": "string"
                        }
                    },
                    "required": [
                        "state"
                    ]
                },
                "if": {
                    "properties": {
                        "state": {
                            "enum": [
                                "STARTED"
                            ],
                            "type": "string"
                        }
                    },
                    "required": [
                        "state"
                    ]
                },
                "then": {
                    "$ref": "#/definitions/StartedGame"
                }
            },
            "if": {
                "properties": {
                    "state": {
                        "enum": [
                            "UNSTARTED"
                        ],
                        "type": "string"
                    }
                },
                "required": [
                    "state"
                ]
            },
            "then": {
                "$ref": "#/definitions/UnstartedGame"
            }
        },
        "Item<Game>": {
            "defaultProperties": [
            ],
            "properties": {
                "key": {
                    "items": {
                        "type": "string"
                    },
                    "type": "array"
                },
                "value": {
                    "anyOf": [
                        {
                            "$ref": "#/definitions/UnstartedGame"
                        },
                        {
                            "$ref": "#/definitions/StartedGame"
                        }
                    ]
                }
            },
            "required": [
                "key",
                "value"
            ],
            "type": "object"
        },
        "JoinGameAction": {
            "defaultProperties": [
            ],
            "properties": {
                "gameId": {
                    "maxLength": 1024,
                    "minLength": 1,
                    "pattern": "^[a-zA-Z0-9_-]*$",
                    "type": "string"
                },
                "kind": {
                    "enum": [
                        "join_game"
                    ],
                    "type": "string"
                },
                "playerDisplayName": {
                    "maxLength": 1024,
                    "minLength": 1,
                    "type": "string"
                },
                "playerId": {
                    "maxLength": 1024,
                    "minLength": 1,
                    "pattern": "^[a-zA-Z0-9_-]*$",
                    "type": "string"
                }
            },
            "required": [
                "gameId",
                "kind",
                "playerDisplayName",
                "playerId"
            ],
            "type": "object"
        },
        "MakeMoveAction": {
            "defaultProperties": [
            ],
            "properties": {
                "gameId": {
                    "maxLength": 1024,
                    "minLength": 1,
                    "pattern": "^[a-zA-Z0-9_-]*$",
                    "type": "string"
                },
                "kind": {
                    "enum": [
                        "make_move"
                    ],
                    "type": "string"
                },
                "playerId": {
                    "maxLength": 1024,
                    "minLength": 1,
                    "pattern": "^[a-zA-Z0-9_-]*$",
                    "type": "string"
                },
                "submission": {
                    "anyOf": [
                        {
                            "defaultProperties": [
                            ],
                            "properties": {
                                "kind": {
                                    "enum": [
                                        "word"
                                    ],
                                    "type": "string"
                                },
                                "word": {
                                    "type": "string"
                                }
                            },
                            "required": [
                                "kind",
                                "word"
                            ],
                            "type": "object"
                        },
                        {
                            "defaultProperties": [
                            ],
                            "properties": {
                                "drawingId": {
                                    "type": "string"
                                },
                                "kind": {
                                    "enum": [
                                        "drawing"
                                    ],
                                    "type": "string"
                                }
                            },
                            "required": [
                                "drawingId",
                                "kind"
                            ],
                            "type": "object"
                        }
                    ]
                }
            },
            "required": [
                "gameId",
                "kind",
                "playerId",
                "submission"
            ],
            "type": "object"
        },
        "StartGameAction": {
            "defaultProperties": [
            ],
            "properties": {
                "gameId": {
                    "maxLength": 1024,
                    "minLength": 1,
                    "pattern": "^[a-zA-Z0-9_-]*$",
                    "type": "string"
                },
                "kind": {
                    "enum": [
                        "start_game"
                    ],
                    "type": "string"
                },
                "playerId": {
                    "maxLength": 1024,
                    "minLength": 1,
                    "pattern": "^[a-zA-Z0-9_-]*$",
                    "type": "string"
                }
            },
            "required": [
                "gameId",
                "kind",
                "playerId"
            ],
            "type": "object"
        },
        "StartedGame": {
            "defaultProperties": [
            ],
            "properties": {
                "players": {
                    "items": {
                        "$ref": "#/definitions/StartedGamePlayer"
                    },
                    "type": "array"
                },
                "state": {
                    "enum": [
                        "STARTED"
                    ],
                    "type": "string"
                }
            },
            "required": [
                "players",
                "state"
            ],
            "type": "object"
        },
        "StartedGamePlayer": {
            "defaultProperties": [
            ],
            "properties": {
                "displayName": {
                    "type": "string"
                },
                "id": {
                    "type": "string"
                },
                "submissions": {
                    "items": {
                        "anyOf": [
                            {
                                "defaultProperties": [
                                ],
                                "properties": {
                                    "kind": {
                                        "enum": [
                                            "word"
                                        ],
                                        "type": "string"
                                    },
                                    "word": {
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "kind",
                                    "word"
                                ],
                                "type": "object"
                            },
                            {
                                "defaultProperties": [
                                ],
                                "properties": {
                                    "drawingId": {
                                        "type": "string"
                                    },
                                    "kind": {
                                        "enum": [
                                            "drawing"
                                        ],
                                        "type": "string"
                                    }
                                },
                                "required": [
                                    "drawingId",
                                    "kind"
                                ],
                                "type": "object"
                            }
                        ]
                    },
                    "type": "array"
                }
            },
            "required": [
                "displayName",
                "id",
                "submissions"
            ],
            "type": "object"
        },
        "State": {
            "defaultProperties": [
            ],
            "properties": {
                "game": {
                    "anyOf": [
                        {
                            "$ref": "#/definitions/UnstartedGame"
                        },
                        {
                            "$ref": "#/definitions/StartedGame"
                        }
                    ]
                },
                "gameId": {
                    "type": "string"
                }
            },
            "required": [
                "game",
                "gameId"
            ],
            "type": "object"
        },
        "Submission": {
            "else": {
                "else": {
                    "properties": {
                        "kind": {
                            "enum": [
                                "word",
                                "drawing"
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
                                "drawing"
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
                        "drawingId": {
                            "type": "string"
                        },
                        "kind": {
                            "enum": [
                                "drawing"
                            ],
                            "type": "string"
                        }
                    },
                    "required": [
                        "drawingId",
                        "kind"
                    ],
                    "type": "object"
                }
            },
            "if": {
                "properties": {
                    "kind": {
                        "enum": [
                            "word"
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
                            "word"
                        ],
                        "type": "string"
                    },
                    "word": {
                        "type": "string"
                    }
                },
                "required": [
                    "kind",
                    "word"
                ],
                "type": "object"
            }
        },
        "UnstartedGame": {
            "defaultProperties": [
            ],
            "properties": {
                "players": {
                    "items": {
                        "$ref": "#/definitions/UnstartedGamePlayer"
                    },
                    "type": "array"
                },
                "state": {
                    "enum": [
                        "UNSTARTED"
                    ],
                    "type": "string"
                }
            },
            "required": [
                "players",
                "state"
            ],
            "type": "object"
        },
        "UnstartedGamePlayer": {
            "defaultProperties": [
            ],
            "properties": {
                "displayName": {
                    "type": "string"
                },
                "id": {
                    "type": "string"
                }
            },
            "required": [
                "displayName",
                "id"
            ],
            "type": "object"
        }
    }
};
ajv.addSchema(Schema, 'Schema')
export function validate(typeName: 'JoinGameAction'): (value: unknown) => JoinGameAction;
export function validate(typeName: 'StartGameAction'): (value: unknown) => StartGameAction;
export function validate(typeName: 'MakeMoveAction'): (value: unknown) => MakeMoveAction;
export function validate(typeName: 'Action'): (value: unknown) => Action;
export function validate(typeName: 'Error'): (value: unknown) => Error;
export function validate(typeName: 'UnstartedGame'): (value: unknown) => UnstartedGame;
export function validate(typeName: 'UnstartedGamePlayer'): (value: unknown) => UnstartedGamePlayer;
export function validate(typeName: 'StartedGame'): (value: unknown) => StartedGame;
export function validate(typeName: 'StartedGamePlayer'): (value: unknown) => StartedGamePlayer;
export function validate(typeName: 'Submission'): (value: unknown) => Submission;
export function validate(typeName: 'Game'): (value: unknown) => Game;
export function validate(typeName: 'State'): (value: unknown) => State;
export function validate(typeName: 'Annotations'): (value: unknown) => Annotations;
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
