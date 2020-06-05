use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io;
use std::path;

#[derive(Deserialize, Debug)]
struct ConfigIn {
    primary_id: String,
    collections: Vec<CollectionIn>,
    exports: Vec<ExportIn>,
}

#[derive(Deserialize, Debug)]
struct CollectionIn {
    id: String,
    tables: Vec<TableIn>,
}

#[derive(Deserialize, Debug)]
struct ExportIn {
    id: String,
    primary_source: TableId,
}

#[derive(Deserialize, Debug)]
struct TableId {
    collection_id: String,
    table_id: String,
}

#[derive(Deserialize, Debug)]
struct TableIn {
    id: String,
    schema: Vec<String>,
    r#type: String,
}

#[derive(Serialize, Debug)]
struct ConfigOut {
    primary_collection_id: String,
    secondary_collection_ids: Vec<String>,
    all_collection_ids: Vec<String>,
    collections: Vec<CollectionOut>,
}

#[derive(Serialize, Debug)]
struct CollectionOut {
    id: String,
    is_primary: bool,
    tables: Vec<TableOut>,
}

#[derive(Serialize, Debug)]
struct TableOut {
    id: String,
    schema: Vec<String>,
    r#type: String,
    export_schema: Option<Vec<String>>,
}

fn convert(config: &ConfigIn) -> ConfigOut {
    ConfigOut {
        primary_collection_id: config.primary_id.clone(),
        secondary_collection_ids: config
            .collections
            .iter()
            .map(|collection| collection.id.clone())
            .filter(|id| *id != config.primary_id)
            .collect(),
        all_collection_ids: config
            .collections
            .iter()
            .map(|collection| collection.id.clone())
            .collect(),

        collections: config
            .collections
            .iter()
            .map(|collection| CollectionOut {
                id: collection.id.clone(),
                is_primary: collection.id == config.primary_id,
                tables: collection
                    .tables
                    .iter()
                    .map(|table| TableOut {
                        id: table.id.clone(),
                        r#type: table.r#type.clone(),
                        export_schema: {
                            let export_match = config.exports.iter().find(|export| {
                                export.primary_source.collection_id == collection.id
                                    && export.primary_source.table_id == table.id
                            });

                            export_match.map(|export| {
                                let mut res = table.schema.clone();
                                let last = res.last_mut().unwrap();
                                *last = format!(
                                    "{segment}-{export_id}",
                                    segment = *last,
                                    export_id = export.id
                                );
                                res
                            })
                        },
                        schema: {
                            let mut res = table.schema.clone();
                            let last = res.last_mut().unwrap();
                            *last = format!(
                                "{segment}-{table_id}-{version}",
                                segment = *last,
                                table_id = table.id,
                                version = collection.id
                            );
                            res
                        },
                    })
                    .collect(),
            })
            .collect(),
    }
}

fn ident_formatter(
    value: &serde_json::Value,
    output: &mut String,
) -> tinytemplate::error::Result<()> {
    if let serde_json::Value::String(s) = value {
        tinytemplate::format_unescaped(&serde_json::Value::String(s.replace(".", "_")), output)
    } else {
        Err(tinytemplate::error::Error::GenericError {
            msg: "bad".to_string(),
        })
    }
}

fn json_formatter(
    value: &serde_json::Value,
    output: &mut String,
) -> tinytemplate::error::Result<()> {
    output.push_str(&value.to_string());
    Ok(())
}

static AUTO_TEMPLATE : &'static str = "// DON'T EDIT THIS FILE, IT IS AUTO GENERATED

import \\{ Integrators, liveReplay, readableFromDiffs, replayOrCheck, SideInputs, sortedDiffs, SpecType, Tables } from '.'
import \\{ applyChanges, diffToChange, validateLive } from '../base'
import * as db from '../db'
import * as model from '../model'
import \\{ validate as validateModel } from '../model/index.validator'
import * as readables from '../readables'
import \\{ Metadata, Outputs } from './interfaces'
import \\{ validate as validateInterfaces } from './interfaces.validator'

export const PRIMARY_COLLECTION_ID = { primary_collection_id | json };
export const SECONDARY_COLLECTION_IDS = { secondary_collection_ids | json }  as { secondary_collection_ids | json };
export const COLLECTION_IDS =
    { all_collection_ids | json } as
    { all_collection_ids | json };


export async function liveReplaySecondaries(
    ts: Tables, integrators: Integrators, actionId: string, savedAction: model.SavedAction): Promise<void> \\{
    {{-for cid in secondary_collection_ids}}
    await liveReplay(SPEC[{ cid | json }], ts, integrators, actionId, savedAction);
    {{-endfor }}
}

export async function replayAll(
    tx: db.TxRunner, integrators: Integrators,
    actionId: string, savedAction: model.SavedAction): Promise<void> \\{
    {{-for collection in collections}}
    await replayOrCheck(SPEC[{ collection.id | json }], tx, integrators, actionId, savedAction);
    {{-endfor }}
}

export const SPEC: SpecType = \\{
    {{-for c in collections }}
    { c.id | json }: \\{
        collectionId: { c.id | json },
        schemata: \\{
            live: \\{
                {{-for t in c.tables }}
                {t.id | json}: {t.schema | json},
                {{-endfor }}
            },
            exports: \\{
                {{-for t in c.tables-}}
                {{-if t.export_schema }}
                {t.id | json}: {t.export_schema | json},
                {{-endif-}}
                {{-endfor }}
            }
        },
        selectMetadata(ts: Tables) \\{ return ts[this.collectionId].meta },
        selectSideInputs(rs: SideInputs) \\{ return rs[this.collectionId] },
        selectIntegrator(integrators: Integrators) \\{ return integrators[this.collectionId] },
        replaySideInputs(metas: AsyncIterable<Metadata[{ c.id | json }]>): SideInputs[{ c.id | json }] \\{
            return \\{
                {{-for t in c.tables }}
                {t.id | json}: readableFromDiffs(metas, meta => meta.outputs[{t.id | json}], this.schemata.live[{t.id | json}]),
                {{-endfor }}
            }
        },
        emptyOutputs(): Outputs[{ c.id | json }] \\{
            return \\{
                {{-for t in c.tables }}
                {t.id | json}: [],
                {{-endfor }}
            }
        },
        outputToMetadata(outputs: Outputs[{ c.id | json }]): Metadata[{ c.id | json }] \\{
            return \\{
                outputs: \\{
                    {{-for t in c.tables }}
                    {t.id | json}: sortedDiffs(outputs[{t.id | json}]),
                    {{-endfor }}
                }
            }
        },
        applyOutputs(ts: Tables, actionId: string, outputs: Outputs[{ c.id | json }]): void \\{
            ts[this.collectionId].meta.set([actionId], this.outputToMetadata(outputs));
            {{-for t in c.tables }}
            applyChanges(ts[this.collectionId].live[{t.id | json}], actionId, outputs[{t.id | json}].map(diffToChange))
            {{-if t.export_schema }}
            applyChanges(ts[this.collectionId].exports[{t.id | json}], actionId, outputs[{t.id | json}].map(diffToChange))
            {{-endif-}}
            {{-endfor }}
       },
    },
    {{-endfor }}
};

export function openAll(db: db.Database): Tables \\{
    return \\{
        {{-for c in collections }}
        { c.id | json }: \\{
            meta: db.open(\\{
                schema: ['metadata-{c.id}'],
                validator: validateInterfaces('Metadata{c.id | ident}')
            }),
            live: \\{
                {{-for t in c.tables }}
                {t.id | json}: db.open(\\{
                    schema: SPEC[{c.id | json}].schemata.live[{t.id | json}],
                    validator: validateLive(validateModel({t.type | json}))
                }),
                {{-endfor }}
            },
            exports: \\{
                {{-for t in c.tables-}}
                {{-if t.export_schema }}
                {t.id | json}: db.open(\\{
                    schema: SPEC[{c.id | json}].schemata.exports[{ t.id | json }],
                    validator: validateLive(validateModel({t.type | json}))
                }),
                {{-endif-}}
                {{-endfor }}
            },
        },
        {{-endfor }}
    }
}

export function readAll(ts: Tables): [Set<string>, SideInputs] \\{
    const parentSet = new Set<string>();
    const track = (actionId: string) => \\{ parentSet.add(actionId) };
    const res: SideInputs = \\{
        {{-for c in collections }}
        { c.id | json }: \\{
            {{-for t in c.tables }}
            {t.id | json}: readables.tracked(ts[{c.id | json}].live[{t.id | json}], track),
            {{-endfor }}
        },
        {{-endfor }}
    }
    return [parentSet, res]
}
";

static DATA_TEMPLATE: &'static str = "// DON'T EDIT THIS FILE, IT IS AUTO GENERATED

import * as model from '../model'
import \\{ Diff } from '../interfaces'

export type CollectionId = keyof IOSpec;

export type IOSpec = \\{
    {{-for collection in collections }}
    { collection.id | json }: \\{
        live: \\{
            {{-for table in collection.tables }}
            { table.id }: model.{ table.type }
            {{-endfor }}
        }
        exports: \\{
            {{-for table in collection.tables-}}
            {{-if table.export_schema }}
            { table.id }: model.{ table.type }
            {{-endif-}}
            {{-endfor }}
        }
    }
    {{-endfor }}
}

export type Outputs = \\{
    [C in CollectionId]: \\{
        [T in keyof IOSpec[C]['live']]: Diff<IOSpec[C]['live'][T]>[]
    }
}

export type Metadata = \\{
    [K in keyof Outputs]: \\{
        outputs: Outputs[K]
    }
}

{{-for collection in collections }}
export type Metadata{ collection.id | ident } = Metadata[{collection.id | json}]
{{-endfor }}
";

#[derive(Debug)]
enum Error {
    UsageError,
    IOError(io::Error),
    ParsingError(serde_yaml::Error),
}

fn main() -> Result<(), Error> {
    let args: Vec<String> = env::args().collect();

    let schema_path = path::Path::new(args.get(1).ok_or(Error::UsageError)?);

    let contents = fs::read_to_string(schema_path).map_err(Error::IOError)?;

    let config: ConfigIn = serde_yaml::from_str(&contents).map_err(Error::ParsingError)?;
    let mut tt = tinytemplate::TinyTemplate::new();
    tt.add_template("auto", AUTO_TEMPLATE).unwrap();
    tt.add_template("data", DATA_TEMPLATE).unwrap();
    tt.add_formatter("ident", ident_formatter);
    tt.add_formatter("json", json_formatter);

    let output = convert(&config);
    fs::write(
        schema_path.parent().unwrap().join("auto.ts"),
        tt.render("auto", &output).unwrap(),
    )
    .map_err(Error::IOError)?;
    fs::write(
        schema_path.parent().unwrap().join("interfaces.ts"),
        tt.render("data", &output).unwrap(),
    )
    .map_err(Error::IOError)?;
    Ok(())
}
