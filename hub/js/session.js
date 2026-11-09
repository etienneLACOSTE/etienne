// @ts-check
// The account button of the site's top bar: "Sign in", or the signed-in player's name.

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

// On every hub page, the button follows who is signed in.
if (document.getElementById('account-link')) {
    currentUser().then(showUserInTopbar);
}
