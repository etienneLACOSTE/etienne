// @ts-check
// Sessions: a random token in an HttpOnly cookie; the database keeps only its SHA-256.

const crypto = require('crypto');

const COOKIE = 'sid';
const SESSION_DAYS = 30;

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');

/** The cookie's options: never readable by scripts, sent to this site only, HTTPS in production. */
function cookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: /** @type {'lax'} */ ('lax'),
        path: '/',
        maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    };
}

/** The value of one cookie in a Cookie header, or null. */
function readCookie(header, name) {
    if (typeof header !== 'string') return null;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
    }
    return null;
}

/** @param {import('../db').Db} db */
function sessionStore(db) {
    return {
        /** A new session for the user; returns the token for the cookie. */
        async create(userId) {
            const token = newToken();
            await db.query(
                `INSERT INTO sessions (token_hash, user_id, expires_at)
                 VALUES ($1, $2, now() + make_interval(days => $3))`,
                [sha256(token), userId, SESSION_DAYS],
            );
            return token;
        },

        /** The signed-in user for a Cookie header, or null. */
        async userFor(cookieHeader) {
            const token = readCookie(cookieHeader, COOKIE);
            if (!token || token.length > 100) return null;
            const { rows } = await db.query(
                `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.token_hash = $1 AND s.expires_at > now()`,
                [sha256(token)],
            );
            return rows[0] || null;
        },

        async destroy(cookieHeader) {
            const token = readCookie(cookieHeader, COOKIE);
            if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token)]);
        },

        /** Sign the user out everywhere (after a password reset, for instance). */
        async destroyAllFor(userId) {
            await db.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
        },

        async deleteExpired() {
            await db.query('DELETE FROM sessions WHERE expires_at <= now()');
        },
    };
}

module.exports = { COOKIE, cookieOptions, readCookie, sessionStore, sha256, newToken };
