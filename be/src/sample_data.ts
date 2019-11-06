
import fetch from 'node-fetch';
import {Response} from 'node-fetch';
import * as types from './types';

async function postit(body: types.Action): Promise<void> {
    const res = await fetch('http://localhost:3000/action', {
        method: 'post',
        body:    JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },

    });

    console.log(await res.text());
}

async function main(): Promise<void> {
    const gameId = '4'
    await postit({
        gameId,
        playerId: 'ehopper',
        kind: 'join_game'
    })
    await postit({
        gameId,
        playerId: 'hjfreyer',
        kind: 'join_game'
    })
    await postit({
        gameId,
        playerId: 'hjfreyer',
        kind: 'start_game'
    })
    await postit({
        gameId,
        playerId: 'hjfreyer',
        kind: 'make_move',
        submission: {
            kind: 'word',
            word: 'foo'
        }
    })
    await postit({
        gameId,
        playerId: 'ehopper',
        kind: 'make_move',
        submission: {
            kind: 'word',
            word: 'bar'
        }
    })
}
main()