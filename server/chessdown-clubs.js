// @ts-check
// A signed-in player's Chessdown club and career, kept with the account (table
// chessdown_clubs, migration 008). Checked by the shared rules before they are written;
// online All Star games read the club from here, never from what a page sends.

const Club = require('../games/chessdown/club-rules.js');
const Career = require('../games/chessdown/career-rules.js');

/**
 * Whether a stored club may play an online All Star game: each player's level matches the
 * experience it has (the rules never give a level without it). A club edited by hand to
 * give level 5 to rookies is refused; one whose experience was edited too is not caught
 * (docs/known-limits.md): the equal budget keeps such a club from fielding more.
 * @returns {boolean}
 */
function plausibleClub(club) {
    return club.players.every((p) => {
        if (p.type === 'k') return true;
        // Experience can drop after a game (captured: -3), the level never does.
        const low = Club.levelForXp(p.xp);
        const high = Club.levelForXp(p.xp + 3 * p.stats.games);
        return p.level >= low && p.level <= high;
    });
}

/** @param {import('./db').Db} db */
function clubStore(db) {
    return {
        /** The account's club and career, as stored (each null when none). */
        async get(userId) {
            const { rows } = await db.query('SELECT club, career, updated_at FROM chessdown_clubs WHERE user_id = $1', [userId]);
            if (!rows[0]) return { club: null, career: null, savedAt: null };
            return { club: Club.sanitizeClub(rows[0].club), career: rows[0].career ? Career.sanitizeCareer(rows[0].career) : null, savedAt: rows[0].updated_at };
        },

        /**
         * Keep a club and its career (null: none). A club that fails the checks is refused
         * (null returned); a career that fails them is dropped. No club: both are deleted.
         * @returns {Promise<{ club: any, career: any } | null>}
         */
        async put(userId, club, career) {
            if (club === null) {
                await db.query('DELETE FROM chessdown_clubs WHERE user_id = $1', [userId]);
                return { club: null, career: null };
            }
            const cleanClub = Club.sanitizeClub(club);
            if (!cleanClub) return null;
            const cleanCareer = career ? Career.sanitizeCareer(career) : null;
            await db.query(
                `INSERT INTO chessdown_clubs (user_id, club, career) VALUES ($1, $2::jsonb, $3::jsonb)
                 ON CONFLICT (user_id) DO UPDATE SET club = EXCLUDED.club, career = EXCLUDED.career, updated_at = now()`,
                [userId, JSON.stringify(cleanClub), cleanCareer ? JSON.stringify(cleanCareer) : null],
            );
            return { club: cleanClub, career: cleanCareer };
        },
    };
}

module.exports = { clubStore, plausibleClub };
