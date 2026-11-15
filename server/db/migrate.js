// @ts-check
// Migrations: server/db/migrations/NNN_name.sql, applied once each, in order, each in a
// transaction. A file that was applied is never edited: changes go in a new file.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'migrations');

/** @param {import('./index').Db} db */
async function migrate(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const files = fs.readdirSync(DIR).filter((f) => /^\d{3}_[a-z0-9_]+\.sql$/.test(f)).sort();
    for (const file of files) {
        if (done.has(file)) continue;
        // The whole file at once: PostgreSQL itself reads its statements, so comments,
        // strings and $$ bodies (DO blocks, functions) need no care.
        const script = fs.readFileSync(path.join(DIR, file), 'utf8');
        await db.transaction(async (tx) => {
            await tx.exec(script);
            await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        });
    }
}

module.exports = { migrate };
