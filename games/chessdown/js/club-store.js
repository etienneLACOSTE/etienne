// @ts-check
// The player's club (All Star), kept in this browser (local storage) for now; checked by
// club-rules.js every time it is read. Accounts will keep it on the server later
// (docs/games/chessdown.md, step 5).

const Club = globalThis.ChessdownClub;
const KEY = 'pawnet.chessdown.club';

/** The club of this browser, or null (none yet, or one that cannot be read). */
export function loadClub() {
    try {
        return Club.sanitizeClub(JSON.parse(localStorage.getItem(KEY) || 'null'));
    } catch {
        return null;
    }
}

/** Keep the club; false when the browser does not keep it (private window, storage full). */
export function saveClub(club) {
    try {
        localStorage.setItem(KEY, JSON.stringify(club));
        return true;
    } catch {
        return false;
    }
}

/** Forget the club (start again). */
export function deleteClub() {
    try { localStorage.removeItem(KEY); } catch { /* Nothing kept anyway */ }
}
