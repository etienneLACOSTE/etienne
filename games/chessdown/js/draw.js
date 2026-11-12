// @ts-check
// Draw by agreement: the header's "Offer draw" button, in a match against a person.
// Online, the server keeps the offers (assets/js/draw-offer.js); on the same screen, the
// player to move offers and the other one answers in a dialog.
import { socket, state } from './state.js';
import { ask } from '../../../assets/js/dialog.js';
import { watchDrawOffers } from '../../../assets/js/draw-offer.js';

const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-offer-draw'));
const inMatch = () => state.gameState === 'gameplay' && !state.isBotMatch;
const online = socket && button ? watchDrawOffers(socket, {
    button,
    me: () => state.myPlayerNumber,
    roomCode: () => state.currentRoomCode,
    playing: () => inMatch() && Boolean(state.currentRoomCode),
}) : null;

/** Show the button during a match against a person; online, as the offers allow. */
export function updateDrawButton() {
    if (!button) return;
    button.hidden = !inMatch();
    if (state.currentRoomCode && online) return online.refresh();
    button.disabled = !inMatch();
    button.textContent = 'Offer draw';
}

/** A turn was played online: a new offer is allowed. */
export function drawTurnPlayed() {
    online?.turnPlayed();
}

/** A match starts or ends: no offer in progress. */
export function resetDrawOffers() {
    online?.reset();
    updateDrawButton();
}

/** @param {() => void} agreed both players agree: end the match as a draw (same screen) */
export function setupDraw(agreed) {
    button?.addEventListener('click', async () => {
        if (!inMatch()) return;
        if (state.currentRoomCode) return online?.offer();
        const offerer = state.currentPlayer;
        const other = offerer === 1 ? 2 : 1;
        const accepted = await ask(`Player ${offerer} offers a draw. Player ${other}, do you accept?`, { confirm: 'Accept', cancel: 'Decline' });
        if (accepted && inMatch() && !state.currentRoomCode) agreed();
    });
}
