// @ts-check
// Online with friends: the invite list of the waiting room, and joining a room from an
// invitation (the invitation banner, or a /chesspell/?join=CODE link).
import { session } from './state.js';
import { showInviteList, startPresence } from '../../../assets/js/presence.js';

let redraw = () => {};

/**
 * Signed in: connect to presence; `join` joins a Ches'spell room in place.
 * @param {(roomCode: string) => void} join
 */
export function setupInvites(join) {
    startPresence({
        page: 'chesspell',
        onJoin: (game, roomCode) => (game === 'chesspell' ? join(roomCode) : location.assign(`/${game}/?join=${roomCode}`)),
    });
    redraw = showInviteList(document.getElementById('invite-friends'), 'chesspell', () => session.currentRoomCode) || redraw;
}

/** The room was just created: the invite list can show. */
export function refreshInvites() {
    redraw();
}
