// @ts-check
// Coming back to an online game after reloading the page (or leaving it and coming back
// quickly in the same tab). The server gives each player a seat token
// (server/socket-utils.js seatKeeper); the page keeps it in sessionStorage, for this tab
// only, and sends it back when it opens: the server gives the seat back while it is still
// held (30 s), with the whole game ('seatResumed').
// The token is not a tracker: random, for one game, forgotten when the tab closes.
import { t } from './i18n.js';

/** A seat left longer ago than this is not worth asking for (the server holds 30 s). */
const STALE_MS = 60_000;
const RETRIES = 3; // 'busy': the server has not seen the old page close yet
const RETRY_MS = 1_000;

const key = (/** @type {string} */ game) => `pawnet.seat.${game}`;

/** @returns {{ roomCode: string, token: string, leftAt?: number } | null} */
function read(game) {
    try {
        const seat = JSON.parse(sessionStorage.getItem(key(game)) || 'null');
        return seat && typeof seat.roomCode === 'string' && typeof seat.token === 'string' ? seat : null;
    } catch { return null; }
}

function write(game, seat) {
    try {
        if (seat) sessionStorage.setItem(key(game), JSON.stringify(seat));
        else sessionStorage.removeItem(key(game));
    } catch { /* Not kept: a reload cannot come back */ }
}

/** What to call to stop waiting for an answer, per game (see keepSeat). */
const cancels = new Map();

/**
 * The page leaves its room on purpose, its game is over, or the room is gone: nothing to
 * come back to. An answer still on its way for an older seat is dropped.
 */
export function forgetSeat(game) {
    write(game, null);
    cancels.get(game)?.();
}

/**
 * Keep this page's seat, and ask for it back when the page opens. Only one answer is
 * waited for, and only while the page has not moved on: a new room, a game against the bot
 * or leaving drop it, and a seat given back too late is left at once.
 * @param {any} socket the game's Socket.io connection
 * @param {string} game 'chessdown' or 'chesspell'
 * @param {{
 *   idle: () => boolean,
 *   onResumed: (data: any) => void,
 *   onFailed: (reason: 'gone' | 'busy' | 'over') => void,
 * }} handlers idle: the page is still on its menu (nothing started since it opened);
 *   onResumed: show the game the server sent back ('seatResumed'); onFailed: a seat was
 *   asked for and could not be given back
 */
export function keepSeat(socket, game, { idle, onResumed, onFailed }) {
    /** @type {{ roomCode: string, token: string } | null} The seat asked for, until answered. */
    let pending = null;
    let tries = 0;
    let retry = 0;
    const stop = () => {
        pending = null;
        clearTimeout(retry);
    };
    cancels.set(game, stop);

    socket.on('seatToken', (/** @type {any} */ data) => {
        if (!data || typeof data.roomCode !== 'string' || typeof data.token !== 'string') return;
        if (pending && pending.roomCode !== data.roomCode) stop(); // The page is in another room now
        write(game, { roomCode: data.roomCode, token: data.token });
    });
    for (const event of ['opponentLeft', 'roomClosed', 'seatLost']) socket.on(event, () => forgetSeat(game));
    // When the page goes away, note when: a seat left long ago is not asked for.
    window.addEventListener('pagehide', () => {
        const seat = read(game);
        if (seat) write(game, { ...seat, leftAt: Date.now() });
    });

    socket.on('seatResumed', (/** @type {any} */ data) => {
        const roomCode = data && (data.roomCode || data.id);
        if (!pending || !idle()) {
            // Too late: the page has moved on. The seat was given back on the server: leave it.
            stop();
            if (typeof roomCode === 'string') socket.emit('leaveRoom', { roomCode });
            return;
        }
        stop();
        onResumed(data);
    });
    socket.on('resumeFailed', (/** @type {any} */ data) => {
        if (!pending) return;
        const reason = data && data.reason;
        if (reason === 'busy' && ++tries < RETRIES) {
            retry = window.setTimeout(ask, RETRY_MS);
            return;
        }
        const asked = pending;
        stop();
        const seat = read(game);
        if (seat && seat.token === asked.token) write(game, null); // Not a newer seat
        if (reason === 'elsewhere') return; // The page is already in another game
        onFailed(reason === 'busy' || reason === 'over' ? reason : 'gone');
    });

    const seat = read(game);
    if (!seat) return;
    if (seat.leftAt && Date.now() - seat.leftAt > STALE_MS) return void write(game, null);
    pending = { roomCode: seat.roomCode, token: seat.token };
    function ask() {
        if (pending) socket.emit('resumeSeat', pending);
    }
    if (socket.connected) ask();
    else socket.once('connect', ask);
}

/**
 * What the page says when its game could not be taken back.
 * @param {'gone' | 'busy' | 'over'} reason
 */
export function resumeFailedText(reason) {
    return t(`seat.${reason}`);
}
