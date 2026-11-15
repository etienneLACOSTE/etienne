// @ts-check
// Reported chat messages (table chat_reports): saved when a player reports a message of
// their opponent (server/chat.js), deleted after KEEP_DAYS. Nothing reads them on the
// site yet: they are there for moderation, by hand, in the database.

const KEEP_DAYS = 90;

/** @param {import('./db').Db} db */
function reportStore(db) {
    return {
        /** @param {{ reporterId: number, reportedId: number, reportedName: string, game: string, message: string }} r */
        async save(r) {
            await db.query(
                `INSERT INTO chat_reports (reporter_id, reported_id, reported_name, game, message)
                 VALUES ($1, $2, $3, $4, $5)`,
                [r.reporterId, r.reportedId, r.reportedName, r.game, r.message],
            );
        },
        /** Reports older than KEEP_DAYS are deleted. */
        async deleteOld() {
            await db.query(`DELETE FROM chat_reports WHERE created_at < now() - make_interval(days => $1)`, [KEEP_DAYS]);
        },
        /**
         * For the account's data export: the reports it made (who, when), and the messages
         * of its own that were reported (when, never by whom).
         * @param {number} userId
         */
        async about(userId) {
            const made = (await db.query(
                `SELECT reported_name, game, created_at FROM chat_reports WHERE reporter_id = $1 ORDER BY created_at`, [userId],
            )).rows.map((r) => ({ reported: r.reported_name, game: r.game, reportedAt: r.created_at }));
            const received = (await db.query(
                `SELECT game, message, created_at FROM chat_reports WHERE reported_id = $1 ORDER BY created_at`, [userId],
            )).rows.map((r) => ({ game: r.game, message: r.message, reportedAt: r.created_at }));
            return { made, received };
        },
    };
}

module.exports = { reportStore, KEEP_DAYS };
