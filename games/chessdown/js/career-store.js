// @ts-check
// The career (docs/games/chessdown-career.md), kept in this browser (local storage) like the
// club; checked by career-rules.js every time it is read.

import { cloudChanged } from './cloud-save.js';

const Career = globalThis.ChessdownCareer;
const KEY = 'pawnet.chessdown.career';

/** The career of this browser, or null (none yet, or one that cannot be read). */
export function loadCareer() {
    try {
        return Career.sanitizeCareer(JSON.parse(localStorage.getItem(KEY) || 'null'));
    } catch {
        return null;
    }
}

/** Keep the career; false when the browser does not keep it (private window, storage full). */
export function saveCareer(career) {
    cloudChanged('career', career); // Also kept with the account, when signed in
    try {
        localStorage.setItem(KEY, JSON.stringify(career));
        return true;
    } catch {
        return false;
    }
}

/** Forget the career (a new club starts a new one). */
export function deleteCareer() {
    cloudChanged('career', null);
    try { localStorage.removeItem(KEY); } catch { /* Nothing kept anyway */ }
}

/** A new career, from a random seed. */
export function newCareer() {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0];
    return Career.newCareer(seed);
}
