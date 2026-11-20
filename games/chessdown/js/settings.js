// @ts-check
// The Settings screen: the language of the page and the timer of the games this player
// sets up. Both are kept in this browser (local storage), so that changing the language
// (the page reloads) keeps the timer chosen.
import { state } from './state.js';
import { LANGUAGES, chooseLanguage, language } from '../../../assets/js/i18n.js';

const TIMER_KEY = 'pawnet.chessdown.timer';

/** The timer kept from a previous visit, if any, into `state`. */
export function loadTimer() {
    try {
        const saved = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null');
        if (saved && (saved.mode === 'turn' || saved.mode === 'overall')
            && Number.isInteger(saved.seconds) && saved.seconds > 0 && saved.seconds < 100 * 60) {
            state.chosenTimer = { mode: saved.mode, seconds: saved.seconds };
        }
    } catch { /* Nothing kept: the default timer */ }
}

function saveTimer() {
    try {
        localStorage.setItem(TIMER_KEY, JSON.stringify(state.chosenTimer));
    } catch { /* Only for this visit */ }
}

/**
 * Fill the screen with the current settings.
 * @param {HTMLSelectElement} select the language list
 */
export function showSettings(select) {
    if (!select.options.length) {
        for (const [code, name] of Object.entries(LANGUAGES)) {
            const option = new Option(name, code);
            option.lang = code; // Screen readers say each name in its own language
            select.append(option);
        }
    }
    select.value = language();
    const minutes = /** @type {HTMLInputElement} */ (document.getElementById('timer-min'));
    const seconds = /** @type {HTMLInputElement} */ (document.getElementById('timer-sec'));
    const chosen = state.chosenTimer;
    minutes.value = String(Math.floor(chosen.seconds / 60));
    seconds.value = String(chosen.seconds % 60);
    for (const button of document.querySelectorAll('.timer-toggle-btn')) {
        button.classList.toggle('selected', /** @type {HTMLElement} */ (button).dataset.mode === chosen.mode);
    }
    document.getElementById('timer-desc-turn')?.classList.toggle('hidden', chosen.mode !== 'turn');
    document.getElementById('timer-desc-overall')?.classList.toggle('hidden', chosen.mode !== 'overall');
}

/**
 * Save: the timer is kept; a new language reloads the page in it.
 * @param {HTMLSelectElement} select
 */
export function saveSettings(select) {
    saveTimer();
    chooseLanguage(select.value);
}
