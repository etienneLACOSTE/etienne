// @ts-check
// The friends card of the account page: add a friend by username, answer requests,
// remove or block a friend, unblock. The server checks everything (server/friends.js).
import { api } from '../../assets/js/session.js'; // Served as /assets/js/session.js
import { onFriendsOnline, whereText } from '../../assets/js/presence.js';
import { ask } from '../../assets/js/dialog.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
};

/** A small round picture, or the first letter of the username. */
function face(person) {
    const box = el('span', { className: 'face' });
    box.setAttribute('aria-hidden', 'true');
    if (person.avatar) box.append(el('img', { src: person.avatar, alt: '' })); // Checked by the server
    else box.textContent = person.username.charAt(0).toUpperCase();
    return box;
}

/** Friends online now (presence.js), by username. */
let online = new Map();
/** The last lists from the server, redrawn when someone comes online or leaves. */
let lists = null;

/**
 * Actions on their way to the server, by the button's accessible name: the card may be
 * redrawn meanwhile (a friend comes online), and the new button must not send it again.
 * @type {Set<string>}
 */
const pending = new Set();

/**
 * A button that runs an action, then redraws the card. What happened shows above the
 * lists (and is read out); the keyboard focus stays on the same button if it is still
 * there, else goes to that message.
 * @param {() => Promise<string | void>} run resolves to the message to show, if any
 */
function action(label, accessibleName, run, className = 'link-button') {
    const button = el('button', { type: 'button', className, textContent: label, disabled: pending.has(accessibleName) });
    button.setAttribute('aria-label', accessibleName);
    button.addEventListener('click', async () => {
        if (pending.has(accessibleName)) return;
        pending.add(accessibleName);
        button.disabled = true;
        clearMessage();
        try {
            const done = await run();
            if (done) showMessage(done, false);
        } catch (err) {
            showMessage(err.message, true);
        } finally {
            pending.delete(accessibleName);
        }
        await showFriends();
        keepFocus(accessibleName);
    });
    return button;
}

/** Back on the button with this name, or on the message saying what happened. */
function keepFocus(accessibleName) {
    const same = [...document.querySelectorAll('.friend-lists button')].find((b) => b.getAttribute('aria-label') === accessibleName);
    if (same instanceof HTMLElement) return same.focus();
    const message = [$('friend-error'), $('friend-notice')].find((m) => !m.hidden);
    if (message) message.focus();
}

function showMessage(text, isError) {
    $('friend-error').hidden = !isError;
    $('friend-notice').hidden = isError;
    $(isError ? 'friend-error' : 'friend-notice').textContent = text;
}

function clearMessage() {
    $('friend-error').hidden = true;
    $('friend-notice').hidden = true;
}

const path = (username) => encodeURIComponent(username);

/** One line of a list: picture, name, then the buttons. */
const person = (p, ...buttons) => el('li', {}, face(p), el('span', { className: 'who', textContent: p.username }), el('span', { className: 'acts' }, ...buttons));

/** A friend's line also says whether they are online, and where. */
function friendLine(p, ...buttons) {
    const line = person(p, ...buttons);
    const here = online.get(p.username);
    const status = el('span', { className: here ? 'presence presence-on' : 'presence', textContent: here ? `Online, ${whereText(here.where)}` : 'Offline' });
    line.querySelector('.who').after(status);
    return line;
}

/** Fetch the lists, then draw the card (or say they could not be loaded). */
export async function showFriends() {
    try {
        lists = await api('GET', '/api/friends');
    } catch (err) {
        showMessage(`Your friends could not be loaded: ${err.message}`, true);
        $('friends-empty').hidden = true; // Not "no friends": unknown
        return;
    }
    draw();
}

onFriendsOnline((friends) => {
    online = new Map(friends.map((f) => [f.username, f]));
    if (lists) draw();
});

/** Draw the whole card from the server's lists and who is online. */
function draw() {
    const { friends, incoming, outgoing, blocked } = lists;

    $('incoming-list').replaceChildren(...incoming.map((p) => person(p,
        action('Accept', `Accept ${p.username}`, async () => {
            await api('POST', `/api/friends/requests/${path(p.username)}/accept`);
            return `You and ${p.username} are now friends.`;
        }, 'pill pill-small'),
        action('Decline', `Decline ${p.username}`, async () => {
            await api('DELETE', `/api/friends/requests/${path(p.username)}`);
            return `Request from ${p.username} declined.`;
        }))));
    $('incoming-block').hidden = !incoming.length;

    $('friends-list').replaceChildren(...friends.map((p) => friendLine(p,
        action('Remove', `Remove ${p.username} from your friends`, async () => {
            if (!await ask(`Remove ${p.username} from your friends?`, { confirm: 'Remove' })) return;
            await api('DELETE', `/api/friends/${path(p.username)}`);
            return `${p.username} is no longer your friend.`;
        }),
        action('Block', `Block ${p.username}`, async () => {
            if (!await ask(`Block ${p.username}? They will no longer be able to send you requests or invitations.`, { confirm: 'Block' })) return;
            await api('POST', '/api/friends/blocks', { username: p.username });
            return `${p.username} is blocked.`;
        }))));
    $('friends-empty').hidden = friends.length > 0;

    $('outgoing-list').replaceChildren(...outgoing.map((p) => person({ ...p, avatar: '' },
        action('Cancel', `Cancel the request to ${p.username}`, async () => {
            await api('DELETE', `/api/friends/requests/${path(p.username)}`);
            return `Request to ${p.username} cancelled.`;
        }))));
    $('outgoing-block').hidden = !outgoing.length;

    $('blocked-list').replaceChildren(...blocked.map((username) => person({ username, avatar: '' },
        action('Unblock', `Unblock ${username}`, async () => {
            await api('DELETE', `/api/friends/blocks/${path(username)}`);
            return `${username} is unblocked.`;
        }))));
    $('blocked-block').hidden = !blocked.length;
}

$('friend-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = /** @type {HTMLInputElement} */ ($('friend-name'));
    const button = /** @type {HTMLButtonElement} */ ($('friend-form').querySelector('button'));
    const username = input.value.trim();
    clearMessage();
    if (!username) return showMessage('Type a username.', true);
    button.disabled = true;
    try {
        const { status, username: name } = await api('POST', '/api/friends/requests', { username });
        showMessage(status === 'friends' ? `You and ${name} are now friends.` : `Request sent to ${name}.`, false);
        input.value = '';
        await showFriends();
    } catch (err) {
        showMessage(err.message, true);
    } finally {
        button.disabled = false;
    }
});
