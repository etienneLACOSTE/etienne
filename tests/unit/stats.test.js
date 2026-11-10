// Game results: checks, recording (online by the server, bot/local by the page),
// summary for the account page, totals shown to opponents.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { openDb } = require('../../server/db');
const { statsStore, resultProblem, MAX_DURATION_S } = require('../../server/stats');
const { authRouter } = require('../../server/accounts/routes');
const { accountRouter } = require('../../server/accounts/account-routes');

let db; let stats; let server; let base;
before(async () => {
    db = await openDb({ url: '' });
    stats = statsStore(db);
    const app = express();
    app.use('/api/auth', authRouter(db, { attemptsPerWindow: 1000 }));
    app.use('/api/account', accountRouter(db, { attemptsPerWindow: 1000 }));
    server = http.createServer(app).listen(0);
    base = `http://localhost:${server.address().port}`;
});
after(async () => { server.close(); await db.close(); });

async function user(name) {
    const { rows } = await db.query('INSERT INTO users (username) VALUES ($1) RETURNING id, username', [name]);
    return rows[0];
}

const good = { game: 'chesspell', mode: 'bot', result: 'win', reason: 'king', opponent: 'Bot (1500 ELO)', durationS: 300 };

test('a result sent by a page is checked field by field', () => {
    assert.equal(resultProblem(good), null);
    assert.match(resultProblem({ ...good, mode: 'online' }), /bot or on the same screen/, 'online results come from the server only');
    assert.match(resultProblem({ ...good, game: 'poker' }), /game/);
    assert.match(resultProblem({ ...good, result: 'winner' }), /result/);
    assert.match(resultProblem({ ...good, reason: 'touchdown' }), /reason/, "no touchdown in Ches'spell");
    assert.equal(resultProblem({ ...good, game: 'chessdown', reason: 'touchdown' }), null);
    assert.match(resultProblem({ ...good, opponent: 'x'.repeat(31) }), /opponent/);
    assert.match(resultProblem({ ...good, durationS: -1 }), /duration/);
    assert.match(resultProblem({ ...good, durationS: 1.5 }), /duration/);
    assert.match(resultProblem(null), /Bad request/);
});

test('an online game counts for each signed-in player, from their side; guests are skipped', async () => {
    const [ana, ben] = [await user('Ana'), await user('Ben')];
    await stats.recordOnline({ game: 'chessdown', accounts: { 1: ana, 2: ben }, names: { 1: 'Ana', 2: 'Ben' }, winner: 2, reason: 'touchdown', startedAt: Date.now() - 90_000 });
    await stats.recordOnline({ game: 'chessdown', accounts: { 1: ana, 2: null }, names: { 1: 'Ana', 2: 'Guest' }, winner: 0, reason: 'repetition', startedAt: Date.now() });
    const a = await stats.summary(ana.id);
    const b = await stats.summary(ben.id);
    assert.deepEqual(a.games.chessdown.modes.online, { wins: 0, losses: 1, draws: 1 });
    assert.deepEqual(b.games.chessdown.modes.online, { wins: 1, losses: 0, draws: 0 });
    assert.equal(b.recent[0].opponent, 'Ana');
    assert.ok(Math.abs(a.games.chessdown.seconds - 90) <= 1);
    assert.deepEqual(await stats.totals(ana.id), { chesspell: { played: 0, wins: 0 }, chessdown: { played: 2, wins: 0 } });
});

test('one account on both sides of an online game: counted for nobody', async () => {
    const dee = await user('Dee');
    await stats.recordOnline({ game: 'chesspell', accounts: { 1: dee, 2: { ...dee, id: String(dee.id) } }, names: { 1: 'Dee', 2: 'Dee' }, winner: 1, reason: 'king', startedAt: Date.now() });
    assert.deepEqual((await stats.summary(dee.id)).recent, []);
});

test('totals shown to opponents count online games only (the others are declared by the page)', async () => {
    const [eve, fay] = [await user('Eve'), await user('Fay')];
    await stats.record({ userId: eve.id, ...good }); // A bot game won
    await stats.record({ userId: eve.id, ...good, mode: 'local' });
    await stats.recordOnline({ game: 'chesspell', accounts: { 1: eve, 2: fay }, names: { 1: 'Eve', 2: 'Fay' }, winner: 2, reason: 'forfeit', startedAt: Date.now() });
    assert.deepEqual((await stats.totals(eve.id)).chesspell, { played: 1, wins: 0 });
    assert.deepEqual((await stats.totals(fay.id)).chesspell, { played: 1, wins: 1 });
});

test('durations are clamped: a forgotten tab does not add days', async () => {
    const cy = await user('Cy');
    await stats.record({ userId: cy.id, ...good, durationS: 999_999 });
    assert.equal((await stats.summary(cy.id)).games.chesspell.seconds, MAX_DURATION_S);
});

test('routes: send a bot game, read the stats, export them, delete them with the account', async () => {
    const res = await fetch(`${base}/api/auth/signup`, {
        method: 'POST', headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ username: 'Dina', email: 'dina@example.com', password: 'correct horse battery' }),
    });
    const cookie = res.headers.get('set-cookie').split(';')[0];
    const call = (path, method = 'GET', body) => fetch(base + path, {
        method, headers: { cookie, origin: base, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body && JSON.stringify(body),
    });
    assert.equal((await call('/api/account/results', 'POST', { ...good, mode: 'online' })).status, 400);
    assert.equal((await call('/api/account/results', 'POST', good)).status, 201);
    assert.equal((await call('/api/account/results', 'POST', { ...good, result: 'loss', mode: 'local', opponent: 'Guest 2' })).status, 201);
    const summary = await (await call('/api/account/stats')).json();
    assert.deepEqual(summary.games.chesspell.modes.bot, { wins: 1, losses: 0, draws: 0 });
    assert.deepEqual(summary.games.chesspell.modes.local, { wins: 0, losses: 1, draws: 0 });
    assert.equal(summary.recent.length, 2);
    const exported = await (await call('/api/account/export')).json();
    assert.equal(exported.games.length, 2);
    assert.equal((await fetch(`${base}/api/account/stats`)).status, 401);
    await call('/api/account', 'DELETE', { confirm: 'Dina', password: 'correct horse battery' });
    const { rows } = await db.query("SELECT count(*)::int AS n FROM game_results WHERE opponent = 'Guest 2'");
    assert.equal(rows[0].n, 0);
});
