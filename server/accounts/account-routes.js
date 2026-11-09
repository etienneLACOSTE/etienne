// @ts-check
// The signed-in player's own account, under /api/account: see it, download every piece
// of data the site keeps about it, delete it.

const express = require('express');
const { verifyPassword } = require('./passwords');
const { COOKIE, cookieOptions, sessionStore } = require('./sessions');
const { sameOrigin } = require('./routes');
const { rateLimit } = require('./rate-limit');

/**
 * @param {import('../db').Db} db
 * @param {{ attemptsPerWindow?: number, windowMs?: number }} [options]
 */
function accountRouter(db, { attemptsPerWindow = 10, windowMs = 15 * 60 * 1000 } = {}) {
    const sessions = sessionStore(db);
    const router = express.Router();
    router.use(express.json({ limit: '4kb' }));
    router.use(sameOrigin);
    router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

    /** Only for a signed-in player: the user is in res.locals.user. */
    router.use(async (req, res, next) => {
        const user = await sessions.userFor(req.headers.cookie);
        if (!user) return res.status(401).json({ error: 'Sign in first.' });
        res.locals.user = user;
        next();
    });

    const loadAccount = async (userId) => {
        const { rows } = await db.query(
            'SELECT id, username, email, created_at, password_hash IS NOT NULL AS has_password FROM users WHERE id = $1',
            [userId],
        );
        const providers = (await db.query(
            'SELECT provider, created_at FROM identities WHERE user_id = $1 ORDER BY provider', [userId],
        )).rows;
        return { ...rows[0], providers };
    };

    router.get('/', async (req, res) => {
        const a = await loadAccount(res.locals.user.id);
        res.json({ account: {
            username: a.username, email: a.email, createdAt: a.created_at,
            hasPassword: a.has_password, providers: a.providers.map((p) => p.provider),
        } });
    });

    /** Everything stored about the player, as a JSON file (right of access, GDPR art. 15 and 20). */
    router.get('/export', async (req, res) => {
        const a = await loadAccount(res.locals.user.id);
        const signedIn = (await db.query(
            'SELECT created_at, expires_at FROM sessions WHERE user_id = $1 ORDER BY created_at', [a.id],
        )).rows;
        res.attachment(`etienne-account-${a.username}.json`);
        res.json({
            exportedAt: new Date().toISOString(),
            account: { username: a.username, email: a.email, createdAt: a.created_at, hasPassword: a.has_password },
            linkedSignIns: a.providers.map((p) => ({ provider: p.provider, linkedAt: p.created_at })),
            sessions: signedIn.map((s) => ({ signedInAt: s.created_at, expiresAt: s.expires_at })),
            note: 'The password itself is never stored, only a one-way hash of it, which is not included.',
        });
    });

    /** Unlink Google or GitHub, as long as another way to sign in remains. */
    router.delete('/providers/:provider', async (req, res) => {
        const account = await loadAccount(res.locals.user.id);
        const linked = account.providers.map((p) => p.provider);
        if (!linked.includes(req.params.provider)) return res.status(404).json({ error: 'Not linked.' });
        if (!account.has_password && linked.length === 1) {
            return res.status(400).json({ error: 'This is your only way to sign in: link another one first.' });
        }
        await db.query('DELETE FROM identities WHERE user_id = $1 AND provider = $2', [account.id, req.params.provider]);
        res.json({ ok: true });
    });

    /** Delete the account and everything linked to it. Asks for the username, and the password if there is one. */
    router.delete('/', rateLimit({ max: attemptsPerWindow, windowMs }), async (req, res) => {
        const { confirm, password } = req.body || {};
        const { rows } = await db.query('SELECT username, password_hash FROM users WHERE id = $1', [res.locals.user.id]);
        const user = rows[0];
        if (typeof confirm !== 'string' || confirm.toLowerCase() !== user.username.toLowerCase()) {
            return res.status(400).json({ error: 'Type your username to confirm.' });
        }
        if (user.password_hash && (typeof password !== 'string' || password.length > 128
            || !(await verifyPassword(password, user.password_hash)))) {
            return res.status(401).json({ error: 'Wrong password.' });
        }
        await db.query('DELETE FROM users WHERE id = $1', [res.locals.user.id]); // Sessions and links go with it
        res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
        res.json({ ok: true });
    });

    router.use((err, req, res, next) => {
        if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Bad request.' });
        }
        console.error(`Account API error on ${req.method} ${req.path}: ${err.message}`);
        res.status(500).json({ error: 'Something went wrong. Try again.' });
    });

    return router;
}

module.exports = { accountRouter };
