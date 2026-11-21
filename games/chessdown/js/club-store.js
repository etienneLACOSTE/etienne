// @ts-check
// The player's club (All Star), kept in this browser (local storage) and, for a signed-in
// player, with the account too (cloud-save.js); checked by club-rules.js every time it is read.

import { cloudChanged } from './cloud-save.js';

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
    cloudChanged('club', club); // Also kept with the account, when signed in
    try {
        localStorage.setItem(KEY, JSON.stringify(club));
        return true;
    } catch {
        return false;
    }
}

/** Forget the club (start again). */
export function deleteClub() {
    cloudChanged('club', null);
    try { localStorage.removeItem(KEY); } catch { /* Nothing kept anyway */ }
}
