// @ts-check
// The account page: sign in or create an account; once signed in, the account, its
// data and its deletion. Every check is redone by the server (server/accounts/).
import { currentUser, showUserInTopbar } from '../../assets/js/session.js'; // Served as /assets/js/session.js

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * Where to go after signing in: ?next=/some/page on this site only (never another site,
 * so the link cannot send a player to a look-alike page).
 */
function nextPage() {
    const next = new URLSearchParams(location.search).get('next');
    return next && /^\/(?![/\\])/.test(next) ? next : null;
}

/** Send JSON to the account API; returns the answer, or throws its error message. */
async function send(method, url, body) {
    let res;
    try {
        res = await fetch(url, {
            method,
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: body && JSON.stringify(body),
        });
    } catch {
        throw new Error('The site cannot be reached. Check your connection and try again.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Try again.');
    return data;
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

/** What the page shows for a signed-in player: their account and its data. */
async function showAccount() {
    const { account } = await send('GET', '/api/account');
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
                await send('DELETE', `/api/account/providers/${provider}`).catch((err) => showNotice(err.message, true));
                await showAccount();
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

$('logout-button').addEventListener('click', async () => {
    await send('POST', '/api/auth/logout', {}).catch(() => {});
    showUserInTopbar(null);
    showSignedOut();
    $('account-title').focus();
});

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
