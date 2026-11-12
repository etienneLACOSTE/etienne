// @ts-check
// Game results of signed-in players (table game_results): recorded by the game servers
// for online games, sent by the page for games against the bot or on the same screen.

const GAMES = ['chesspell', 'chessdown'];
const MODES = ['online', 'bot', 'local'];
const RESULTS = ['win', 'loss', 'draw'];
/** How each game can end. */
const REASONS = {
    chesspell: ['king', 'time', 'agreement'],
    chessdown: ['king', 'touchdown', 'time', 'repetition', 'agreement'],
};
/** Longest game counted (longer is clamped): a forgotten tab must not add days. */
const MAX_DURATION_S = 4 * 60 * 60;
const OPPONENT_MAX = 30;

const clampDuration = (seconds) => Math.max(0, Math.min(MAX_DURATION_S, Math.round(seconds)));

/** A result as sent by a page: checked field by field. @returns {string | null} what is wrong */
function resultProblem(r) {
    if (!r || typeof r !== 'object') return 'Bad request.';
    if (!GAMES.includes(r.game)) return 'Unknown game.';
    if (r.mode !== 'bot' && r.mode !== 'local') return 'Only games against the bot or on the same screen are sent by the page.';
    if (!RESULTS.includes(r.result)) return 'Unknown result.';
    if (!REASONS[r.game].includes(r.reason)) return 'Unknown reason.';
    if (typeof r.opponent !== 'string' || !r.opponent.trim() || r.opponent.length > OPPONENT_MAX) return 'Unknown opponent.';
    if (!Number.isInteger(r.durationS) || r.durationS < 0) return 'Bad duration.';
    return null;
}

/** @param {import('./db').Db} db */
function statsStore(db) {
    const store = {
        /** @param {{ userId: number, game: string, mode: string, result: string, reason: string, opponent: string, durationS: number }} r */
        async record(r) {
            await db.query(
                `INSERT INTO game_results (user_id, game, mode, result, reason, opponent, duration_s)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [r.userId, r.game, r.mode, r.result, r.reason, r.opponent.trim().slice(0, OPPONENT_MAX), clampDuration(r.durationS)],
            );
        },

        /**
         * An online game is over: one row for each signed-in player, from their side.
         * @param {{ game: string, accounts: Record<number, { id: number } | null>, names: Record<number, string>,
         *   winner: 0 | 1 | 2, reason: string, startedAt: number }} g winner 0: a draw
         */
        async recordOnline({ game, accounts, names, winner, reason, startedAt }) {
            // One account on both sides (two tabs): not a real game, counted for nobody.
            if (accounts[1] && accounts[2] && Number(accounts[1].id) === Number(accounts[2].id)) return;
            const durationS = (Date.now() - startedAt) / 1000;
            for (const player of [1, 2]) {
                const account = accounts[player];
                if (!account) continue;
                const result = winner === 0 ? 'draw' : winner === player ? 'win' : 'loss';
                await store.record({ userId: account.id, game, mode: 'online', result, reason, opponent: names[3 - player] || 'Player', durationS });
            }
        },

        /**
         * Played and won per game, online only: shown to opponents, so only the games the
         * server refereed (bot and same-screen games are declared by the page).
         */
        async totals(userId) {
            const { rows } = await db.query(
                `SELECT game, count(*)::int AS played, count(*) FILTER (WHERE result = 'win')::int AS wins
                 FROM game_results WHERE user_id = $1 AND mode = 'online' GROUP BY game`,
                [userId],
            );
            const totals = Object.fromEntries(GAMES.map((g) => [g, { played: 0, wins: 0 }]));
            for (const r of rows) totals[r.game] = { played: r.played, wins: r.wins };
            return totals;
        },

        /** For the account page: per game and mode, the results and the time played; the last games. */
        async summary(userId, recentCount = 20) {
            const { rows } = await db.query(
                `SELECT game, mode,
                        count(*) FILTER (WHERE result = 'win')::int AS wins,
                        count(*) FILTER (WHERE result = 'loss')::int AS losses,
                        count(*) FILTER (WHERE result = 'draw')::int AS draws,
                        sum(duration_s)::int AS seconds
                 FROM game_results WHERE user_id = $1 GROUP BY game, mode`,
                [userId],
            );
            const games = Object.fromEntries(GAMES.map((g) => [g, {
                seconds: 0,
                modes: Object.fromEntries(MODES.map((m) => [m, { wins: 0, losses: 0, draws: 0 }])),
            }]));
            for (const r of rows) {
                games[r.game].modes[r.mode] = { wins: r.wins, losses: r.losses, draws: r.draws };
                games[r.game].seconds += r.seconds;
            }
            const recent = (await db.query(
                `SELECT game, mode, result, reason, opponent, duration_s, played_at FROM game_results
                 WHERE user_id = $1 ORDER BY played_at DESC, id DESC LIMIT $2`,
                [userId, recentCount],
            )).rows.map((r) => ({
                game: r.game, mode: r.mode, result: r.result, reason: r.reason,
                opponent: r.opponent, durationS: r.duration_s, playedAt: r.played_at,
            }));
            return { games, recent };
        },

        /** Every result, for the data download. */
        async all(userId) {
            return (await db.query(
                `SELECT game, mode, result, reason, opponent, duration_s AS "durationS", played_at AS "playedAt"
                 FROM game_results WHERE user_id = $1 ORDER BY played_at`,
                [userId],
            )).rows;
        },
    };
    return store;
}

module.exports = { statsStore, resultProblem, MAX_DURATION_S, REASONS };
