// @ts-check
// Who is signed in, for every page of the site: the hub's top-bar button ("Sign in" or
// the player's name) and the account line of each game's menu.
// Games import it as ../../../assets/js/session.js: from /<game>/js/ the browser
// resolves that to /assets/js/session.js, and the type checker finds the same file.

/** @typedef {{ id: number, username: string }} User */

/** The signed-in player, or null (also null when the server cannot be reached). */
export async function currentUser() {
    try {
        const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (!res.ok) return null;
        return /** @type {{ user: User | null }} */ (await res.json()).user;
    } catch {
        return null;
    }
}

/** Show the player's name on the account button once signed in. */
export function showUserInTopbar(user) {
    const link = document.getElementById('account-link');
    if (!link) return;
    link.textContent = user ? user.username : 'Sign in';
    link.setAttribute('aria-label', user ? `${user.username}, your account` : 'Sign in or create an account');
}

/**
 * A game's account line: who is signed in, or an invitation to sign in that comes back
 * to the game afterwards.
 * @param {HTMLElement} el
 * @param {User | null} user
 * @param {{ game: string, perk: string }} options game: its path ('/chesspell/'); perk: what an account keeps
 */
export function showAccountLine(el, user, { game, perk }) {
    const link = document.createElement('a');
    if (user) {
        const name = document.createElement('strong');
        name.textContent = user.username;
        link.href = '/account/';
        link.textContent = 'Your account';
        el.replaceChildren('Signed in as ', name, '. ', link);
    } else {
        link.href = `/account/?next=${encodeURIComponent(game)}`;
        link.textContent = 'Sign in';
        el.replaceChildren(link, ` to keep your ${perk} on every device.`);
    }
    el.hidden = false;
}

// On every hub page, the button follows who is signed in.
if (document.getElementById('account-link')) {
    currentUser().then(showUserInTopbar);
}
