// Reported chat messages (server/reports.js): saved, given in the reporter's export only,
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

const messagesAbout = async (id) => (await db.query('SELECT message FROM chat_reports WHERE reported_id = $1 ORDER BY id', [id])).rows.map((r) => r.message);

test('a report is saved; only the reporter sees it in an export', async () => {
    const reports = reportStore(db);
    const [alice, bob] = [await user('alice'), await user('bob')];
    await reports.save({ reporterId: alice, reportedId: bob, reportedName: 'bob', game: 'chessdown', message: 'you are bad' });
    assert.deepEqual((await reports.madeBy(alice)).map(({ reported, game }) => ({ reported, game })), [{ reported: 'bob', game: 'chessdown' }]);
    assert.deepEqual(await reports.madeBy(bob), []);
    assert.deepEqual(await messagesAbout(bob), ['you are bad']);
});

test(`reports older than ${KEEP_DAYS} days are deleted`, async () => {
    const reports = reportStore(db);
    const [carol, dave] = [await user('carol'), await user('dave')];
    await reports.save({ reporterId: carol, reportedId: dave, reportedName: 'dave', game: 'chesspell', message: 'old' });
    await reports.save({ reporterId: carol, reportedId: dave, reportedName: 'dave', game: 'chesspell', message: 'new' });
    await db.query(`UPDATE chat_reports SET created_at = now() - interval '91 days' WHERE message = 'old'`);
    await reports.deleteOld();
    assert.deepEqual(await messagesAbout(dave), ['new']);
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
