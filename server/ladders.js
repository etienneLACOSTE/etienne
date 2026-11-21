// @ts-check
// Chessdown ladders (docs/games/chessdown-ladders.md): a rating per account, mode
// ('classic' or 'allstar') and monthly season, changed by each ranked best of 3 (Elo).
// A new season starts each month (UTC): a rating carries over halfway back to the start.
// Tables ladder_ratings and ladder_series (migration 009); users.ladder_hidden keeps a
// player's name off the public board.

const express = require('express');
const { sessionStore } = require('./accounts/sessions');

const MODES = ['classic', 'allstar'];
const START = 1000;
const K = 32;
const K_NEW = 48; // Faster at first: a new player's rating finds its place sooner
const NEW_SERIES = 10;
/** Ranked series counted a day between the same two players (more are played, not counted). */
const PAIR_LIMIT = 3;
const BOARD_SIZE = 50;

const pad = (n) => String(n).padStart(2, '0');

/** The season of a date: its month, in UTC ('2026-11'). */
function seasonOf(date = new Date()) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

/** The season before ('2026-01' -> '2025-12'). */
function previousSeason(season) {
    const [y, m] = season.split('-').map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

/** Whole days left in the season of `date`, today included (1 on its last day). */
function daysLeft(date = new Date()) {
    const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
    return Math.max(1, Math.ceil((end - date.getTime()) / 86_400_000));
}

/** A rating at the start of the next season: halfway back to the start. */
const carryOver = (rating) => Math.round((rating + START) / 2);

/** The chance that a player rated `a` beats one rated `b`. */
const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));

/**
 * The two ratings after a series. `score`: player a's result (1 won, 0.5 drawn, 0 lost).
 * Each side moves by its own K (higher during its first series).
 * @param {{ rating: number, series: number }} a @param {{ rating: number, series: number }} b
 * @returns {[number, number]}
 */
function newRatings(a, b, score) {
    const ea = expected(a.rating, b.rating);
    const k = (p) => (p.series < NEW_SERIES ? K_NEW : K);
    return [Math.round(a.rating + k(a) * (score - ea)), Math.round(b.rating + k(b) * ((1 - score) - (1 - ea)))];
}

const isMode = (mode) => MODES.includes(mode);

/** @param {import('./db').Db} db */
function ladderStore(db) {
    /**
     * A player's line in a season: the row, or a fresh one (carried over from the season
     * before, else the start). `lock`: in a transaction, the row is locked until it ends.
     * @param {import('./db').Queryable} q
     */
    async function lineOf(q, userId, mode, season, lock = false) {
        const { rows } = await q.query(
            `SELECT rating, series, wins, losses, draws FROM ladder_ratings
             WHERE user_id = $1 AND mode = $2 AND season = $3${lock ? ' FOR UPDATE' : ''}`,
            [userId, mode, season],
        );
        if (rows[0]) return { ...rows[0], fresh: false };
        const before = (await q.query(
            'SELECT rating FROM ladder_ratings WHERE user_id = $1 AND mode = $2 AND season = $3',
            [userId, mode, previousSeason(season)],
        )).rows[0];
        return { rating: before ? carryOver(before.rating) : START, series: 0, wins: 0, losses: 0, draws: 0, fresh: true };
    }

    const store = {
        /** A player's rating now (what the matchmaking compares). */
        async ratingOf(userId, mode, date = new Date()) {
            return (await lineOf(db, userId, mode, seasonOf(date))).rating;
        },

        /**
         * A ranked series is over. players: account ids of seats 1 and 2; winner 1, 2, or 0
         * (drawn). Not counted between one account and itself, nor beyond PAIR_LIMIT series a
         * day between the same two players (the series is logged, the ratings stay).
         * @param {{ mode: string, players: { 1: number, 2: number }, winner: number, date?: Date }} s
         * @returns {Promise<null | { counted: boolean, season: string,
         *   1: { before: number, after: number }, 2: { before: number, after: number } }>}
         */
        async recordSeries({ mode, players, winner, date = new Date() }) {
            const p1 = Number(players[1]);
            const p2 = Number(players[2]);
            if (!isMode(mode) || p1 === p2 || ![0, 1, 2].includes(winner)) return null;
            const season = seasonOf(date);
            return db.transaction(async (tx) => {
                const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
                const today = (await tx.query(
                    `SELECT count(*)::int AS n FROM ladder_series
                     WHERE least(player1, player2) = $1 AND greatest(player1, player2) = $2 AND counted AND played_at >= $3`,
                    [Math.min(p1, p2), Math.max(p1, p2), dayStart],
                )).rows[0].n;
                const counted = today < PAIR_LIMIT;
                const a = await lineOf(tx, p1, mode, season, true);
                const b = await lineOf(tx, p2, mode, season, true);
                const [ra, rb] = counted ? newRatings(a, b, winner === 1 ? 1 : winner === 0 ? 0.5 : 0) : [a.rating, b.rating];
                if (counted) {
                    const resultOf = (seat) => (winner === 0 ? 'draw' : winner === seat ? 'win' : 'loss');
                    for (const [id, rating, result] of [[p1, ra, resultOf(1)], [p2, rb, resultOf(2)]]) {
                        await tx.query(
                            `INSERT INTO ladder_ratings (user_id, mode, season, rating, series, wins, losses, draws)
                             VALUES ($1, $2, $3, $4, 1, $5, $6, $7)
                             ON CONFLICT (user_id, mode, season) DO UPDATE SET rating = EXCLUDED.rating,
                                series = ladder_ratings.series + 1, wins = ladder_ratings.wins + EXCLUDED.wins,
                                losses = ladder_ratings.losses + EXCLUDED.losses, draws = ladder_ratings.draws + EXCLUDED.draws,
                                updated_at = now()`,
                            [id, mode, season, rating, Number(result === 'win'), Number(result === 'loss'), Number(result === 'draw')],
                        );
                    }
                }
                await tx.query(
                    'INSERT INTO ladder_series (mode, season, player1, player2, winner, counted, played_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [mode, season, p1, p2, winner, counted, date],
                );
                return { counted, season, 1: { before: a.rating, after: ra }, 2: { before: b.rating, after: rb } };
            });
        },

        /**
         * The board of a mode for a signed-in viewer: the top of the season (hidden players
         * left out), the viewer's own line and rank, the days left, the podium of the season before.
         */
        async board(mode, viewerId, date = new Date()) {
            const season = seasonOf(date);
            const top = (await db.query(
                `SELECT u.username, l.rating, l.wins, l.losses, l.draws FROM ladder_ratings l JOIN users u ON u.id = l.user_id
                 WHERE l.mode = $1 AND l.season = $2 AND NOT u.ladder_hidden
                 ORDER BY l.rating DESC, l.updated_at ASC, u.id ASC LIMIT $3`,
                [mode, season, BOARD_SIZE],
            )).rows.map((r, i) => ({ rank: i + 1, username: r.username, rating: r.rating, wins: r.wins, losses: r.losses, draws: r.draws }));
            const mine = await lineOf(db, viewerId, mode, season);
            const hidden = await store.isHidden(viewerId);
            let rank = null;
            if (!mine.fresh) {
                rank = 1 + (await db.query(
                    `SELECT count(*)::int AS n FROM ladder_ratings l JOIN users u ON u.id = l.user_id
                     WHERE l.mode = $1 AND l.season = $2 AND NOT u.ladder_hidden AND l.user_id <> $3 AND l.rating > $4`,
                    [mode, season, viewerId, mine.rating],
                )).rows[0].n;
            }
            const podium = (await db.query(
                `SELECT u.username, l.rating FROM ladder_ratings l JOIN users u ON u.id = l.user_id
                 WHERE l.mode = $1 AND l.season = $2 AND NOT u.ladder_hidden
                 ORDER BY l.rating DESC, l.updated_at ASC, u.id ASC LIMIT 3`,
                [mode, previousSeason(season)],
            )).rows.map((r) => ({ username: r.username, rating: r.rating }));
            return {
                mode, season, daysLeft: daysLeft(date), top, podium, previousSeason: previousSeason(season),
                me: { rating: mine.rating, series: mine.series, wins: mine.wins, losses: mine.losses, draws: mine.draws, rank, hidden },
            };
        },

        async isHidden(userId) {
            const { rows } = await db.query('SELECT ladder_hidden FROM users WHERE id = $1', [userId]);
            return Boolean(rows[0] && rows[0].ladder_hidden);
        },

        async setHidden(userId, hidden) {
            await db.query('UPDATE users SET ladder_hidden = $1 WHERE id = $2', [hidden, userId]);
        },

        /** Every season's line and series of a player, for the data download. */
        async all(userId) {
            const ratings = (await db.query(
                `SELECT mode, season, rating, series, wins, losses, draws FROM ladder_ratings
                 WHERE user_id = $1 ORDER BY season, mode`,
                [userId],
            )).rows;
            const series = (await db.query(
                `SELECT s.mode, s.season, s.played_at AS "playedAt", s.counted,
                        CASE WHEN s.winner = 0 THEN 'draw'
                             WHEN (s.winner = 1 AND s.player1 = $1) OR (s.winner = 2 AND s.player2 = $1) THEN 'win'
                             ELSE 'loss' END AS result,
                        u.username AS opponent
                 FROM ladder_series s JOIN users u ON u.id = CASE WHEN s.player1 = $1 THEN s.player2 ELSE s.player1 END
                 WHERE s.player1 = $1 OR s.player2 = $1 ORDER BY s.played_at, s.id`,
                [userId],
            )).rows;
            return { ratings, series };
        },
    };
    return store;
}

/**
 * GET /api/ladders/:mode: the board of a ladder, for signed-in players only (names are
 * shown to other players, never to the public web).
 * @param {import('./db').Db} db
 */
function ladderRouter(db) {
    const sessions = sessionStore(db);
    const ladders = ladderStore(db);
    const router = express.Router();
    router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
    router.get('/:mode', async (req, res) => {
        const user = await sessions.userFor(req.headers.cookie);
        if (!user) return res.status(401).json({ error: 'Sign in first.' });
        if (!isMode(req.params.mode)) return res.status(404).json({ error: 'Not found.' });
        res.json(await ladders.board(req.params.mode, user.id));
    });
    router.use((err, req, res, next) => {
        console.error(`Ladder API error on ${req.path}: ${err.message}`);
        res.status(500).json({ error: 'Something went wrong. Try again.' });
    });
    return router;
}

module.exports = {
    ladderStore, ladderRouter, seasonOf, previousSeason, daysLeft, carryOver, expected, newRatings, isMode,
    MODES, START, K, K_NEW, NEW_SERIES, PAIR_LIMIT, BOARD_SIZE,
};
