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
        const statements = fs.readFileSync(path.join(DIR, file), 'utf8')
            .split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);
        await db.transaction(async (tx) => {
            for (const sql of statements) await tx.query(sql);
            await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        });
    }
}

module.exports = { migrate };
