// @ts-check
// Gérard's tour of the career (docs/games/chessdown-career.md): the game as a whole, step by
// step, in the card of the career's screen, the thing he speaks of outlined on the screen.
// It opens by itself the first time the career is opened (remembered in this browser), and
// again from the "Tour with Gérard" button. career-view.js gives it what it needs.
import { esc } from './club-art.js';
import { t } from '../../../assets/js/i18n.js';

const SEEN = 'pawnet.chessdown.tourSeen';

/**
 * The steps: a text each (`tour.<id>.title`, `tour.<id>.text`) and what is outlined (a CSS
 * selector on the career's screen; none for the steps about the game itself).
 */
const STEPS = [
    { id: 'welcome', target: '.career-marker[data-place="home"]' },
    { id: 'win', target: '' },
    { id: 'draft', target: '' },
    { id: 'levels', target: '#career-tab-guide' },
    { id: 'xp', target: '#career-back' },
    { id: 'map', target: '#career-date' },
    { id: 'tournament', target: '.career-marker.main' },
    { id: 'quests', target: '.career-marker.side' },
    { id: 'bosses', target: '' },
    { id: 'transport', target: '.career-marker.transport' },
    { id: 'journal', target: '#career-tab-journal' },
];

/** The tour was seen in this browser (it then opens only from its button). */
export function tourSeen() {
    try { return localStorage.getItem(SEEN) === '1'; } catch { return true; }
}

/**
 * Start the tour.
 * @param {{ card: HTMLElement, say: (text: string) => void, setCard: (kind: string, html: string) => void, done: () => void }} ui
 *   card: the card it is written in; say: Gérard says the step's title; done: the tour ended
 */
export function startTour({ card, say, setCard, done }) {
    let step = 0;
    let outlined = /** @type {Element | null} */ (null);
    const unmark = () => { outlined?.classList.remove('tour-focus'); outlined = null; };
    const end = () => {
        unmark();
        try { localStorage.setItem(SEEN, '1'); } catch { /* Not kept: it opens again next time */ }
        done();
    };
    const show = () => {
        const s = STEPS[step];
        unmark();
        outlined = s.target ? document.querySelector(s.target) : null;
        outlined?.classList.add('tour-focus');
        const last = step === STEPS.length - 1;
        setCard('tour', `<span class="career-kind">${esc(t('tour.kind', { n: step + 1, total: STEPS.length }))}</span>
            <h3 tabindex="-1">${esc(t(`tour.${s.id}.title`))}</h3>
            <p class="career-tour-text">${esc(t(`tour.${s.id}.text`))}</p>
            <div class="career-row career-tour-row">
              <button type="button" class="btn-ghost" data-tour="prev" ${step === 0 ? 'disabled' : ''}>${esc(t('tour.prev'))}</button>
              <button type="button" class="btn-primary" data-tour="next">${esc(t(last ? 'tour.done' : 'tour.next'))}</button>
              ${last ? '' : `<button type="button" class="btn-ghost" data-tour="skip">${esc(t('tour.skip'))}</button>`}
            </div>`);
        say(t(`tour.${s.id}.title`));
        card.querySelector('[data-tour="prev"]')?.addEventListener('click', () => { step--; show(); focusNext(); });
        card.querySelector('[data-tour="next"]')?.addEventListener('click', () => { if (last) end(); else { step++; show(); focusNext(); } });
        card.querySelector('[data-tour="skip"]')?.addEventListener('click', end);
    };
    const focusNext = () => /** @type {HTMLElement | null} */ (card.querySelector('[data-tour="next"]'))?.focus();
    show();
    return { stop: () => { unmark(); } };
}
