// @ts-check
// The club and the career follow a signed-in player from one browser to another: kept with
// the account (/api/account/chessdown, checked by the server) as well as in this browser.
// club-store.js and career-store.js tell this module each change; main.js starts it once
// the player is known to be signed in. Without an account, nothing leaves the browser.
// On sign-in, the account's club wins over this browser's; a browser with a club and an
// account without one sends it.

/** What the account should hold: the last club and career saved here. */
const latest = { club: /** @type {any} */ (undefined), career: /** @type {any} */ (undefined) };
/** Writes the account's club and career into this browser (main.js), once signed in. */
let writeLocal = /** @type {((club: any, career: any) => void) | null} */ (null);
let started = false;
let applying = false;
let changedBeforeStart = false;
let timer = 0;

/** Send what is kept here to the account (keepalive: also while the page closes). */
function push() {
    clearTimeout(timer);
    timer = 0;
    if (!started || latest.club === undefined) return;
    fetch('/api/account/chessdown', {
        method: 'PUT',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ club: latest.club, career: latest.club ? latest.career || null : null }),
    }).catch(() => { /* Offline: the next change sends everything again */ });
}

/**
 * The club or the career changed in this browser (null: deleted). Sent to the account a
 * moment later, once the changes of one action are all in.
 * @param {'club' | 'career'} what
 */
export function cloudChanged(what, value) {
    if (applying) return;
    latest[what] = value;
    if (!started) { changedBeforeStart = true; return; }
    clearTimeout(timer);
    timer = window.setTimeout(push, 800);
}

/**
 * The player is signed in: take the account's club and career, or send this browser's.
 * @param {{ club: any, career: any }} local what this browser keeps
 * @param {(club: any, career: any) => void} write keeps the account's in this browser
 * @returns {Promise<'pulled' | 'pushed' | null>}
 */
export async function startCloudSave(local, write) {
    writeLocal = write;
    let kept;
    try {
        const res = await fetch('/api/account/chessdown', { credentials: 'same-origin' });
        if (!res.ok) return null;
        kept = await res.json();
    } catch {
        return null; // Offline: this browser's club is used, the account is untouched
    }
    started = true;
    addEventListener('pagehide', () => { if (timer) push(); });
    if (latest.club === undefined) latest.club = local.club;
    if (latest.career === undefined) latest.career = local.career;
    if (kept.club && !changedBeforeStart) {
        latest.club = kept.club;
        latest.career = kept.career;
        applying = true;
        try { writeLocal(kept.club, kept.career); } finally { applying = false; }
        return 'pulled';
    }
    if (latest.club) {
        push();
        return 'pushed';
    }
    return null;
}

/** Whether the club is kept with an account (the club page says so). */
export const cloudSaving = () => started;
