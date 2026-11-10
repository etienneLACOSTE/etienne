// @ts-check
// The account page: sign in or create an account; once signed in, the account, its
// data and its deletion. Every check is redone by the server (server/accounts/).
import { api as send, currentUser, showUserInTopbar } from '../../assets/js/session.js'; // Served as /assets/js/session.js
import { showFriends } from './friends.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * Where to go after signing in: ?next=/some/page on this site only (never another site,
 * so the link cannot send a player to a look-alike page).
 */
function nextPage() {
    const next = new URLSearchParams(location.search).get('next');
    // Same rule as the server (safeNext in server/accounts/oauth.js): a path of this site,
    // with no whitespace, control character or backslash (browsers drop tabs and newlines
    // and read "\\" as "/"), then checked once more against how the browser resolves it.
    if (!next || next.length >= 200 || !/^\/(?!\/)/.test(next) || /[\u0000-\u0020\u007f\\]/.test(next)) return null;
    return new URL(next, location.origin).origin === location.origin ? next : null;
}

/** Run a form's action, with its button busy and its error shown under the fields. */
function handleForm(form, errorId, action) {
    const error = $(errorId);
    const button = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="submit"]'));
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        error.hidden = true;
        button.disabled = true;
        try {
            await action(new FormData(form));
        } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
        } finally {
            button.disabled = false;
        }
    });
}

const PROVIDER_NAMES = { google: 'Google' };
const query = new URLSearchParams(location.search);

/** The providers the server offers (Google), once. */
let offered = null;
const offeredProviders = async () => (offered ||= send('GET', '/api/auth/providers').then((d) => d.providers).catch(() => []));

/** A link that starts signing in (or linking) with a provider: a plain page change. */
function providerLink(provider, { link = false } = {}) {
    const a = document.createElement('a');
    a.className = 'pill';
    const params = new URLSearchParams();
    if (link) params.set('link', '1');
    const next = nextPage();
    if (next && !link) params.set('next', next);
    a.href = `/api/auth/${provider}/start${params.size ? `?${params}` : ''}`;
    a.textContent = `${link ? 'Link' : 'Continue with'} ${PROVIDER_NAMES[provider] || provider}`;
    return a;
}

/** A message at the top of the page, after coming back from Google. */
function showNotice(text, isError) {
    const notice = $('account-notice');
    notice.textContent = text;
    notice.classList.toggle('notice-error', Boolean(isError));
    notice.hidden = false;
}

const NOTICES = {
    cancelled: 'Sign-in was cancelled. Try again whenever you like.',
    failed: 'Sign-in did not work. Try again, or use another way to sign in.',
    taken: 'That account is already linked to another player.',
    already: 'Another Google account is already linked: unlink it first.',
};

/** Size of the account picture, in pixels (square, like the games' profiles). */
const AVATAR_SIZE = 150;

/**
 * The chosen image, cropped to a centred square and made a small JPEG data URL. Read as
 * a data: URL (the site's CSP allows data: images, not blob: ones).
 */
function shrinkPicture(file) {
    return new Promise((resolve, reject) => {
        const notAPicture = () => reject(new Error('This file is not a picture.'));
        const reader = new FileReader();
        reader.onerror = notAPicture;
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = AVATAR_SIZE;
                canvas.height = AVATAR_SIZE;
                const side = Math.min(img.width, img.height);
                canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
            img.onerror = notAPicture;
            img.src = /** @type {string} */ (reader.result);
        };
        reader.readAsDataURL(file);
    });
}

/** The account picture, or the first letter of the username on lilac. */
function showAvatar(account) {
    const box = $('account-avatar');
    if (account.avatar) {
        const img = document.createElement('img');
        img.src = account.avatar; // A checked data URL (server/accounts/avatar.js)
        img.alt = '';
        box.replaceChildren(img);
    } else {
        box.replaceChildren(account.username.charAt(0).toUpperCase());
    }
    $('avatar-remove').hidden = !account.avatar;
}

const GAME_NAMES = { chesspell: "Ches'spell", chessdown: 'Chessdown' };
const MODE_NAMES = { online: 'Online', bot: 'Against the bot', local: 'Same screen' };
const RESULT_NAMES = { win: 'Won', loss: 'Lost', draw: 'Draw' };
const REASON_NAMES = { king: 'king taken', touchdown: 'touchdown', time: 'on time', repetition: 'repetition', forfeit: 'forfeit' };

/** "1 h 05 min", "12 min", "under a minute". */
function playTime(seconds) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 1) return 'under a minute';
    const h = Math.floor(minutes / 60);
    return h ? `${h} h ${String(minutes % 60).padStart(2, '0')} min` : `${minutes} min`;
}

const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
};

/** Per game: wins, losses and draws by mode (online games are refereed), and time played. */
async function showStats() {
    const { games, recent } = await send('GET', '/api/account/stats');
    const played = (g) => Object.values(g.modes).reduce((n, m) => n + m.wins + m.losses + m.draws, 0);
    const blocks = Object.entries(games).filter(([, g]) => played(g) > 0).map(([game, g]) => {
        const rows = Object.entries(g.modes)
            .filter(([, m]) => m.wins + m.losses + m.draws > 0)
            .map(([mode, m]) => el('tr', {}, el('th', { scope: 'row', textContent: MODE_NAMES[mode] }),
                el('td', { textContent: String(m.wins) }), el('td', { textContent: String(m.losses) }), el('td', { textContent: String(m.draws) })));
        const head = el('tr', {}, ...['Mode', 'Won', 'Lost', 'Drawn'].map((t) => el('th', { scope: 'col', textContent: t })));
        return el('div', { className: 'stats-game' },
            el('h3', { textContent: GAME_NAMES[game] }),
            el('p', { textContent: `${played(g)} ${played(g) === 1 ? 'game' : 'games'}, ${playTime(g.seconds)} played` }),
            el('table', {}, el('thead', {}, head), el('tbody', {}, ...rows)));
    });
    $('stats-games').replaceChildren(...blocks);
    $('stats-empty').hidden = blocks.length > 0;
    $('recent-title').hidden = !recent.length;
    $('recent-games').replaceChildren(...recent.map((r) => el('li', {},
        el('span', { className: `result result-${r.result}`, textContent: RESULT_NAMES[r.result] }),
        el('span', { textContent: `${GAME_NAMES[r.game]} against ${r.opponent}` }),
        el('span', { textContent: `${MODE_NAMES[r.mode].toLowerCase()}, ${REASON_NAMES[r.reason] || r.reason}, ${playTime(r.durationS)}` }),
        el('span', { className: 'when', textContent: new Date(r.playedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }))));
}

/** What the page shows for a signed-in player: their account and its data. */
async function showAccount() {
    const { account } = await send('GET', '/api/account');
    showStats().catch(() => {}); // The account shows even if the stats cannot be read
    showFriends().catch(() => {});
    $('account-title').textContent = `Hello, ${account.username}`;
    showAvatar(account);
    $('fact-username').textContent = account.username;
    $('fact-email').textContent = account.email || 'None';
    // Each way to sign in; a linked provider can be unlinked if another way remains.
    const methods = $('fact-methods');
    methods.replaceChildren();
    const ways = (account.hasPassword ? 1 : 0) + account.providers.length;
    if (account.hasPassword) methods.append(Object.assign(document.createElement('span'), { className: 'method', textContent: 'Password' }));
    for (const provider of account.providers) {
        const item = Object.assign(document.createElement('span'), { className: 'method', textContent: PROVIDER_NAMES[provider] || provider });
        if (ways > 1) {
            const unlink = Object.assign(document.createElement('button'), { type: 'button', className: 'link-button', textContent: 'Unlink' });
            unlink.setAttribute('aria-label', `Unlink ${PROVIDER_NAMES[provider] || provider}`);
            unlink.addEventListener('click', async () => {
                unlink.disabled = true; // One request, even on a double click
                await send('DELETE', `/api/account/providers/${provider}`).catch((err) => showNotice(err.message, true));
                await showAccount().catch((err) => showNotice(err.message, true));
            });
            item.append(' ', unlink);
        }
        methods.append(item);
    }
    const linkable = (await offeredProviders()).filter((p) => !account.providers.includes(p));
    $('fact-links').replaceChildren(...linkable.map((p) => providerLink(p, { link: true })));
    $('fact-links-row').hidden = !linkable.length;
    $('fact-since').textContent = new Date(account.createdAt).toLocaleDateString('en-GB', { dateStyle: 'long' });
    $('delete-password-field').hidden = !account.hasPassword;
    $('signed-out').hidden = true;
    $('signed-in').hidden = false;
}

async function showSignedOut() {
    $('account-title').textContent = 'Your account';
    $('signed-in').hidden = true;
    $('finish').hidden = true;
    $('signed-out').hidden = false;
    const providers = await offeredProviders();
    const box = $('provider-buttons');
    box.querySelectorAll('a').forEach((a) => a.remove());
    box.append(...providers.map((p) => providerLink(p)));
    box.hidden = !providers.length;
    $('password-divider').hidden = !providers.length;
}

/** First sign-in with Google: choose a username (suggested from the profile). */
async function showFinish() {
    const { pending } = await send('GET', '/api/auth/pending');
    if (!pending) return false;
    $('account-title').textContent = 'Choose your username';
    /** @type {HTMLInputElement} */ ($('finish-name')).value = pending.suggestedUsername || '';
    $('signed-out').hidden = true;
    $('finish').hidden = false;
    return true;
}

/** After signing in or up: on to the games, or back to the page the player came from. */
function afterSignIn() {
    location.assign(nextPage() || '/');
}

handleForm($('login-form'), 'login-error', async (data) => {
    await send('POST', '/api/auth/login', { login: data.get('login'), password: data.get('password') });
    afterSignIn();
});

handleForm($('signup-form'), 'signup-error', async (data) => {
    await send('POST', '/api/auth/signup', {
        username: data.get('username'), email: data.get('email'), password: data.get('password'),
    });
    afterSignIn();
});

handleForm($('finish-form'), 'finish-error', async (data) => {
    await send('POST', '/api/auth/finish', { username: data.get('username') });
    afterSignIn();
});

/** Change or remove the picture; errors show under it. */
async function setAvatar(avatar) {
    const error = $('avatar-error');
    error.hidden = true;
    try {
        await send('PUT', '/api/account/avatar', { avatar });
        await showAccount();
    } catch (err) {
        error.textContent = err.message;
        error.hidden = false;
    }
}

$('avatar-input').addEventListener('change', async (e) => {
    const input = /** @type {HTMLInputElement} */ (e.target);
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    try {
        await setAvatar(await shrinkPicture(file));
    } catch (err) {
        $('avatar-error').textContent = err.message;
        $('avatar-error').hidden = false;
    }
});
$('avatar-remove').addEventListener('click', () => setAvatar(null));

handleForm($('delete-form'), 'delete-error', async (data) => {
    await send('DELETE', '/api/account', { confirm: data.get('confirm'), password: data.get('password') || undefined });
    showUserInTopbar(null);
    showSignedOut();
    $('account-title').focus();
});

/**
 * Sign out through `url`. If the server did not confirm, the player is still signed in
 * (here, or elsewhere for "every device"): the page says so instead of showing them out.
 */
async function signOut(button, url) {
    /** @type {HTMLButtonElement} */ (button).disabled = true;
    try {
        await send('POST', url, {});
    } catch (err) {
        showNotice(`You are still signed in: ${err.message}`, true);
        $('account-notice').focus(); // At the top of the page: brought into view
        return;
    } finally {
        /** @type {HTMLButtonElement} */ (button).disabled = false;
    }
    showUserInTopbar(null);
    showSignedOut();
    $('account-title').focus();
}

$('logout-all-button').addEventListener('click', () => {
    if (!confirm('Sign out on every device where you are signed in, this one included?')) return;
    signOut($('logout-all-button'), '/api/account/sessions/logout-all');
});

$('logout-button').addEventListener('click', () => signOut($('logout-button'), '/api/auth/logout'));

const next = nextPage();
if (next) /** @type {HTMLAnchorElement} */ ($('guest-link')).href = next;

currentUser().then(async (user) => {
    $('account-loading').hidden = true;
    const error = query.get('error');
    if (error) showNotice(NOTICES[error] || NOTICES.failed, true);
    const linked = query.get('linked');
    if (linked) showNotice(`${PROVIDER_NAMES[linked] || 'The account'} is now linked: you can sign in with it.`, false);
    if (user) await showAccount().catch(showSignedOut);
    else if (!(query.get('finish') && await showFinish().catch(() => false))) await showSignedOut();
});
