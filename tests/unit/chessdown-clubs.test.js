// A signed-in player's Chessdown club and career kept on the server (server/chessdown-clubs.js).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../../server/db');
const { clubStore, plausibleClub } = require('../../server/chessdown-clubs');
const Club = require('../../games/chessdown/club-rules.js');
const Career = require('../../games/chessdown/career-rules.js');

let db; let clubs;
before(async () => {
    db = await openDb({ url: '' });
    clubs = clubStore(db);
});
after(async () => { await db.close(); });

const identity = { coach: 'Coach Ana', name: 'Racing Pawns', primary: '#1e90ff', secondary: '#ffffff', pattern: 'plain', shape: 'shield', emblem: 'wolf' };
async function user(name) {
    return (await db.query('INSERT INTO users (username) VALUES ($1) RETURNING id', [name])).rows[0].id;
}

test('a club and its career are kept checked; a broken club is refused, a broken career dropped', async () => {
    const id = await user('Ana');
    assert.deepEqual(await clubs.get(id), { club: null, career: null, savedAt: null });
    const club = Club.newClub(identity, 'Rex');
    const career = Career.newCareer(42);
    const saved = await clubs.put(id, club, career);
    assert.equal(saved.club.name, 'Racing Pawns');
    assert.equal(saved.career.seed, career.seed);
    const back = await clubs.get(id);
    assert.equal(back.club.players.length, 7);
    assert.equal(back.career.seed, career.seed);
    assert.equal(await clubs.put(id, { ...club, version: 2 }, career), null, 'a club that fails the checks');
    assert.equal((await clubs.put(id, club, { version: 99 })).career, null, 'a career that fails them');
    assert.deepEqual(await clubs.put(id, null, null), { club: null, career: null });
    assert.equal((await clubs.get(id)).club, null);
});

test('deleting the account deletes its club', async () => {
    const id = await user('Ben');
    await clubs.put(id, Club.newClub(identity, 'Rex'), null);
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM chessdown_clubs WHERE user_id = $1', [id])).rows[0].n, 0);
});

test('online All Star: a level must match the experience behind it', () => {
    const club = Club.newClub(identity, 'Rex');
    assert.equal(plausibleClub(club), true);
    const pumped = { ...club, players: club.players.map((p) => (p.type === 'r' ? { ...p, level: 5 } : p)) };
    assert.equal(plausibleClub(pumped), false, 'level 5 with no experience');
    const earned = { ...club, players: club.players.map((p) => (p.type === 'r' ? { ...p, level: 4, xp: 210 } : p)) };
    assert.equal(plausibleClub(earned), true);
    const dropped = { ...club, players: club.players.map((p) => (p.type === 'r' ? { ...p, level: 4, xp: 198, stats: { ...p.stats, games: 1 } } : p)) };
    assert.equal(plausibleClub(dropped), true, 'experience lost in a game after the level was reached');
});
