// Chessdown ladders (server/ladders.js): seasons, Elo, the daily limit between two
// players, the board (hidden players), and the carry-over into the next season.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../../server/db');
const L = require('../../server/ladders');

let db; let ladders;
before(async () => {
    db = await openDb({ url: '' });
    ladders = L.ladderStore(db);
});
after(async () => { await db.close(); });

async function user(name) {
    const { rows } = await db.query('INSERT INTO users (username) VALUES ($1) RETURNING id, username', [name]);
    return rows[0];
}

test('seasons are months, in UTC', () => {
    assert.equal(L.seasonOf(new Date('2026-11-30T23:59:00Z')), '2026-11');
    assert.equal(L.seasonOf(new Date('2026-12-01T00:00:00Z')), '2026-12');
    assert.equal(L.previousSeason('2026-01'), '2025-12');
    assert.equal(L.previousSeason('2026-11'), '2026-10');
    assert.equal(L.daysLeft(new Date('2026-11-30T12:00:00Z')), 1);
    assert.equal(L.daysLeft(new Date('2026-11-01T00:00:00Z')), 30);
});

test('Elo: an upset moves more than an expected win; new players move faster', () => {
    const veteran = (rating) => ({ rating, series: 20 });
    const [a1, b1] = L.newRatings(veteran(1000), veteran(1000), 1);
    assert.deepEqual([a1, b1], [1016, 984]);
    const [up] = L.newRatings(veteran(900), veteran(1100), 1);
    const [fav] = L.newRatings(veteran(1100), veteran(900), 1);
    assert.ok(up - 900 > fav - 1100, 'beating a stronger player brings more');
    const [fresh] = L.newRatings({ rating: 1000, series: 0 }, veteran(1000), 1);
    assert.equal(fresh, 1024, 'K = 48 for the first series');
    const [d1, d2] = L.newRatings(veteran(1000), veteran(1000), 0.5);
    assert.deepEqual([d1, d2], [1000, 1000], 'a draw between equals changes nothing');
    assert.equal(L.carryOver(1400), 1200);
    assert.equal(L.carryOver(800), 900);
});

test('a ranked series changes both ratings and the board; one account against itself counts for nobody', async () => {
    const [ana, ben] = [await user('Ana'), await user('Ben')];
    const date = new Date('2026-11-21T10:00:00Z');
    const r = await ladders.recordSeries({ mode: 'classic', players: { 1: ana.id, 2: ben.id }, winner: 1, date });
    assert.equal(r.counted, true);
    assert.deepEqual(r[1], { before: 1000, after: 1024 });
    assert.deepEqual(r[2], { before: 1000, after: 976 });
    assert.equal(await ladders.ratingOf(ana.id, 'classic', date), 1024);
    assert.equal(await ladders.ratingOf(ana.id, 'allstar', date), 1000, 'each mode has its own rating');
    assert.equal(await ladders.recordSeries({ mode: 'classic', players: { 1: ana.id, 2: String(ana.id) }, winner: 1, date }), null);
    assert.equal(await ladders.recordSeries({ mode: 'blitz', players: { 1: ana.id, 2: ben.id }, winner: 1, date }), null);
    const board = await ladders.board('classic', ben.id, date);
    assert.deepEqual(board.top.map((x) => [x.rank, x.username, x.rating]), [[1, 'Ana', 1024], [2, 'Ben', 976]]);
    assert.equal(board.me.rank, 2);
    assert.equal(board.me.losses, 1);
    assert.equal(board.season, '2026-11');
    assert.equal(board.daysLeft, 10);
});

test('the same two players: 3 series counted a day, the next ones are logged but change nothing', async () => {
    const [cy, dee] = [await user('Cy'), await user('Dee')];
    const date = new Date('2026-11-21T10:00:00Z');
    for (let i = 0; i < 3; i++) {
        const players = i % 2 ? { 1: dee.id, 2: cy.id } : { 1: cy.id, 2: dee.id }; // Either seat
        assert.equal((await ladders.recordSeries({ mode: 'allstar', players, winner: 0, date })).counted, true);
    }
    const fourth = await ladders.recordSeries({ mode: 'allstar', players: { 1: cy.id, 2: dee.id }, winner: 1, date });
    assert.equal(fourth.counted, false);
    assert.equal(fourth[1].after, fourth[1].before);
    const nextDay = await ladders.recordSeries({ mode: 'allstar', players: { 1: cy.id, 2: dee.id }, winner: 1, date: new Date('2026-11-22T09:00:00Z') });
    assert.equal(nextDay.counted, true);
    const mine = await ladders.all(cy.id);
    assert.equal(mine.series.length, 5);
    assert.deepEqual(mine.series.map((s) => s.result), ['draw', 'draw', 'draw', 'win', 'win']);
    assert.equal(mine.ratings[0].series, 4);
});

test('a hidden player is off the public board but sees their own rating; ranks skip them', async () => {
    const [eve, fay] = [await user('Eve'), await user('Fay')];
    const date = new Date('2026-10-05T10:00:00Z');
    await ladders.recordSeries({ mode: 'classic', players: { 1: eve.id, 2: fay.id }, winner: 1, date });
    await ladders.setHidden(eve.id, true);
    const seenByFay = await ladders.board('classic', fay.id, date);
    assert.deepEqual(seenByFay.top.map((x) => x.username), ['Fay']);
    assert.equal(seenByFay.me.rank, 1);
    const seenByEve = await ladders.board('classic', eve.id, date);
    assert.equal(seenByEve.me.hidden, true);
    assert.equal(seenByEve.me.rating, 1024);
    assert.equal(seenByEve.me.rank, 1);
});

test('a new season: ratings carry over halfway, last season\'s podium is shown', async () => {
    const [gus, hal] = [await user('Gus'), await user('Hal')];
    const sept = new Date('2026-09-10T10:00:00Z');
    for (let i = 0; i < 3; i++) await ladders.recordSeries({ mode: 'classic', players: { 1: gus.id, 2: hal.id }, winner: 1, date: new Date(sept.getTime() + i * 86_400_000) });
    const septRating = await ladders.ratingOf(gus.id, 'classic', sept);
    assert.ok(septRating > 1050);
    const oct = new Date('2026-10-02T10:00:00Z');
    assert.equal(await ladders.ratingOf(gus.id, 'classic', oct), L.carryOver(septRating));
    const board = await ladders.board('classic', hal.id, oct);
    assert.equal(board.podium[0].username, 'Gus');
    assert.equal(board.me.rank, null, 'no series yet this season: no rank');
});

test('deleting an account takes its ladder lines and series along', async () => {
    const [ivy, jo] = [await user('Ivy'), await user('Jo')];
    await ladders.recordSeries({ mode: 'classic', players: { 1: ivy.id, 2: jo.id }, winner: 2 });
    await db.query('DELETE FROM users WHERE id = $1', [ivy.id]);
    const left = (await db.query('SELECT count(*)::int AS n FROM ladder_series WHERE player1 = $1 OR player2 = $1', [ivy.id])).rows[0].n;
    assert.equal(left, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM ladder_ratings WHERE user_id = $1', [ivy.id])).rows[0].n, 0);
});

test('the board route: signed-in players only, known modes only', async () => {
    const http = require('node:http');
    const express = require('express');
    const { authRouter } = require('../../server/accounts/routes');
    const app = express();
    app.use('/api/auth', authRouter(db, { attemptsPerWindow: 1000 }));
    app.use('/api/ladders', L.ladderRouter(db));
    const server = http.createServer(app).listen(0);
    const base = `http://localhost:${server.address().port}`;
    try {
        assert.equal((await fetch(`${base}/api/ladders/classic`)).status, 401);
        const res = await fetch(`${base}/api/auth/signup`, {
            method: 'POST', headers: { 'content-type': 'application/json', origin: base },
            body: JSON.stringify({ username: 'Kim', email: 'kim@example.com', password: 'correct horse battery' }),
        });
        const cookie = res.headers.get('set-cookie').split(';')[0];
        const board = await (await fetch(`${base}/api/ladders/allstar`, { headers: { cookie } })).json();
        assert.equal(board.mode, 'allstar');
        assert.deepEqual(board.me, { rating: 1000, series: 0, wins: 0, losses: 0, draws: 0, rank: null, hidden: false });
        assert.equal((await fetch(`${base}/api/ladders/constructor`, { headers: { cookie } })).status, 404);
    } finally {
        server.close();
    }
});
