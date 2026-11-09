// @ts-check
// The account page: sign in or create an account; once signed in, the account, its
// data and its deletion. Every check is redone by the server (server/accounts/).
import { currentUser, showUserInTopbar } from './session.js';

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

/** What the page shows for a signed-in player: their account and its data. */
async function showAccount() {
    const { account } = await send('GET', '/api/account');
    $('account-title').textContent = `Hello, ${account.username}`;
    $('fact-username').textContent = account.username;
    $('fact-email').textContent = account.email || 'None';
    const names = { google: 'Google', github: 'GitHub' };
    $('fact-methods').textContent = [
        ...(account.hasPassword ? ['Password'] : []),
        ...account.providers.map((p) => names[p] || p),
    ].join(', ');
    $('fact-since').textContent = new Date(account.createdAt).toLocaleDateString('en-GB', { dateStyle: 'long' });
    $('delete-password-field').hidden = !account.hasPassword;
    $('signed-out').hidden = true;
    $('signed-in').hidden = false;
}

function showSignedOut() {
    $('account-title').textContent = 'Your account';
    $('signed-in').hidden = true;
    $('signed-out').hidden = false;
}

/** After signing in or up: back to where the player came from, or their account. */
async function afterSignIn(user) {
    const next = nextPage();
    if (next) return location.assign(next);
    showUserInTopbar(user);
    await showAccount();
    $('account-title').focus();
}

handleForm($('login-form'), 'login-error', async (data) => {
    const { user } = await send('POST', '/api/auth/login', { login: data.get('login'), password: data.get('password') });
    await afterSignIn(user);
});

handleForm($('signup-form'), 'signup-error', async (data) => {
    const { user } = await send('POST', '/api/auth/signup', {
        username: data.get('username'), email: data.get('email'), password: data.get('password'),
    });
    await afterSignIn(user);
});

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

currentUser().then(async (user) => {
    $('account-loading').hidden = true;
    if (user) await showAccount().catch(showSignedOut);
    else showSignedOut();
});
