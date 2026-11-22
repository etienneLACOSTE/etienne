// @ts-check
// The main menu's language button: "Language" and the current language's pixel flag
// (js/flags.js). It opens the list of the languages, each with its flag; a choice reloads the
// page in it (i18n.js chooseLanguage, kept in this browser).
import { LANGUAGES, chooseLanguage, language } from '../../../assets/js/i18n.js';
import { flagSVG } from './flags.js';

export function setupLanguageMenu() {
    const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-language'));
    const list = /** @type {HTMLElement | null} */ (document.getElementById('language-list'));
    if (!button || !list) return;
    const current = language();
    /** @type {HTMLElement} */ (button.querySelector('.flag-slot')).innerHTML = flagSVG(current);
    /** @type {HTMLElement} */ (button.querySelector('.language-current')).textContent = ` (${LANGUAGES[current]})`;
    list.innerHTML = Object.entries(LANGUAGES).map(([code, name]) => `<li>
        <button type="button" class="language-choice" data-lang="${code}" lang="${code}" ${code === current ? 'aria-current="true"' : ''}>
          ${flagSVG(code)}<span>${name}</span>${code === current ? '<span class="language-tick" aria-hidden="true">✓</span>' : ''}</button></li>`).join('');

    const open = (yes) => {
        list.hidden = !yes;
        button.setAttribute('aria-expanded', String(yes));
        // Upwards when the screen has no room for it below the button
        list.classList.remove('up');
        if (yes && list.getBoundingClientRect().bottom > innerHeight) list.classList.add('up');
        if (yes) /** @type {HTMLElement | null} */ (list.querySelector('[aria-current="true"]') || list.querySelector('button'))?.focus();
    };
    button.addEventListener('click', () => open(list.hidden));
    list.addEventListener('click', (e) => {
        const choice = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-lang]'));
        if (!choice) return;
        if (choice.dataset.lang === current) return open(false);
        chooseLanguage(/** @type {string} */ (choice.dataset.lang)); // The page reloads in it
    });
    list.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        open(false);
        button.focus();
    });
    document.addEventListener('pointerdown', (e) => {
        if (!list.hidden && !list.contains(/** @type {Node} */ (e.target)) && !button.contains(/** @type {Node} */ (e.target))) open(false);
    });
}
