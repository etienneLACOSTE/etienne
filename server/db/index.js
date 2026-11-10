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

/** @returns {Promise<Db>} */
async function openPostgres(url) {
    const { Pool } = require('pg');
    useNumbersForBigint();
    const pool = new Pool({ connectionString: url, max: 5 });
    return {
        query: (sql, params) => pool.query(sql, params),
        async transaction(fn) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const result = await fn({ query: (sql, params) => client.query(sql, params) });
                await client.query('COMMIT');
                return result;
            } catch (err) {
                await client.query('ROLLBACK');
                throw err;
            } finally {
                client.release();
            }
        },
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

module.exports = { openDb, useNumbersForBigint };
