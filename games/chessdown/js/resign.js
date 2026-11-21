// @ts-check
// Resign: the header's button during any game. In a best of 3 the player chooses to resign
// this game (the series goes on) or the whole match; a single game asks for a yes. What it
// does is up to events.js (setupResign): this module only holds the button and the question.
import { state } from './state.js';
import { ask, choose } from '../../../assets/js/dialog.js';
import { t } from '../../../assets/js/i18n.js';

const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-resign'));

/** The button shows while a game is played. */
export function updateResignButton() {
    if (button) button.hidden = state.gameState !== 'gameplay';
}

/**
 * @param {(what: 'game' | 'match') => void} resign the player resigns this game, or the match
 */
export function setupResign(resign) {
    button?.addEventListener('click', async () => {
        if (state.gameState !== 'gameplay') return;
        let what = '';
        if (state.series && state.series.format === 'bo3' && !state.series.over) {
            what = await choose(t('resign.question'), [
                { label: t('resign.keep'), value: '' },
                { label: t('resign.game'), value: 'game' },
                { label: t('resign.match'), value: 'match' },
            ]);
        } else if (await ask(t('resign.confirm'), { confirm: t('resign.yes'), cancel: t('resign.keep') })) {
            what = 'match';
        }
        if ((what === 'game' || what === 'match') && state.gameState === 'gameplay') resign(what);
    });
}
