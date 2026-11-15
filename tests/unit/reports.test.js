// Reported chat messages (server/reports.js): saved, given in each account's export,
// deleted after 90 days, and with the reported player's account.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../../server/db');
const { reportStore, KEEP_DAYS } = require('../../server/reports');

let db;
before(async () => { db = await openDb({ url: '' }); });
after(async () => { await db.close(); });

async function user(name) {
    const { rows } = await db.query('INSERT INTO users (username) VALUES ($1) RETURNING id', [name]);
    return Number(rows[0].id);
}

test('a report is saved; each side sees its own part of it, never who reported them', async () => {
    const reports = reportStore(db);
    const [alice, bob] = [await user('alice'), await user('bob')];
    await reports.save({ reporterId: alice, reportedId: bob, reportedName: 'bob', game: 'chessdown', message: 'you are bad' });
    const mine = await reports.about(alice);
    assert.deepEqual(mine.made.map(({ reported, game }) => ({ reported, game })), [{ reported: 'bob', game: 'chessdown' }]);
    assert.deepEqual(mine.received, []);
    const theirs = await reports.about(bob);
    assert.deepEqual(theirs.made, []);
    assert.deepEqual(theirs.received.map(({ game, message }) => ({ game, message })), [{ game: 'chessdown', message: 'you are bad' }]);
    assert.equal(JSON.stringify(theirs).includes('alice'), false);
});

test(`reports older than ${KEEP_DAYS} days are deleted`, async () => {
    const reports = reportStore(db);
    const [carol, dave] = [await user('carol'), await user('dave')];
    await reports.save({ reporterId: carol, reportedId: dave, reportedName: 'dave', game: 'chesspell', message: 'old' });
    await reports.save({ reporterId: carol, reportedId: dave, reportedName: 'dave', game: 'chesspell', message: 'new' });
    await db.query(`UPDATE chat_reports SET created_at = now() - interval '91 days' WHERE message = 'old'`);
    await reports.deleteOld();
    assert.deepEqual((await reports.about(dave)).received.map((r) => r.message), ['new']);
});

test("deleting an account: the reports about it go, the ones it made lose its name", async () => {
    const reports = reportStore(db);
    const [erin, frank] = [await user('erin'), await user('frank')];
    await reports.save({ reporterId: erin, reportedId: frank, reportedName: 'frank', game: 'chessdown', message: 'a' });
    await reports.save({ reporterId: frank, reportedId: erin, reportedName: 'erin', game: 'chessdown', message: 'b' });
    await db.query('DELETE FROM users WHERE id = $1', [frank]);
    const { rows } = await db.query('SELECT reporter_id, message FROM chat_reports WHERE reported_id = $1 OR reporter_id IS NULL', [erin]);
    assert.deepEqual(rows.map((r) => ({ reporter: r.reporter_id, message: r.message })), [{ reporter: null, message: 'b' }]);
});
