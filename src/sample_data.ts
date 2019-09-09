
import fetch from 'node-fetch';
import {Response} from 'node-fetch';
import Action from './types/Action';

async function postit(body: Action): Promise<void> {
    const res = await fetch('http://localhost:3000/', {
        method: 'post',
        body:    JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
    });

    console.log(await res.text());
}

async function main(): Promise<void> {
    await postit({
        gameId: '1',
        playerId: 'ehopper',
        kind: 'join_game'
    })
    await postit({
        gameId: '1',
        playerId: 'hjfreyer',
        kind: 'join_game'
    })
}
main()