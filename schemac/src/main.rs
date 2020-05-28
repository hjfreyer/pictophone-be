// use serde::Deserialize;
// use std::io::{self, Read};
// use std::collections::HashMap;


// #[derive(Deserialize, Debug)]
// struct Config {
//     collections : HashMap<String, Collection>,
// }

// #[derive(Deserialize, Debug)]
// struct Collection {
//     tables : HashMap<String, Table>,

// }

// #[derive(Deserialize, Debug)]
// struct Table {
//     schema: Vec<String>,
//     r#type: String,
// }

// fn gen<W : std::io::Write>(w : &mut W, config : &Config)-> Result<(), std::io::Error> {

// }


fn main() {
    println!("{}", r#"
// DON'T EDIT THIS FILE, IT IS AUTO GENERATED

import * as db from './db'
import { Live, Diff, Change, Readable } from './interfaces'
import * as model from './model'
import { validate as validateModel } from './model/index.validator'
import { validateLive, applyChanges, diffToChange } from './schema'
import * as readables from './readables'

export type Tables = {
    actions: db.Table<model.SavedAction>
    actionTableMetadata: db.Table<model.ActionTableMetadata>
    state1_1_0_games: db.Table<Live<model.Game1_1>>
    state1_1_0_shortCodeUsageCount: db.Table<Live<model.NumberValue>>
    state1_1_1_games: db.Table<Live<model.Game1_1>>
    state1_1_1_shortCodeUsageCount: db.Table<Live<model.NumberValue>>
    state1_1_1_gamesByPlayer: db.Table<Live<model.Game1_1>>
}

export type Inputs1_1_0 = {
    games: Readable<model.Game1_1>
    shortCodeUsageCount: Readable<model.NumberValue>
}

export type Inputs1_1_1 = {
    games: Readable<model.Game1_1>
    shortCodeUsageCount: Readable<model.NumberValue>
}

export type Outputs1_1_0 = {
    games: Diff<model.Game1_1>[]
    shortCodeUsageCount: Diff<model.NumberValue>[]
}

export type Outputs1_1_1 = {
    games: Diff<model.Game1_1>[]
    shortCodeUsageCount: Diff<model.NumberValue>[]
    gamesByPlayer: Diff<model.Game1_1>[]
}

export function openAll(db: db.Database): Tables {
    return {
        actions: db.open({
            schema: ['actions'],
            validator: validateModel('SavedAction')
        }),
        actionTableMetadata: db.open({
            schema: ['actions', '_META_'],
            validator: validateModel('ActionTableMetadata')
        }),
        state1_1_0_games: db.open({
            schema: ['state-1.1.0-games'],
            validator: validateLive(validateModel('Game1_1'))
        }),
        state1_1_0_shortCodeUsageCount: db.open({
            schema: ['state-1.1.0-scuc'],
            validator: validateLive(validateModel('NumberValue'))
        }),
        state1_1_1_games: db.open({
            schema: ['state-1.1.1-games'],
            validator: validateLive(validateModel('Game1_1'))
        }),
        state1_1_1_shortCodeUsageCount: db.open({
            schema: ['state-1.1.1-scuc'],
            validator: validateLive(validateModel('NumberValue'))
        }),
        state1_1_1_gamesByPlayer: db.open({
            schema: ['players', 'state-1.1.1-games-by-player'],
            validator: validateLive(validateModel('Game1_1'))
        }),
    }
}

export function getTrackedInputs1_1_0(ts: Tables): [Set<string>, Inputs1_1_0] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const inputs: Inputs1_1_0 = {
        games: readables.tracked(ts.state1_1_0_games, track),
        shortCodeUsageCount: readables.tracked(ts.state1_1_0_shortCodeUsageCount, track),
    }
    return [parentSet, inputs]
}

export function getTrackedInputs1_1_1(ts: Tables): [Set<string>, Inputs1_1_1] {
    const parentSet = new Set<string>();
    const track = (actionId: string) => { parentSet.add(actionId) };
    const inputs: Inputs1_1_1 = {
        games: readables.tracked(ts.state1_1_1_games, track),
        shortCodeUsageCount: readables.tracked(ts.state1_1_1_shortCodeUsageCount, track)
    }
    return [parentSet, inputs]
}

export function applyOutputs1_1_0(ts: Tables, actionId: string, outputs: Outputs1_1_0): void {
    ts.actionTableMetadata.set([actionId, 'state-1.1.0'], getChangelog1_1_0(outputs));
    applyChanges(ts.state1_1_0_games, actionId, outputs.games.map(diffToChange))
    applyChanges(ts.state1_1_0_shortCodeUsageCount, actionId, outputs.shortCodeUsageCount.map(diffToChange))
}

export function applyOutputs1_1_1(ts: Tables, actionId: string, outputs: Outputs1_1_1): void {
    ts.actionTableMetadata.set([actionId, 'state-1.1.1'], getChangelog1_1_1(ts, outputs));
    applyChanges(ts.state1_1_1_games, actionId, outputs.games.map(diffToChange))
    applyChanges(ts.state1_1_1_shortCodeUsageCount, actionId, outputs.shortCodeUsageCount.map(diffToChange))
    applyChanges(ts.state1_1_1_gamesByPlayer, actionId, outputs.gamesByPlayer.map(diffToChange))
}

function getChangelog1_1_0(outputs: Outputs1_1_0): model.ActionTableMetadata {
    return {
        tables: [{
            schema: ['state-1.1.0-games-symlinks'],
            changes: outputs.games.map(diffToChange),
        }, {
            schema: ['state-1.1.0-scuc-symlinks'],
            changes: outputs.shortCodeUsageCount.map(diffToChange),
        }]
    }
}

function getChangelog1_1_1(ts: Tables, outputs: Outputs1_1_1): model.ActionTableMetadata {
    return {
        tables: [{
            schema: ts.state1_1_1_games.schema,
            changes: outputs.games.map(diffToChange),
        }, {
            schema: ts.state1_1_1_shortCodeUsageCount.schema,
            changes: outputs.shortCodeUsageCount.map(diffToChange),
        }, {
            schema: ts.state1_1_1_gamesByPlayer.schema,
            changes: outputs.gamesByPlayer.map(diffToChange),
        }]
    }
}


export async function deleteCollection(runner: db.TxRunner, collectionId: string): Promise<void> {
    switch (collectionId) {
        case 'state-1.1.0':
            await deleteMeta(runner, 'state-1.1.0')
            await deleteTable(runner, 'state1_1_0_games')
            await deleteTable(runner, 'state1_1_0_shortCodeUsageCount')
            break
        case 'state-1.1.1':
            await deleteMeta(runner, 'state-1.1.1')
            await deleteTable(runner, 'state1_1_1_games')
            await deleteTable(runner, 'state1_1_1_shortCodeUsageCount')
            await deleteTable(runner, 'state1_1_1_gamesByPlayer')
            break
        default:
            throw new Error("invalid option")
    }
}

async function deleteTable(runner: db.TxRunner, tableId: keyof Tables): Promise<void> {
    if (tableId === 'actions') {
        throw new Error('nope')
    }
    await runner(async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        if (!(tableId in ts)) {
            throw new Error(`no such table: "${tableId}"`)
        }
        const table: db.Table<unknown> = ts[tableId as keyof typeof ts];
        for await (const [k,] of readables.readAll(table)) {
            table.delete(k)
        }
    })
}

async function deleteMeta(runner: db.TxRunner, collectionId: string): Promise<void> {
    await runner(async (db: db.Database): Promise<void> => {
        const ts = openAll(db);
        for await (const [k,] of readables.readAll(ts.actionTableMetadata)) {
            if (k[k.length - 1] === collectionId) {
                ts.actionTableMetadata.delete(k)
            }
        }
    })
}
"#)
}



// #[derive(Debug)]
// enum Error {
//     Io(std::io::Error),
//     Parse(toml::de::Error),
// }

// impl From<std::io::Error> for Error {
//     fn from(e: std::io::Error) -> Self {
//         Error::Io(e)
//     }
// }

// impl From<toml::de::Error> for Error {
//     fn from(e: toml::de::Error) -> Self {
//         Error::Parse(e)
//     }
// }

// fn main() -> Result<(), Error> {
//     let mut buffer = String::new();
//     io::stdin().read_to_string(&mut buffer)?;

//     let config: Config = toml::from_str(&buffer)?;
//     gen(&mut io::stdout(), &config)?;
//     Ok(())
// }
