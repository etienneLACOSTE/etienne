// @ts-check
// Presence and invitations, for every page of a signed-in player (server/presence.js).
// Needs the Socket.io client (/socket.io/socket.io.js) on the page.
// - startPresence(): connects, keeps the list of friends online, shows invitations.
// - showInviteList(): in a game's waiting room, buttons to invite a friend who is online.

const GAME_NAMES = { chesspell: "Ches'spell", chessdown: 'Chessdown' };

/** @typedef {{ username: string, where: 'site' | 'chesspell' | 'chessdown' }} OnlineFriend */

/** @type {any} */
let socket = null;
/** @type {Map<string, OnlineFriend>} */
const onlineFriends = new Map();
/** @type {Set<(friends: OnlineFriend[]) => void>} */
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn([...onlineFriends.values()]));

/** Where a friend is, in words. */
export const whereText = (where) => (GAME_NAMES[where] ? `playing ${GAME_NAMES[where]}` : 'on the site');

/** Call `fn` now and whenever the friends online change. */
export function onFriendsOnline(fn) {
    listeners.add(fn);
    fn([...onlineFriends.values()]);
}

/** How long an invitation waits for the server's answer. */
const ANSWER_TIMEOUT_MS = 10_000;

/**
 * Connect this page (signed-in players only).
 * @param {{ page: 'site' | 'chesspell' | 'chessdown', onJoin?: (game: string, roomCode: string) => void,
 *   busy?: () => boolean }} options
 *   onJoin: how this page joins a room it is invited to (a game page joins in place;
 *   otherwise the player is taken to the game). busy: whether a game is being played
 *   on this page: an invitation then shows without taking the keyboard focus.
 */
export function startPresence({ page, onJoin, busy = () => false }) {
    const io = /** @type {any} */ (globalThis).io;
    if (socket) {
        if (!socket.connected) socket.connect(); // Signed in again on this page
        return;
    }
    if (typeof io !== 'function') return;
    socket = io('/presence', { auth: { page } }); // auth, not query: the game's connection is shared
    // Closed by the server when this account signs out (here or on another device).
    socket.on('disconnect', (reason) => {
        if (reason !== 'io server disconnect') return; // Network trouble: reconnects by itself
        onlineFriends.clear();
        notify();
    });
    socket.on('friendsOnline', (list) => {
        onlineFriends.clear();
        for (const f of list) onlineFriends.set(f.username, f);
        notify();
    });
    socket.on('friendPresence', ({ username, where }) => {
        if (where) onlineFriends.set(username, { username, where });
        else onlineFriends.delete(username);
        notify();
    });
    socket.on('invited', ({ from, game, roomCode }) => showInvitation(from, game, roomCode, onJoin, busy()));
}

/**
 * Invite a friend into the room this player just created. Resolves to the server's
 * answer to this invitation, or to an error if none comes in time.
 */
export function inviteFriend(username, game, roomCode) {
    return new Promise((resolve) => {
        if (!socket) return resolve({ ok: false, error: 'Sign in to invite friends.' });
        socket.timeout(ANSWER_TIMEOUT_MS).emit('invite', { username, game, roomCode }, (err, answer) => {
            resolve(err || !answer ? { ok: false, error: 'No answer from the server. Try again.' } : answer);
        });
    });
}

/**
 * "Alice invites you to play Ches'spell. [Join] [Not now]", until answered. Escape is
 * "Not now". During a game, it does not take the keyboard focus (the text is announced).
 */
function showInvitation(from, game, roomCode, onJoin, playing) {
    if (!/^[A-Z]{6}$/.test(roomCode) || !GAME_NAMES[game]) return;
    document.querySelector('.invite-toast')?.remove();
    const before = /** @type {HTMLElement | null} */ (document.activeElement);
    const box = document.createElement('div');
    box.className = 'invite-toast';
    box.setAttribute('role', playing ? 'region' : 'alertdialog');
    box.setAttribute('aria-label', 'Invitation');
    const close = () => {
        const hadFocus = box.contains(document.activeElement);
        box.remove();
        if (hadFocus && before && before.isConnected) before.focus();
    };
    box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
    });
    const text = document.createElement('p');
    if (playing) text.setAttribute('role', 'status');
    const name = document.createElement('strong');
    name.textContent = from; // A username: text only
    const join = document.createElement('button');
    join.type = 'button';
    join.className = 'invite-join';
    join.textContent = 'Join';
    const later = document.createElement('button');
    later.type = 'button';
    later.className = 'invite-later';
    later.textContent = 'Not now';
    later.addEventListener('click', close);
    join.addEventListener('click', () => {
        box.remove();
        if (onJoin) onJoin(game, roomCode);
        else location.assign(`/${game}/?join=${roomCode}`);
    });
    const actions = document.createElement('div');
    actions.className = 'invite-actions';
    actions.append(join, later);
    box.append(text, actions);
    document.body.append(box);
    const words = () => text.append(name, ` invites you to play ${GAME_NAMES[game]}.`);
    if (playing) {
        setTimeout(words, 100); // Into the status once it is on the page, so that it is announced
    } else {
        words();
        join.focus();
    }
}

/**
 * In a game's waiting room: one button per friend online to invite them.
 * @param {HTMLElement} container where the list goes (shown only when friends are online)
 * @param {'chesspell' | 'chessdown'} game
 * @param {() => string | null} roomCode the room just created, if any
 */
export function showInviteList(container, game, roomCode) {
    if (!socket) return;
    const draw = (friends) => {
        const code = roomCode();
        container.hidden = !code || !friends.length;
        if (container.hidden) return;
        const status = container.querySelector('.invite-status') || Object.assign(document.createElement('p'), { className: 'invite-status' });
        status.setAttribute('role', 'status');
        const title = Object.assign(document.createElement('p'), { className: 'invite-title', textContent: 'Invite a friend who is online:' });
        const list = document.createElement('ul');
        list.className = 'invite-list';
        for (const f of friends) {
            const button = Object.assign(document.createElement('button'), { type: 'button', textContent: f.username });
            button.setAttribute('aria-label', `Invite ${f.username} (${whereText(f.where)})`);
            button.addEventListener('click', async () => {
                button.disabled = true;
                const answer = await inviteFriend(f.username, game, roomCode());
                status.textContent = answer.ok ? `Invitation sent to ${answer.username}.` : answer.error;
                button.disabled = false;
            });
            const item = document.createElement('li');
            item.append(button);
            list.append(item);
        }
        container.replaceChildren(title, list, status);
    };
    onFriendsOnline(draw);
    return () => draw([...onlineFriends.values()]);
}
