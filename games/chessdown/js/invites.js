// @ts-check
// Online with friends: the invite list of the waiting room, and joining a room from an
// invitation (the invitation banner, or a /chessdown/?join=CODE link).
import { state } from './state.js';
import { showInviteList, startPresence } from '../../../assets/js/presence.js';

let redraw = () => {};

/** Join a room as if its code was typed and "Join Room" pressed. */
export function joinFromInvite(roomCode) {
    /** @type {HTMLInputElement} */ (document.getElementById('room-code-input')).value = roomCode;
    document.getElementById('btn-join-room').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

/** Signed in: connect to presence; an invitation to Chessdown joins in place. */
export function setupInvites() {
    startPresence({
        page: 'chessdown',
        onJoin: (game, roomCode) => (game === 'chessdown' && state.gameState !== 'gameplay' ? joinFromInvite(roomCode) : location.assign(`/${game}/?join=${roomCode}`)),
    });
    redraw = showInviteList(document.getElementById('invite-friends'), 'chessdown', () => state.currentRoomCode) || redraw;
}

/** The room was just created: the invite list can show. */
export function refreshInvites() {
    redraw();
}

