// @ts-check
// Friends, under /api/friends (signed-in players only): the list, requests (send by exact
// username, accept, decline or cancel), removal, blocks.
//
// A blocked player is never told so: their requests look sent but are dropped.

const express = require('express');
const { sessionStore } = require('./accounts/sessions');
const { sameOrigin } = require('./accounts/routes');
const { rateLimit } = require('./accounts/rate-limit');

const MAX_PENDING_SENT = 50;
const MAX_FRIENDS = 200;

/** The pair as stored in friendships: smaller id first (compared as numbers, never as text). */
const pair = (a, b) => {
    const [x, y] = [Number(a), Number(b)];
    return x < y ? [x, y] : [y, x];
};

/** @param {import('./db').Db} db */
function friendStore(db) {
    const store = {
        async findUser(username) {
            if (typeof username !== 'string' || username.length > 40) return null;
            const { rows } = await db.query('SELECT id, username FROM users WHERE lower(username) = lower($1)', [username.trim()]);
            return rows[0] || null;
        },

        async userById(id) {
            const { rows } = await db.query('SELECT id, username FROM users WHERE id = $1', [id]);
            return rows[0] || null;
        },

        async blocked(blocker, blocked) {
            const { rows } = await db.query('SELECT 1 FROM blocks WHERE blocker = $1 AND blocked = $2', [blocker, blocked]);
            return rows.length > 0;
        },

        async areFriends(a, b) {
            const { rows } = await db.query('SELECT 1 FROM friendships WHERE user_a = $1 AND user_b = $2', pair(a, b));
            return rows.length > 0;
        },

        /** Ids of a player's friends (for presence and invitations). */
        async friendIds(userId) {
            const { rows } = await db.query(
                'SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS id FROM friendships WHERE user_a = $1 OR user_b = $1',
                [userId],
            );
            return rows.map((r) => Number(r.id));
        },

        /** Everything the friends panel shows. */
        async list(userId) {
            const friends = (await db.query(
                `SELECT u.id, u.username, u.avatar, f.since FROM friendships f
                 JOIN users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
                 WHERE f.user_a = $1 OR f.user_b = $1 ORDER BY lower(u.username)`,
                [userId],
            )).rows;
            const incoming = (await db.query(
                `SELECT u.username, u.avatar, r.created_at FROM friend_requests r JOIN users u ON u.id = r.from_user
                 WHERE r.to_user = $1 ORDER BY r.created_at`, [userId],
            )).rows;
            const outgoing = (await db.query(
                `SELECT u.username, r.created_at FROM friend_requests r JOIN users u ON u.id = r.to_user
                 WHERE r.from_user = $1 ORDER BY r.created_at`, [userId],
            )).rows;
            const blocked = (await db.query(
                `SELECT u.username FROM blocks b JOIN users u ON u.id = b.blocked WHERE b.blocker = $1 ORDER BY lower(u.username)`,
                [userId],
            )).rows;
            return {
                friends: friends.map((f) => ({ id: Number(f.id), username: f.username, avatar: f.avatar || '', since: f.since })),
                incoming: incoming.map((r) => ({ username: r.username, avatar: r.avatar || '', sentAt: r.created_at })),
                outgoing: outgoing.map((r) => ({ username: r.username, sentAt: r.created_at })),
                blocked: blocked.map((b) => b.username),
            };
        },

        /**
         * Ask to be friends. If they already asked, it becomes a friendship.
         * @returns {Promise<'sent' | 'friends'>}
         */
        async request(me, other) {
            if (await store.areFriends(me.id, other.id)) return 'friends';
            if (await store.blocked(other.id, me.id)) return 'sent'; // Dropped, without saying why
            const theyAsked = (await db.query('SELECT 1 FROM friend_requests WHERE from_user = $1 AND to_user = $2', [other.id, me.id])).rows.length > 0;
            if (theyAsked) {
                await store.befriend(me.id, other.id);
                return 'friends';
            }
            await db.query('INSERT INTO friend_requests (from_user, to_user) VALUES ($1, $2) ON CONFLICT DO NOTHING', [me.id, other.id]);
            return 'sent';
        },

        async befriend(a, b) {
            await db.transaction(async (tx) => {
                await tx.query('DELETE FROM friend_requests WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)', [a, b]);
                await tx.query('INSERT INTO friendships (user_a, user_b) VALUES ($1, $2) ON CONFLICT DO NOTHING', pair(a, b));
            });
        },

        /** Decline a request received, or cancel one sent. */
        async dropRequests(a, b) {
            await db.query('DELETE FROM friend_requests WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)', [a, b]);
        },

        async unfriend(a, b) {
            await db.query('DELETE FROM friendships WHERE user_a = $1 AND user_b = $2', pair(a, b));
        },

        /** Block: no more requests or invitations from them; any friendship or request ends. */
        async block(me, other) {
            await db.transaction(async (tx) => {
                await tx.query('INSERT INTO blocks (blocker, blocked) VALUES ($1, $2) ON CONFLICT DO NOTHING', [me, other]);
                await tx.query('DELETE FROM friendships WHERE user_a = $1 AND user_b = $2', pair(me, other));
                await tx.query('DELETE FROM friend_requests WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)', [me, other]);
            });
        },

        async unblock(me, other) {
            await db.query('DELETE FROM blocks WHERE blocker = $1 AND blocked = $2', [me, other]);
        },

        async counts(userId) {
            const { rows } = await db.query(
                `SELECT (SELECT count(*)::int FROM friend_requests WHERE from_user = $1) AS sent,
                        (SELECT count(*)::int FROM friendships WHERE user_a = $1 OR user_b = $1) AS friends`,
                [userId],
            );
            return rows[0];
        },
    };
    return store;
}

/**
 * @param {import('./db').Db} db
 * @param {{ requestsPerWindow?: number, windowMs?: number, onChange?: (userIds: number[]) => void }} [options]
 *   onChange: called with the players whose friends panel changed (live updates, step 4b)
 */
function friendsRouter(db, { requestsPerWindow = 30, windowMs = 60 * 60 * 1000, onChange = () => {} } = {}) {
    const sessions = sessionStore(db);
    const friends = friendStore(db);
    const router = express.Router();
    router.use(express.json({ limit: '1kb' }));
    router.use(sameOrigin);
    router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.use(async (req, res, next) => {
        const user = await sessions.userFor(req.headers.cookie);
        if (!user) return res.status(401).json({ error: 'Sign in first.' });
        res.locals.user = user;
        next();
    });

    /** The other player named in the request, or an answer saying why not. */
    const other = async (req, res, username) => {
        const found = await friends.findUser(username);
        if (!found) { res.status(404).json({ error: 'No player has this username.' }); return null; }
        if (Number(found.id) === Number(res.locals.user.id)) { res.status(400).json({ error: 'That is you.' }); return null; }
        return found;
    };

    router.get('/', async (req, res) => res.json(await friends.list(res.locals.user.id)));

    router.post('/requests', rateLimit({ max: requestsPerWindow, windowMs }), async (req, res) => {
        const me = res.locals.user;
        const them = await other(req, res, (req.body || {}).username);
        if (!them) return;
        if (await friends.blocked(me.id, them.id)) return res.status(400).json({ error: 'You blocked this player: unblock them first.' });
        const { sent, friends: count } = await friends.counts(me.id);
        if (sent >= MAX_PENDING_SENT) return res.status(400).json({ error: 'Too many requests waiting: cancel some first.' });
        if (count >= MAX_FRIENDS) return res.status(400).json({ error: `You have ${MAX_FRIENDS} friends, the most there can be.` });
        const status = await friends.request(me, them);
        onChange([me.id, them.id]);
        res.status(201).json({ status, username: them.username });
    });

    router.post('/requests/:username/accept', async (req, res) => {
        const me = res.locals.user;
        const them = await other(req, res, req.params.username);
        if (!them) return;
        const asked = (await db.query('SELECT 1 FROM friend_requests WHERE from_user = $1 AND to_user = $2', [them.id, me.id])).rows.length > 0;
        if (!asked) return res.status(404).json({ error: 'No request from this player.' });
        await friends.befriend(me.id, them.id);
        onChange([me.id, them.id]);
        res.json({ status: 'friends' });
    });

    router.delete('/requests/:username', async (req, res) => {
        const them = await other(req, res, req.params.username);
        if (!them) return;
        await friends.dropRequests(res.locals.user.id, them.id);
        onChange([res.locals.user.id, them.id]);
        res.json({ ok: true });
    });

    router.delete('/:username', async (req, res) => {
        const them = await other(req, res, req.params.username);
        if (!them) return;
        await friends.unfriend(res.locals.user.id, them.id);
        onChange([res.locals.user.id, them.id]);
        res.json({ ok: true });
    });

    router.post('/blocks', async (req, res) => {
        const them = await other(req, res, (req.body || {}).username);
        if (!them) return;
        await friends.block(res.locals.user.id, them.id);
        onChange([res.locals.user.id, them.id]);
        res.status(201).json({ ok: true });
    });

    router.delete('/blocks/:username', async (req, res) => {
        const them = await other(req, res, req.params.username);
        if (!them) return;
        await friends.unblock(res.locals.user.id, them.id);
        res.json({ ok: true });
    });

    router.use((err, req, res, next) => {
        if (err.type === 'entity.too.large' || err.type === 'entity.parse.failed') {
            return res.status(400).json({ error: 'Bad request.' });
        }
        console.error(`Friends API error on ${req.method} ${req.path}: ${err.message}`);
        res.status(500).json({ error: 'Something went wrong. Try again.' });
    });

    return router;
}

module.exports = { friendsRouter, friendStore };
