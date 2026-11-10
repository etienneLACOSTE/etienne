// @ts-check
// The signed-in player's own account, under /api/account: see it, its picture, each
// game's saved deck, download every piece of data the site keeps about it, delete it.

const express = require('express');
const { verifyPassword } = require('./passwords');
const { COOKIE, cookieOptions, sessionStore } = require('./sessions');
const { sameOrigin } = require('./routes');
const { rateLimit } = require('./rate-limit');
const { avatarProblem } = require('./avatar');
const { sanitizeDeck } = require('../chesspell');
const { statsStore, resultProblem } = require('../stats');
const { friendStore } = require('../friends');

/** What each game may save on the account, checked like the game server checks it. */
const DECK_CHECKS = {
    chesspell: (data) => sanitizeDeck(data),
};
/** The check for a game named in a URL: its own entries only, never Object's ("constructor"). */
const deckCheck = (game) => (Object.hasOwn(DECK_CHECKS, game) ? DECK_CHECKS[game] : null);

/**
 * @param {import('../db').Db} db
 * @param {{ attemptsPerWindow?: number, windowMs?: number, onSignOut?: (who: { userId: number }) => void }} [options]
 *   onSignOut: the account was signed out everywhere, or deleted (server/sign-out.js)
 */
function accountRouter(db, { attemptsPerWindow = 10, windowMs = 15 * 60 * 1000, onSignOut = () => {} } = {}) {
    const sessions = sessionStore(db);
    const stats = statsStore(db);
    const router = express.Router();
    const smallBody = express.json({ limit: '4kb' });
    const pictureBody = express.json({ limit: '48kb' });
    router.use((req, res, next) => (req.path === '/avatar' ? pictureBody : smallBody)(req, res, next));
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
            'SELECT id, username, email, avatar, created_at, password_hash IS NOT NULL AS has_password FROM users WHERE id = $1',
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
            username: a.username, email: a.email, avatar: a.avatar || '', createdAt: a.created_at,
            hasPassword: a.has_password, providers: a.providers.map((p) => p.provider),
        } });
    });

    /** The account picture: set it (a small image, checked), or remove it with null. */
    router.put('/avatar', async (req, res) => {
        const { avatar } = req.body || {};
        if (avatar !== null) {
            const problem = avatarProblem(avatar);
            if (problem) return res.status(400).json({ error: problem });
        }
        await db.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, res.locals.user.id]);
        res.json({ ok: true });
    });

    /** Results per game and mode, time played, and the last games. */
    router.get('/stats', async (req, res) => {
        res.json(await stats.summary(res.locals.user.id));
    });

    /**
     * A game against the bot or on the same screen, sent by the page (online games are
     * recorded by the game servers). Shown apart from online results on the account page.
     */
    router.post('/results', rateLimit({ max: 60, windowMs: 60 * 60 * 1000 }), async (req, res) => {
        const r = req.body || {};
        const problem = resultProblem(r);
        if (problem) return res.status(400).json({ error: problem });
        await stats.record({ userId: res.locals.user.id, game: r.game, mode: r.mode, result: r.result, reason: r.reason, opponent: r.opponent, durationS: r.durationS });
        res.status(201).json({ ok: true });
    });

    /** A game's saved deck (null when none). */
    router.get('/decks/:game', async (req, res) => {
        if (!deckCheck(req.params.game)) return res.status(404).json({ error: 'Not found.' });
        const { rows } = await db.query('SELECT data FROM game_decks WHERE user_id = $1 AND game = $2', [res.locals.user.id, req.params.game]);
        res.json({ deck: rows[0] ? rows[0].data : null });
    });

    router.put('/decks/:game', async (req, res) => {
        const check = deckCheck(req.params.game);
        if (!check) return res.status(404).json({ error: 'Not found.' });
        const deck = check((req.body || {}).deck);
        if (!deck) return res.status(400).json({ error: 'This deck is not valid.' });
        await db.query(
            `INSERT INTO game_decks (user_id, game, data) VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (user_id, game) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
            [res.locals.user.id, req.params.game, JSON.stringify(deck)],
        );
        res.json({ deck });
    });

    /** Everything stored about the player, as a JSON file (right of access, GDPR art. 15 and 20). */
    router.get('/export', async (req, res) => {
        const a = await loadAccount(res.locals.user.id);
        const signedIn = (await db.query(
            'SELECT created_at, expires_at FROM sessions WHERE user_id = $1 ORDER BY created_at', [a.id],
        )).rows;
        const decks = (await db.query('SELECT game, data, updated_at FROM game_decks WHERE user_id = $1 ORDER BY game', [a.id])).rows;
        res.attachment(`pawnet-account-${a.username}.json`);
        res.json({
            exportedAt: new Date().toISOString(),
            account: { username: a.username, email: a.email, createdAt: a.created_at, hasPassword: a.has_password, avatar: a.avatar || null },
            decks: decks.map((d) => ({ game: d.game, deck: d.data, savedAt: d.updated_at })),
            games: await stats.all(a.id),
            friends: await (async () => {
                const f = await friendStore(db).list(a.id);
                return {
                    friends: f.friends.map((x) => ({ username: x.username, since: x.since })),
                    requestsReceived: f.incoming.map((x) => ({ from: x.username, sentAt: x.sentAt })),
                    requestsSent: f.outgoing.map((x) => ({ to: x.username, sentAt: x.sentAt })),
                    blocked: f.blocked,
                };
            })(),
            linkedSignIns: a.providers.map((p) => ({ provider: p.provider, linkedAt: p.created_at })),
            sessions: signedIn.map((s) => ({ signedInAt: s.created_at, expiresAt: s.expires_at })),
            note: 'The password itself is never stored, only a one-way hash of it, which is not included.',
        });
    });

    /** Sign out on every device (this one included). */
    router.post('/sessions/logout-all', async (req, res) => {
        await sessions.destroyAllFor(res.locals.user.id);
        onSignOut({ userId: res.locals.user.id });
        res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
        res.json({ ok: true });
    });

    /** Unlink Google, as long as another way to sign in remains. */
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
        onSignOut({ userId: res.locals.user.id });
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
