// @ts-check
// Languages of the pages that offer a choice (Chessdown for now). A page opts in with
// useLanguages(): until then, and on the other pages, everything stays in English.
// - t(key, params): the text of `key` in the page's language, English when missing;
//   `{name}` in a text is replaced by params.name.
// - Static text in the HTML: data-i18n="key" (the element's text) and
//   data-i18n-attr="attribute:key; attribute:key" (aria-label, placeholder...).
// - The choice is kept in this browser only (local storage), never sent to the server.
import EN from './strings/en.js';

/** Languages offered, each named in its own language. */
export const LANGUAGES = { en: 'English', fr: 'Français', es: 'Español', it: 'Italiano', de: 'Deutsch' };
const STORAGE_KEY = 'pawnet.language';

/** @type {Record<string, Record<string, string>>} */
const tables = { en: { ...EN } };
let current = 'en';

/**
 * Add texts for a language (the shared ones, then the page's own).
 * @param {string} lang @param {Record<string, string>} strings
 */
export function addStrings(lang, strings) {
    tables[lang] = { ...tables[lang], ...strings };
}

/** The page's language ('en' until the page opts in). */
export function language() {
    return current;
}

/**
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 */
export function t(key, params) {
    const text = (tables[current] && tables[current][key]) ?? tables.en[key] ?? key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (all, name) => (name in params ? String(params[name]) : all));
}

/** The language chosen in this browser, else the browser's own if offered, else English. */
export function preferredLanguage() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored && stored in LANGUAGES) return stored;
    } catch { /* Storage blocked: fall back on the browser */ }
    for (const tag of navigator.languages || [navigator.language]) {
        const base = String(tag).slice(0, 2).toLowerCase();
        if (base in LANGUAGES) return base;
    }
    return 'en';
}

/**
 * Keep the player's choice; the page reloads to show it everywhere.
 * @param {string} lang
 */
export function chooseLanguage(lang) {
    if (!(lang in LANGUAGES)) return;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* Only for this visit */ }
    if (lang !== current) location.reload();
}

/**
 * The page offers the languages: its texts in each (`strings[lang]`, merged over the
 * shared ones), the preferred language picked, and the HTML translated.
 * @param {Record<string, Record<string, string>>} strings
 */
export function useLanguages(strings) {
    for (const [lang, table] of Object.entries(strings)) addStrings(lang, table);
    current = preferredLanguage();
    document.documentElement.lang = current;
    translatePage(document);
}

/**
 * Put the texts of the page's language in the marked elements under `root`.
 * @param {ParentNode} root
 */
export function translatePage(root) {
    for (const el of root.querySelectorAll('[data-i18n]')) {
        el.textContent = t(/** @type {HTMLElement} */ (el).dataset.i18n || '');
    }
    for (const el of root.querySelectorAll('[data-i18n-attr]')) {
        for (const pair of (/** @type {HTMLElement} */ (el).dataset.i18nAttr || '').split(';')) {
            const [attr, key] = pair.split(':').map((s) => s.trim());
            if (attr && key) el.setAttribute(attr, t(key));
        }
    }
}

/**
 * Text with **bold** parts, as nodes (never as HTML).
 * @param {HTMLElement} el @param {string} text
 */
export function setRichText(el, text) {
    el.replaceChildren(...text.split(/\*\*/).map((part, i) => {
        if (i % 2 === 0) return document.createTextNode(part);
        const b = document.createElement('b');
        b.textContent = part;
        return b;
    }));
}

/**
 * A sentence with a link in it: `{link}` in the text becomes the link.
 * @param {string} text @param {string} href @param {string} linkText
 * @returns {(string | Node)[]} nodes for replaceChildren()
 */
export function withLink(text, href, linkText) {
    return fillNodes(text, { link: Object.assign(document.createElement('a'), { href, textContent: linkText }) });
}

/**
 * A sentence with elements in it: each `{key}` in the text becomes `parts[key]`.
 * @param {string} text @param {Record<string, Node>} parts
 * @returns {(string | Node)[]} nodes for replaceChildren()
 */
export function fillNodes(text, parts) {
    return text.split(/(\{\w+\})/).filter((piece) => piece !== '').map((piece) => {
        const key = /^\{(\w+)\}$/.exec(piece);
        return key && parts[key[1]] ? parts[key[1]] : piece;
    });
}

/**
 * Sentences the server sends as text (errors, rooms closed), in the page's language.
 * Unknown ones stay as they are.
 * @param {string} message
 */
export function serverText(message) {
    const known = {
        'Sign in to play online.': 'server.signIn',
        'Too many games in progress. Try again later.': 'server.tooManyGames',
        'Room not found.': 'server.roomNotFound',
        'Room is already full.': 'server.roomFull',
        'Game closed after 15 minutes without activity.': 'server.closedIdle',
        'You can only invite your friends.': 'server.inviteFriendsOnly',
        'Too many invitations: wait a minute.': 'server.tooManyInvites',
        'Create an online room first.': 'server.createRoomFirst',
    };
    if (typeof message !== 'string') return '';
    if (known[message]) return t(known[message]);
    const idle = /^Game closed: nobody played for (\d+) turns\.$/.exec(message);
    if (idle) return t('server.closedNoMoves', { n: idle[1] });
    return message;
}
