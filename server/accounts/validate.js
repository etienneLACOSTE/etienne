// @ts-check
// What the account forms accept. Every check is done here, on the server; the page's
// own checks are only there to help the player.

const USERNAME = /^[A-Za-z0-9_-]{3,20}$/;
// Loose on purpose (the reset email is the real test), but one @ and a dot after it.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,185}\.[^\s@]{2,63}$/;
// Never accepted anywhere in an address: control characters (they could forge headers
// or lines in a mail, or hide in logs).
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

/** @returns {string | null} what is wrong, or null */
function usernameProblem(username) {
    if (typeof username !== 'string' || !USERNAME.test(username)) {
        return 'A username has 3 to 20 letters, digits, - or _.';
    }
    return null;
}

function emailProblem(email) {
    if (typeof email !== 'string' || email.length > 254 || !EMAIL.test(email) || CONTROL.test(email)) return 'Enter a valid email address.';
    return null;
}

function passwordProblem(password) {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        return `A password has ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
    }
    return null;
}

module.exports = { usernameProblem, emailProblem, passwordProblem, PASSWORD_MIN, PASSWORD_MAX };
