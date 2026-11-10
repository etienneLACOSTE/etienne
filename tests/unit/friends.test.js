// Friends: requests, acceptance, removal, blocks, through the real routes and an
// in-memory PostgreSQL.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { openDb } = require('../../server/db');
const { authRouter } = require('../../server/accounts/routes');
const { friendsRouter } = require('../../server/friends');

let db; let server; let base;
const changes = [];
before(async () => {
    db = await openDb({ url: '' });
    const app = express();
    app.use('/api/auth', authRouter(db, { attemptsPerWindow: 1000 }));
    app.use('/api/friends', friendsRouter(db, { requestsPerWindow: 1000, onChange: (ids) => changes.push(ids) }));
    server = http.createServer(app).listen(0);
    base = `http://localhost:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });

/** A signed-in player: call(path, method, body). */
async function player(name) {
    const res = await fetch(`${base}/api/auth/signup`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ username: name, email: `${name}@example.com`, password: 'correct horse battery' }),
    });
    const cookie = res.headers.get('set-cookie').split(';')[0];
    const call = async (path, method = 'GET', body) => {
        const r = await fetch(`${base}/api/friends${path}`, {
            method, headers: { cookie, origin: base, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body && JSON.stringify(body),
        });
        return { status: r.status, json: await r.json() };
    };
    return { name, call };
}
const names = (list) => list.map((x) => x.username || x);

test('only for signed-in players', async () => {
    assert.equal((await fetch(`${base}/api/friends`)).status, 401);
});

test('a request, accepted, makes two friends; either can remove the other', async () => {
    const [ann, bob] = [await player('Ann'), await player('Bob')];
    const sent = await ann.call('/requests', 'POST', { username: 'bob' });
    assert.deepEqual([sent.status, sent.json], [201, { status: 'sent', username: 'Bob' }]);
    assert.deepEqual(names((await ann.call('')).json.outgoing), ['Bob']);
    assert.deepEqual(names((await bob.call('')).json.incoming), ['Ann']);
    assert.equal((await ann.call('/requests/Bob/accept', 'POST')).status, 404, 'only the one asked can accept');
    assert.equal((await bob.call('/requests/Ann/accept', 'POST')).status, 200);
    assert.deepEqual(names((await ann.call('')).json.friends), ['Bob']);
    assert.deepEqual(names((await bob.call('')).json.friends), ['Ann']);
    assert.deepEqual((await bob.call('')).json.incoming, []);
    assert.equal((await bob.call('/Ann', 'DELETE')).status, 200);
    assert.deepEqual((await ann.call('')).json.friends, []);
    assert.ok(changes.length > 0, 'both players are told their list changed');
});

test('asking someone who already asked you makes you friends at once', async () => {
    const [cat, dan] = [await player('Cat'), await player('Dan')];
    await cat.call('/requests', 'POST', { username: 'Dan' });
    const res = await dan.call('/requests', 'POST', { username: 'Cat' });
    assert.equal(res.json.status, 'friends');
    assert.deepEqual(names((await cat.call('')).json.friends), ['Dan']);
});

test('decline a request received, or cancel one sent', async () => {
    const [eve, fay] = [await player('Eve'), await player('Fay')];
    await eve.call('/requests', 'POST', { username: 'Fay' });
    await fay.call('/requests/Eve', 'DELETE');
    assert.deepEqual((await eve.call('')).json.outgoing, []);
    await eve.call('/requests', 'POST', { username: 'Fay' });
    await eve.call('/requests/Fay', 'DELETE');
    assert.deepEqual((await fay.call('')).json.incoming, []);
});

test('unknown players and yourself are refused', async () => {
    const gus = await player('Gus');
    assert.equal((await gus.call('/requests', 'POST', { username: 'Nobody' })).status, 404);
    assert.equal((await gus.call('/requests', 'POST', { username: 'GUS' })).status, 400);
    assert.equal((await gus.call('/requests', 'POST', { username: ['Gus'] })).status, 404);
});

test("a block ends the friendship; the blocked player's requests are dropped without telling them", async () => {
    const [hal, ivy] = [await player('Hal'), await player('Ivy')];
    await hal.call('/requests', 'POST', { username: 'Ivy' });
    await ivy.call('/requests/Hal/accept', 'POST');
    assert.equal((await ivy.call('/blocks', 'POST', { username: 'Hal' })).status, 201);
    assert.deepEqual((await hal.call('')).json.friends, []);
    assert.deepEqual((await ivy.call('')).json.blocked, ['Hal']);

    const again = await hal.call('/requests', 'POST', { username: 'Ivy' });
    assert.deepEqual([again.status, again.json.status], [201, 'sent'], 'looks sent to Hal');
    assert.deepEqual((await ivy.call('')).json.incoming, [], 'but Ivy never receives it');
    assert.match((await ivy.call('/requests', 'POST', { username: 'Hal' })).json.error, /unblock/);

    await ivy.call('/blocks/Hal', 'DELETE');
    assert.deepEqual((await ivy.call('')).json.blocked, []);
});

test('changes from another site are refused (CSRF)', async () => {
    const jo = await player('Joe');
    await player('Kim');
    const res = await fetch(`${base}/api/friends/requests`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example', cookie: '' },
        body: JSON.stringify({ username: 'Kim' }),
    });
    assert.equal(res.status, 403);
    assert.deepEqual((await jo.call('')).json.outgoing, []);
});

test('ids that come back as text (node-postgres) still pair correctly: ids 9 and 10', async () => {
    const textDb = await openDb({ url: '', idsAsText: true });
    const { friendStore } = require('../../server/friends');
    const store = friendStore(textDb);
    const ids = [];
    for (let i = 1; i <= 10; i++) {
        ids.push((await textDb.query('INSERT INTO users (username) VALUES ($1) RETURNING id', [`user${i}`])).rows[0].id);
    }
    assert.equal(typeof ids[8], 'string', 'this database returns ids as text, like pg by default');
    const [nine, ten] = [{ id: ids[8], username: 'user9' }, { id: ids[9], username: 'user10' }];
    assert.equal(await store.request(ten, nine), 'sent');
    assert.equal(await store.request(nine, ten), 'friends', 'the crossing request befriends them');
    assert.equal(await store.areFriends(ten.id, nine.id), true);
    assert.deepEqual((await store.list(nine.id)).friends.map((f) => f.username), ['user10']);
    await store.unfriend(nine.id, ten.id);
    assert.equal(await store.areFriends(nine.id, ten.id), false);
    await textDb.close();
});

test('the production driver returns bigint ids as numbers', () => {
    const { useNumbersForBigint } = require('../../server/db');
    const { types } = require('pg');
    useNumbersForBigint();
    assert.equal(types.getTypeParser(types.builtins.INT8)('12'), 12);
});
