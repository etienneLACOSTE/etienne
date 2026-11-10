// @ts-check
// Account API, under /api/auth: sign up and sign in with a password, sign out, who am I.
// Answers are JSON. Errors never say whether a username or email exists at sign-in.

const express = require('express');
const { hashPassword, verifyPassword } = require('./passwords');
const { COOKIE, cookieOptions, sessionKey, sessionStore } = require('./sessions');
const { usernameProblem, emailProblem, passwordProblem } = require('./validate');
const { rateLimit } = require('./rate-limit');

const WRONG_LOGIN = 'Wrong username, email or password.';
/** Failed sign-ins allowed on one account (by username or email) per window, from any address. */
const FAILURES_PER_LOGIN = 10;
const TOO_MANY_ON_LOGIN = 'Too many wrong passwords for this account. Try again in 15 minutes, or sign in with Google.';
const UNIQUE_VIOLATION = '23505';

/**
 * Changes (POST, PUT, DELETE) are only accepted from this site's own pages: the browser's
 * Origin header must name this host. With the SameSite cookie, this stops other sites from
 * acting with a player's session (CSRF).
 */
function sameOrigin(req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD') return next();
    const origin = req.get('origin');
    let host = null;
    try { host = origin ? new URL(origin).host : null; } catch { host = null; }
    if (!host || host !== req.get('host')) return res.status(403).json({ error: 'Forbidden.' });
    next();
}

/**
 * @param {import('../db').Db} db
 * @param {{ attemptsPerWindow?: number, windowMs?: number, failuresPerLogin?: number,
 *   onSignOut?: (who: { session: string }) => void }} [options] onSignOut: a session ended,
 *   so its open connections stop acting for the account (server/sign-out.js)
 */
function authRouter(db, { attemptsPerWindow = 10, windowMs = 15 * 60 * 1000, failuresPerLogin = FAILURES_PER_LOGIN, onSignOut = () => {} } = {}) {
    const sessions = sessionStore(db);
    const router = express.Router();
    const attempts = rateLimit({ max: attemptsPerWindow, windowMs });
    // Guessing one account's password from many addresses is slowed down too: failed
    // sign-ins are counted per account (its username and email count together), or per
    // login typed when no account has it; in memory, per window.
    /** @type {Map<string, { count: number, resetAt: number }>} */
    const failures = new Map();
    const failureKey = (user, login) => (user ? `user:${user.id}` : `login:${login.trim().toLowerCase()}`);
    const tooManyFailures = (key) => {
        const f = failures.get(key);
        return Boolean(f && f.resetAt > Date.now() && f.count >= failuresPerLogin);
    };
    const recordFailure = (key) => {
        const now = Date.now();
        const f = failures.get(key);
        if (!f || f.resetAt <= now) failures.set(key, { count: 1, resetAt: now + windowMs });
        else f.count++;
    };
    setInterval(() => {
        const now = Date.now();
        for (const [key, f] of failures) if (f.resetAt <= now) failures.delete(key);
    }, windowMs).unref();

    router.use(express.json({ limit: '4kb' }));
    router.use(sameOrigin);

    const signIn = async (res, user, status = 200) => {
        res.cookie(COOKIE, await sessions.create(user.id), cookieOptions());
        res.status(status).json({ user: { id: user.id, username: user.username } });
    };

    router.post('/signup', attempts, async (req, res) => {
        const { username, email, password } = req.body || {};
        const problem = usernameProblem(username) || emailProblem(email) || passwordProblem(password);
        if (problem) return res.status(400).json({ error: problem });

        const taken = (await db.query(
            'SELECT lower(username) = lower($1) AS name FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($2)',
            [username, email],
        )).rows;
        if (taken.length) {
            return res.status(409).json({ error: taken.some((t) => t.name)
                ? 'This username is taken.'
                : 'An account already uses this email: sign in, or reset its password.' });
        }
        const passwordHash = await hashPassword(password);
        try {
            const { rows } = await db.query(
                'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
                [username, email, passwordHash],
            );
            await signIn(res, rows[0], 201);
        } catch (err) {
            if (err.code !== UNIQUE_VIOLATION) throw err;
            res.status(409).json({ error: 'This username or email was just taken.' });
        }
    });

    router.post('/login', attempts, async (req, res) => {
        const { login, password } = req.body || {};
        if (typeof login !== 'string' || typeof password !== 'string' || login.length > 254 || password.length > 128) {
            return res.status(400).json({ error: WRONG_LOGIN });
        }
        const { rows } = await db.query(
            'SELECT id, username, password_hash FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1)',
            [login],
        );
        const user = rows[0];
        const key = failureKey(user, login);
        if (tooManyFailures(key)) return res.status(429).json({ error: TOO_MANY_ON_LOGIN });
        // Checked even when nobody has this login, so that the answer takes as long.
        const ok = await verifyPassword(password, user && user.password_hash);
        if (!user || !ok) {
            recordFailure(key);
            return res.status(401).json({ error: WRONG_LOGIN });
        }
        failures.delete(key);
        await signIn(res, user);
    });

    router.post('/logout', async (req, res) => {
        await sessions.destroy(req.headers.cookie);
        const session = sessionKey(req.headers.cookie);
        if (session) onSignOut({ session });
        res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
        res.json({ ok: true });
    });

    router.get('/me', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({ user: await sessions.userFor(req.headers.cookie) });
    });

    // Unexpected errors: logged without the request body (it may hold a password).
    router.use((err, req, res, next) => {
        if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Bad request.' });
        }
        console.error(`Account API error on ${req.method} ${req.path}: ${err.message}`);
        res.status(500).json({ error: 'Something went wrong. Try again.' });
    });

    return router;
}

module.exports = { authRouter, sameOrigin };
