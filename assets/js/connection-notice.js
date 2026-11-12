// @ts-check
// Online games: what happens when a connection drops in the middle of a game. The server
// keeps the seat for a while (server/socket-utils.js seatKeeper) and Socket.io brings the
// connection back with the messages it missed. Meanwhile, a notice says what is going on:
// - our own connection: "Connection lost. Reconnecting…";
// - the opponent's: "Your opponent lost their connection. Waiting for them: 30 s".
// The notice is a status region: read once by screen readers (the countdown is not).

/** @type {HTMLElement | null} */
let box = null;
let countdown = 0;

/** Show `text`, with a countdown from `seconds` when given. Replaces the current notice. */
function show(text, seconds = 0) {
    hide();
    const notice = document.createElement('div');
    notice.className = 'connection-notice';
    notice.setAttribute('role', 'status');
    document.body.append(notice);
    box = notice;
    // Filled once the region exists, so screen readers announce it.
    requestAnimationFrame(() => {
        if (box !== notice) return;
        const message = Object.assign(document.createElement('span'), { textContent: text });
        notice.append(message);
        if (!seconds) return;
        const left = Object.assign(document.createElement('span'), { className: 'connection-countdown' });
        left.setAttribute('aria-hidden', 'true');
        notice.append(' ', left);
        let remaining = seconds;
        const paint = () => { left.textContent = `${remaining} s`; };
        paint();
        countdown = window.setInterval(() => {
            remaining = Math.max(0, remaining - 1);
            paint();
        }, 1000);
    });
}

function hide() {
    clearInterval(countdown);
    box?.remove();
    box = null;
}

/**
 * Watch the game connection of this page.
 * @param {any} socket the game's Socket.io connection
 * @param {{ inRoom: () => boolean, onLost: () => void }} game inRoom: the page is in an
 *   online room; onLost: the seat could not be kept (the room is gone for this player)
 */
export function watchConnection(socket, { inRoom, onLost }) {
    let droppedInRoom = false;
    socket.on('disconnect', (/** @type {string} */ reason) => {
        if (reason === 'io client disconnect' || !inRoom()) return;
        droppedInRoom = true;
        show('Connection lost. Reconnecting…');
    });
    socket.on('connect', () => {
        if (!droppedInRoom) return;
        droppedInRoom = false;
        hide();
        // A new connection instead of the old one: the server no longer knows this page.
        if (!socket.recovered && inRoom()) lost();
    });
    socket.on('opponentDisconnected', (/** @type {{ seconds?: number }} */ data) => {
        const seconds = Number(data && data.seconds);
        show('Your opponent lost their connection. Waiting for them:', Number.isInteger(seconds) && seconds > 0 ? seconds : 0);
    });
    socket.on('opponentReconnected', () => {
        show('Your opponent is back.');
        const shown = box;
        setTimeout(() => { if (box === shown) hide(); }, 3000);
    });
    socket.on('opponentLeft', hide);
    socket.on('roomClosed', hide);
    socket.on('seatLost', () => { if (inRoom()) lost(); });

    function lost() {
        hide();
        onLost();
    }
}
