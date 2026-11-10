// @ts-check
// The database: PostgreSQL. In production, DATABASE_URL points to it (Neon). Without
// it, outside production, an in-memory PostgreSQL (PGlite) stands in, for local runs and
// the tests; it is empty at each start.
// Every query is parameterized ($1, $2...): values are never written into the SQL.

const { migrate } = require('./migrate');

/**
 * @typedef {{ rows: any[] }} Result
 * @typedef {{ query: (sql: string, params?: any[]) => Promise<Result> }} Queryable
 * @typedef {Queryable & {
 *   transaction: <T>(fn: (tx: Queryable) => Promise<T>) => Promise<T>,
 *   close: () => Promise<void>,
 * }} Db
 */

/**
 * Ids are bigint columns. node-postgres returns bigint (int8) as a string by default,
 * while PGlite (local runs, tests) returns a number: one type everywhere, numbers, so
 * comparisons and Map keys behave the same in production as in the tests. Ids stay far
 * below 2^53.
 */
function useNumbersForBigint() {
    const { types } = require('pg');
    types.setTypeParser(types.builtins.INT8, (value) => Number(value));
}

/**
 * Run `fn` in a transaction on one client of the pool. If it fails, the transaction is
 * rolled back and the original error is thrown; a client whose rollback fails too is
 * closed rather than reused.
 * @param {{ connect: () => Promise<any> }} pool
 */
async function inTransaction(pool, fn) {
    const client = await pool.connect();
    let broken = null;
    try {
        await client.query('BEGIN');
        const result = await fn({ query: (sql, params) => client.query(sql, params) });
        await client.query('COMMIT');
        return result;
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            broken = rollbackError;
        }
        throw err;
    } finally {
        client.release(broken || undefined);
    }
}

/** @returns {Promise<Db>} */
async function openPostgres(url) {
    const { Pool } = require('pg');
    useNumbersForBigint();
    const pool = new Pool({
        connectionString: url,
        max: 5,
        connectionTimeoutMillis: 10_000, // A request waits at most this long for the database
        idleTimeoutMillis: 30_000,
    });
    // An idle connection that breaks (Neon restarts, network cut) is dropped by the pool;
    // without this listener, the error would stop the whole server.
    pool.on('error', (err) => console.error(`Database: idle connection lost: ${err.message}`));
    return {
        query: (sql, params) => pool.query(sql, params),
        transaction: (fn) => inTransaction(pool, fn),
        close: () => pool.end(),
    };
}

/** @returns {Promise<Db>} */
async function openInMemory(options = {}) {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite(options);
    return {
        query: (sql, params) => pg.query(sql, params),
        transaction: (fn) => pg.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params) })),
        close: () => pg.close(),
    };
}

/**
 * Open the database and bring its tables up to date.
 * @param {{ url?: string, idsAsText?: boolean }} [options] url: a PostgreSQL URL (default:
 *   DATABASE_URL). idsAsText (tests, in-memory only): return bigint ids as text, the way
 *   node-postgres does without useNumbersForBigint, so code that compares ids is tested
 *   against both forms.
 * @returns {Promise<Db>}
 */
async function openDb({ url = process.env.DATABASE_URL, idsAsText = false } = {}) {
    if (!url && process.env.NODE_ENV === 'production') {
        throw new Error('DATABASE_URL is not set: accounts need the database.');
    }
    const db = url
        ? await openPostgres(url)
        : await openInMemory(idsAsText ? { parsers: { 20: (value) => value } } : {}); // 20: int8
    await migrate(db);
    return db;
}

module.exports = { openDb, useNumbersForBigint, inTransaction };
