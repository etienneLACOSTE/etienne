// @ts-check
// Transactions on the production pool (server/db/index.js), with a stand-in client.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inTransaction } = require('../../server/db');

function fakePool({ failRollback = false } = {}) {
    const client = {
        sql: [], released: /** @type {any} */ (null),
        async query(sql) {
            client.sql.push(sql);
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
