// One sign-in per provider and account, held by the database (migration 007).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../../server/db');
const { migrate } = require('../../server/db/migrate');

let db;
before(async () => { db = await openDb({ url: '' }); });
after(async () => { await db.close(); });

const MIGRATION = '007_identities_one_per_provider.sql';

async function user(name) {
    return (await db.query('INSERT INTO users (username) VALUES ($1) RETURNING id', [name])).rows[0].id;
}

test('a second Google sign-in on the same account is refused by the database', async () => {
    const id = await user('gina');
    await db.query(`INSERT INTO identities (provider, subject, user_id) VALUES ('google', 'g-1', $1)`, [id]);
    await assert.rejects(
        db.query(`INSERT INTO identities (provider, subject, user_id) VALUES ('google', 'g-2', $1)`, [id]),
        /identities_one_per_provider/,
    );
    const other = await user('hugo'); // Another account: its own Google sign-in
    await db.query(`INSERT INTO identities (provider, subject, user_id) VALUES ('google', 'g-2', $1)`, [other]);
});

test('an account that already has two: the migration stops, says why, and changes nothing', async () => {
    await db.query('ALTER TABLE identities DROP CONSTRAINT identities_one_per_provider');
    await db.query('DELETE FROM schema_migrations WHERE name = $1', [MIGRATION]);
    const id = await user('ivan');
    await db.query(`INSERT INTO identities (provider, subject, user_id) VALUES ('google', 'g-3', $1), ('google', 'g-4', $1)`, [id]);
    await assert.rejects(migrate(db), /an account has two sign-ins with the same provider/);
    const applied = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [MIGRATION]);
    assert.equal(applied.rows.length, 0);

    // Once fixed by hand, it goes through.
    await db.query(`DELETE FROM identities WHERE subject = 'g-4'`);
    await migrate(db);
    assert.equal((await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [MIGRATION])).rows.length, 1);
});
