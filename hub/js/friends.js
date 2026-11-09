// @ts-check
// The friends card of the account page: add a friend by username, answer requests,
// remove or block a friend, unblock. The server checks everything (server/friends.js).
import { api } from '../../assets/js/session.js'; // Served as /assets/js/session.js

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

/** A button that runs an action, then redraws the card (errors show above the lists). */
function action(label, accessibleName, run, className = 'link-button') {
    const button = el('button', { type: 'button', className, textContent: label });
    button.setAttribute('aria-label', accessibleName);
    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            await run();
        } catch (err) {
            showMessage(err.message, true);
        }
        await showFriends().catch(() => {});
    });
    return button;
}

function showMessage(text, isError) {
    $('friend-error').hidden = !isError;
    $('friend-notice').hidden = isError;
    $(isError ? 'friend-error' : 'friend-notice').textContent = text;
}

const path = (username) => encodeURIComponent(username);

/** One line of a list: picture, name, then the buttons. */
const person = (p, ...buttons) => el('li', {}, face(p), el('span', { className: 'who', textContent: p.username }), el('span', { className: 'acts' }, ...buttons));

/** Draw the whole card from the server's lists. */
export async function showFriends() {
    const { friends, incoming, outgoing, blocked } = await api('GET', '/api/friends');

    $('incoming-list').replaceChildren(...incoming.map((p) => person(p,
        action('Accept', `Accept ${p.username}`, () => api('POST', `/api/friends/requests/${path(p.username)}/accept`), 'pill pill-small'),
        action('Decline', `Decline ${p.username}`, () => api('DELETE', `/api/friends/requests/${path(p.username)}`)))));
    $('incoming-block').hidden = !incoming.length;

    $('friends-list').replaceChildren(...friends.map((p) => person(p,
        action('Remove', `Remove ${p.username} from your friends`, async () => {
            if (confirm(`Remove ${p.username} from your friends?`)) await api('DELETE', `/api/friends/${path(p.username)}`);
        }),
        action('Block', `Block ${p.username}`, async () => {
            if (confirm(`Block ${p.username}? They will no longer be able to send you requests or invitations.`)) {
                await api('POST', '/api/friends/blocks', { username: p.username });
            }
        }))));
    $('friends-empty').hidden = friends.length > 0;

    $('outgoing-list').replaceChildren(...outgoing.map((p) => person({ ...p, avatar: '' },
        action('Cancel', `Cancel the request to ${p.username}`, () => api('DELETE', `/api/friends/requests/${path(p.username)}`)))));
    $('outgoing-block').hidden = !outgoing.length;

    $('blocked-list').replaceChildren(...blocked.map((username) => person({ username, avatar: '' },
        action('Unblock', `Unblock ${username}`, () => api('DELETE', `/api/friends/blocks/${path(username)}`)))));
    $('blocked-block').hidden = !blocked.length;
}

$('friend-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = /** @type {HTMLInputElement} */ ($('friend-name'));
    const button = /** @type {HTMLButtonElement} */ ($('friend-form').querySelector('button'));
    const username = input.value.trim();
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
