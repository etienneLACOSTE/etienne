// @ts-check
// Coming back to an online game after reloading the page (or leaving it and coming back
// quickly in the same tab). The server gives each player a seat token
// (server/socket-utils.js seatKeeper); the page keeps it in sessionStorage, for this tab
// only, and sends it back when it opens: the server gives the seat back while it is still
// held (30 s), with the whole game ('seatResumed').
// The token is not a tracker: random, for one game, forgotten when the tab closes.

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

/** The page leaves its room on purpose (or the room is gone): nothing to come back to. */
export function forgetSeat(game) {
    write(game, null);
}

/**
 * Keep this page's seat, and ask for it back when the page opens.
 * @param {any} socket the game's Socket.io connection
 * @param {string} game 'chessdown' or 'chesspell'
 * @param {{ onFailed: (reason: 'gone' | 'busy' | 'over') => void }} handlers onFailed:
 *   a seat was asked for and could not be given back
 */
export function keepSeat(socket, game, { onFailed }) {
    socket.on('seatToken', (/** @type {any} */ data) => {
        if (data && typeof data.roomCode === 'string' && typeof data.token === 'string') {
            write(game, { roomCode: data.roomCode, token: data.token });
        }
    });
    for (const event of ['opponentLeft', 'roomClosed', 'seatLost']) socket.on(event, () => forgetSeat(game));
    // When the page goes away, note when: a seat left long ago is not asked for.
    window.addEventListener('pagehide', () => {
        const seat = read(game);
        if (seat) write(game, { ...seat, leftAt: Date.now() });
    });

    const seat = read(game);
    if (!seat) return;
    if (seat.leftAt && Date.now() - seat.leftAt > STALE_MS) return forgetSeat(game);
    let tries = 0;
    const ask = () => socket.emit('resumeSeat', { roomCode: seat.roomCode, token: seat.token });
    socket.on('resumeFailed', (/** @type {any} */ data) => {
        const reason = data && data.reason;
        if (reason === 'busy' && ++tries < RETRIES) return void setTimeout(ask, RETRY_MS);
        forgetSeat(game);
        onFailed(reason === 'busy' || reason === 'over' ? reason : 'gone');
    });
    if (socket.connected) ask();
    else socket.once('connect', ask);
}

/** What the page says when its game could not be taken back. */
export const RESUME_FAILED = {
    gone: 'Your game could not be resumed.',
    busy: 'Your game is open in another tab.',
    over: 'Your game ended while you were away.',
};
