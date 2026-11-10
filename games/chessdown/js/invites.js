// @ts-check
// Online with friends: the invite list of the waiting room, and joining a room from an
// invitation (the invitation banner, or a /chessdown/?join=CODE link).
import { state } from './state.js';
import { showInviteList, startPresence } from '../../../assets/js/presence.js';

let redraw = () => {};

/** A draft or a game is on screen (gameState keeps its last value once back at the menu). */
const playing = () => (state.gameState === 'gameplay' || state.gameState.startsWith('draft'))
    && document.getElementById('main-menu').classList.contains('hidden');

/**
 * Join a room as if its code was typed and "Join Room" pressed. The room or game this
 * page is in is left first, as with "Main menu" (a game in progress counts as left).
 */
export function joinFromInvite(roomCode) {
    if (state.currentRoomCode || playing()) {
        document.getElementById('btn-main-menu').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    }
    /** @type {HTMLInputElement} */ (document.getElementById('room-code-input')).value = roomCode;
    document.getElementById('btn-join-room').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

/** Signed in: connect to presence; an invitation to Chessdown joins in place. */
export function setupInvites() {
    startPresence({
        page: 'chessdown',
        onJoin: (game, roomCode) => (game === 'chessdown' ? joinFromInvite(roomCode) : location.assign(`/${game}/?join=${roomCode}`)),
        busy: playing,
    });
    redraw = showInviteList(document.getElementById('invite-friends'), 'chessdown', () => state.currentRoomCode) || redraw;
}

/** The room was just created: the invite list can show. */
export function refreshInvites() {
    redraw();
}

