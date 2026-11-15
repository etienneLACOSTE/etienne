// @ts-check
// Transactions on the production pool (server/db/index.js), with a stand-in client.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inTransaction, openDb } = require('../../server/db');

function fakePool({ failRollback = false } = {}) {
    const client = {
        sql: [], released: /** @type {any} */ (null),
        params: /** @type {any[]} */ ([]),
        async query(sql, params) {
            client.sql.push(sql);
            client.params.push(params);
            if (sql === 'ROLLBACK' && failRollback) throw new Error('connection lost');
            return { rows: [] };
        },
        release(err) { client.released = { err }; },
    };
    return { client, connect: async () => client };
}

test('a transaction commits, and gives its client back', async () => {
    const pool = fakePool();
    assert.equal(await inTransaction(pool, async (tx) => { await tx.query('SELECT 1'); return 'done'; }), 'done');
    assert.deepEqual(pool.client.sql, ['BEGIN', 'SELECT 1', 'COMMIT']);
    assert.equal(pool.client.released.err, undefined);
});

test('a failed transaction rolls back and throws its own error', async () => {
    const pool = fakePool();
    await assert.rejects(inTransaction(pool, async () => { throw new Error('duplicate key'); }), /duplicate key/);
    assert.deepEqual(pool.client.sql, ['BEGIN', 'ROLLBACK']);
    assert.equal(pool.client.released.err, undefined);
});

test('when the rollback fails too, the original error is kept and the client is closed', async () => {
    const pool = fakePool({ failRollback: true });
    await assert.rejects(inTransaction(pool, async () => { throw new Error('duplicate key'); }), /duplicate key/);
    assert.match(pool.client.released.err.message, /connection lost/, 'released with an error: the pool closes it');
});

test('exec sends a whole script without parameters (simple protocol: several statements)', async () => {
    const pool = fakePool();
    const script = 'CREATE TABLE a (x int);\nCREATE TABLE b (y int);';
    await inTransaction(pool, (tx) => tx.exec(script));
    assert.deepEqual(pool.client.sql, ['BEGIN', script, 'COMMIT']);
    assert.equal(pool.client.params[1], undefined);
});

/** A migration-like script that line-splitting on ';' used to break. */
const TRICKY = `-- A comment that ends with a semicolon;
CREATE TABLE notes (
    id int PRIMARY KEY,
    body text NOT NULL DEFAULT 'one;
two;'
);
/* a block comment;
   on two lines; */
DO $$
BEGIN
    INSERT INTO notes (id) VALUES (1);
    IF (SELECT count(*) FROM notes) <> 1 THEN
        RAISE EXCEPTION 'expected one note';
    END IF;
END
$$;
CREATE FUNCTION notes_count() RETURNS bigint LANGUAGE sql AS $body$
    SELECT count(*) FROM notes;
$body$;`;

test('a whole script runs in a transaction: comments, strings and $$ bodies with semicolons', async () => {
    const db = await openDb({ url: '' });
    try {
        await db.transaction((tx) => tx.exec(TRICKY));
        const { rows } = await db.query('SELECT body, notes_count() AS n FROM notes');
        assert.deepEqual(rows, [{ body: 'one;\ntwo;', n: 1 }]);
    } finally {
        await db.close();
    }
});

test('a script that fails halfway changes nothing', async () => {
    const db = await openDb({ url: '' });
    try {
        await assert.rejects(db.transaction((tx) => tx.exec('CREATE TABLE half (x int);\nSELECT * FROM missing_table;')), /missing_table/);
        const { rows } = await db.query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'half'`);
        assert.deepEqual(rows, []);
    } finally {
        await db.close();
    }
});
