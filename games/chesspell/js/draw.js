// @ts-check
// Draw by agreement: the "Offer draw" button of the game screen, in a match against a
// person (never the bot). Online, the server keeps the offers (assets/js/draw-offer.js);
// on the same screen, the player to move offers and the other one answers in a dialog.
import { match, session, socket } from './state.js';
import { engine } from './game-engine.js';
import { ask } from '../../../assets/js/dialog.js';
import { watchDrawOffers } from '../../../assets/js/draw-offer.js';

const button = /** @type {HTMLButtonElement | null} */ (document.getElementById('btn-offer-draw'));
const onBoard = () => Boolean(document.getElementById('game-board')?.classList.contains('active'));
const inMatch = () => onBoard() && !engine.winner && !match.isBotGame;
const isOnlineGame = () => session.isOnline && Boolean(session.currentRoomCode);
const online = socket && button ? watchDrawOffers(socket, {
    button,
    me: () => session.myPlayerNumber,
    roomCode: () => session.currentRoomCode,
    playing: () => inMatch() && isOnlineGame(),
}) : null;

/** Show the button during a match against a person; online, as the offers allow. */
export function updateDrawButton() {
    if (!button) return;
    button.hidden = !inMatch();
    if (isOnlineGame() && online) return online.refresh();
    button.disabled = !inMatch();
    button.textContent = 'Offer draw';
}

/** A turn starts: online, a new offer is allowed. */
export function drawTurnPlayed() {
    online?.turnPlayed();
    updateDrawButton();
}

/** A game starts or ends: no offer in progress. */
export function resetDrawOffers() {
    online?.reset();
    updateDrawButton();
}

const NAMES = { white: 'White', black: 'Black' };

export function setupDraw() {
    button?.addEventListener('click', async () => {
        if (!inMatch()) return;
        if (isOnlineGame()) return online?.offer();
        const offerer = engine.turn;
        const other = offerer === 'white' ? 'black' : 'white';
        const accepted = await ask(`${NAMES[offerer]} offers a draw. ${NAMES[other]}, do you accept?`, { confirm: 'Accept', cancel: 'Decline' });
        if (!accepted || !inMatch() || isOnlineGame()) return;
        ChesspellGame.agreeDraw(engine);
        engine.showGameOver('agreement');
    });
}
