// @ts-check
// Draft mode: the two players pick their cards in turn (1, 2, 2, 1, 1, 2) from the
// twenty arcana, then the game starts.
import { match } from './state.js';
import { openCardModal, renderCards } from './cards-view.js';
import { setupPlayerBanner } from './profiles-view.js';
import { showScreen } from './screens.js';

/** Who picks at each step: player 1 (white) or 2 (black). */
const PICK_ORDER = [1, 2, 2, 1, 1, 2];

const draft = {
    step: 0,
    /** What happens once every card is picked. */
    onDone: () => {},
};

/** Empty both decks and open the draft; `onDone` runs after the last pick. */
export function startDraft(onDone) {
    match.p1Deck = [];
    match.p2Deck = [];
    draft.step = 0;
    draft.onDone = onDone;
    showScreen('draft-phase');
    renderCards('draft-grid', { unlockLine: false, onPick: (card) => offerCard(card) });
    updateDraftUI();
}

const picker = () => PICK_ORDER[draft.step];

function offerCard(card) {
    openCardModal(card, {
        confirm: 'Confirm Pick',
        cancel: 'Back',
        upsideDown: picker() === 2,
        onConfirm: () => pickCard(card.id),
    });
}

function pickCard(cardId) {
    (picker() === 1 ? match.p1Deck : match.p2Deck).push(cardId);
    document.querySelector(`#draft-grid .spell-card[data-id="${cardId}"]`)?.classList.add('picked');
    draft.step++;
    if (draft.step >= PICK_ORDER.length) draft.onDone();
    else updateDraftUI();
}

/** Whose pick it is, at the top of the screen (turned round for black in tabletop mode). */
function updateDraftUI() {
    setupPlayerBanner('draft-turn-indicator', picker() === 1 ? match.p1Profile : match.p2Profile);
    const cue = document.createElement('div');
    cue.className = 'draft-cue';
    cue.textContent = 'Your Turn to Pick!';
    document.getElementById('draft-turn-indicator').appendChild(cue);
    const tabletop = document.body.classList.contains('tabletop-mode');
    document.getElementById('draft-phase').classList.toggle('rotated-180', picker() === 2 && tabletop);
}
