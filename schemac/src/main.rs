use serde::{Deserialize, Serialize};
use std::io::{self, Read};

#[derive(Serialize, Deserialize, Debug)]
struct Config {
    collections: Vec<Collection>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Collection {
    id: String,
    tables: Vec<Table>,
}

#[derive(Serialize, Deserialize, Debug)]
struct Table {
    id: String,
    schema: Vec<String>,
    r#type: String,

    #[serde(default)]
    input: bool,
}

#[derive(Serialize)]
struct Context {
    collections: Vec<String>,
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

static TEMPLATE : &'static str = "// DON'T EDIT THIS FILE, IT IS AUTO GENERATED

import * as db from '../db'
import * as util from '../util'
import \\{ Live, Diff, Change, Readable } from '../interfaces'
import * as model from '../model'
import \\{ validate as validateModel } from '../model/index.validator'
import \\{ validateLive, applyChanges, diffToChange } from '../base'
import * as readables from '../readables'
import \\{ deleteTable, deleteMeta } from '.'

export * from './manual';

export type Tables = \\{
    actions: db.Table<model.SavedAction>
    actionTableMetadata: db.Table<model.ActionTableMetadata>
    {{- for collection in collections -}}
    {{ for table in collection.tables }}
    state{ collection.id | ident}_{table.id}: db.Table<Live<model.{table.type}>>
    {{- endfor -}}
    {{- endfor }}
}

export function openAll(db: db.Database): Tables \\{
    return \\{
        actions: db.open(\\{
            schema: ['actions'],
            validator: validateModel('SavedAction')
        }),
        actionTableMetadata: db.open(\\{
            schema: ['actions', '_META_'],
            validator: validateModel('ActionTableMetadata')
        }),
        {{- for collection in collections -}}
        {{ for table in collection.tables }}
        state{ collection.id | ident}_{table.id}: db.open(\\{
            schema: {table.schema | json},
            validator: validateLive(validateModel('{table.type}'))
        }),
        {{- endfor -}}
        {{ endfor }}
    }
}

export interface Integrators \\{
    {{- for collection in collections }}
    integrate{ collection.id | ident}(action: model.AnyAction, inputs: Inputs{ collection.id | ident}): Promise<util.Result<Outputs{ collection.id | ident}, model.AnyError>>
    {{- endfor }}
}

{{ for collection in collections }}
// BEGIN {collection.id}

export type Inputs{collection.id | ident} = \\{
{{- for table in collection.tables -}}
    {{- if table.input }}
    { table.id }: Readable<model.{ table.type }>
    {{- endif -}}
{{ endfor }}
}

export function getTrackedInputs{collection.id | ident}(ts: Tables): [Set<string>, Inputs{collection.id | ident}] \\{
    const parentSet = new Set<string>();
    const track = (actionId: string) => \\{ parentSet.add(actionId) };
    const inputs: Inputs{collection.id | ident} = \\{
    {{- for table in collection.tables -}}
        {{- if table.input }}
        { table.id }: readables.tracked(ts.state{collection.id | ident}_{table.id}, track),
        {{- endif -}}
    {{ endfor }}
    }
    return [parentSet, inputs]
}

export type Outputs{collection.id | ident} = \\{
{{- for table in collection.tables }}
    { table.id }: Diff<model.{ table.type }>[]
{{- endfor }}
}

export function emptyOutputs{collection.id | ident}(): Outputs{collection.id | ident} \\{
    return \\{
{{- for table in collection.tables }}
        { table.id }: [],
{{- endfor }}
    }
}

export function applyOutputs{collection.id | ident}(ts: Tables, actionId: string, outputs: Outputs{collection.id | ident}): void \\{
    ts.actionTableMetadata.set([actionId, 'state-{collection.id}'], getChangelog{collection.id | ident}(outputs));
{{- for table in collection.tables }}
    applyChanges(ts.state{collection.id | ident}_{table.id}, actionId, outputs.{table.id}.map(diffToChange))
{{- endfor }}
}

function getChangelog{collection.id | ident}(outputs: Outputs{collection.id | ident}): model.ActionTableMetadata \\{
    return \\{
        tables: [
        {{- for table in collection.tables }}
            \\{
                schema: {table.schema | json},
                changes: outputs.{table.id}.map(diffToChange),
            },
        {{- endfor }}
        ]
    }
}

// END {collection.id}
{{ endfor }}

export async function deleteCollection(runner: db.TxRunner, collectionId: string): Promise<void> \\{
    switch (collectionId) \\{
    {{ for collection in collections }}
        case 'state-{collection.id}':
            await deleteMeta(runner, 'state-{collection.id}')
        {{ for table in collection.tables }}
            await deleteTable(runner, 'state{collection.id | ident}_{table.id}')
        {{- endfor }}
            break;
    {{- endfor }}
        default:
            throw new Error('invalid option')
    }
}";

fn main() {
    let mut buffer = String::new();
    io::stdin().read_to_string(&mut buffer).unwrap();

    let config: Config = serde_yaml::from_str(&buffer).unwrap();
    let mut tt = tinytemplate::TinyTemplate::new();
    tt.add_template("hello", TEMPLATE).unwrap();
    tt.add_formatter("ident", ident_formatter);
    tt.add_formatter("json", json_formatter);

    let rendered = tt.render("hello", &config).unwrap();
    println!("{}", rendered);
}
