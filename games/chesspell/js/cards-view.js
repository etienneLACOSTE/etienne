// @ts-check
// Spell cards on screen: the arcana of the card index and the deck builder, the hand of
// each player during a game, and the two card dialogs (choose / play a card, card info).
import { cardsData, match, session, socket } from './state.js';
import { engine } from './game-engine.js';

/** The arcana number of a spell card: I to XX. */
export function roman(n) {
    /** @type {[number, string][]} */
    const parts = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let out = '';
    for (const [value, letters] of parts) {
        while (n >= value) { out += letters; n -= value; }
    }
    return out;
}

/** The top of a tarot-like spell card: its number and its picture. */
const cardArt = (card) => `
    <span class="card-numeral" aria-hidden="true">${roman(card.id)}</span>
    <div class="card-art" aria-hidden="true">${card.icon}</div>`;

/** The card's number and picture in the spell dialogs. */
function fillModalArt(numeralId, iconId, card) {
    document.getElementById(numeralId).textContent = roman(card.id);
    if (iconId) document.getElementById(iconId).textContent = card.icon;
}

/** The "i" button of a card opens its info dialog (and does not pick the card). */
function wireInfoButton(cardEl, card) {
    cardEl.querySelector('.btn-info').addEventListener('click', (e) => {
        e.stopPropagation();
        showInfoModal(card);
    });
}

/**
 * The twenty arcana in a grid.
 * @param {string} containerId
 * @param {{ onPick?: (card: any, cardEl: HTMLElement) => void, showLocks?: boolean, unlockLine?: boolean }} options
 *   onPick: what a click on a card does; showLocks: locked cards look locked (deck builder);
 *   unlockLine: show the card's unlock condition.
 */
export function renderCards(containerId, { onPick, showLocks = false, unlockLine = true } = {}) {
    const container = document.getElementById(containerId);
    container.replaceChildren(...cardsData.map((card) => {
        const locked = card.isLocked && showLocks;
        const cardEl = document.createElement('div');
        cardEl.className = locked ? 'spell-card locked' : 'spell-card';
        cardEl.dataset.id = String(card.id);
        cardEl.innerHTML = `${cardArt(card)}
            <button type="button" class="card-title card-main"${locked ? ' aria-disabled="true"' : ''}>${card.name}</button>
            <div class="card-effect">${card.effect}</div>
            ${unlockLine ? `<div class="card-unlock">
                ${locked ? '🔒 Unlock: ' : '🔓 '}${card.unlock}
            </div>` : ''}
            <button class="btn-info" title="More info" aria-label="More about ${card.name}">i</button>
        `;
        wireInfoButton(cardEl, card);
        if (onPick) cardEl.addEventListener('click', () => onPick(card, cardEl));
        return cardEl;
    }));
}

/** A player's three cards beside the board; a click offers to cast one. */
export function renderInGameDeck(deckIds, containerId, playerColor) {
    const container = document.getElementById(containerId);
    container.replaceChildren(...deckIds.map((cardId) => {
        const card = cardsData.find(c => c.id === cardId);
        const cardEl = document.createElement('div');
        cardEl.className = 'in-game-card';
        cardEl.dataset.cardId = cardId;
        cardEl.innerHTML = `
            <div class="card-icon-large" aria-hidden="true">${card.icon}</div>
            <div class="card-info">
                <span class="card-numeral" aria-hidden="true">${roman(card.id)}</span>
                <button type="button" class="card-title card-main">${card.name}</button>
                <div class="card-effect">${card.effect}</div>
            </div>
            <button class="btn-info" title="More info" aria-label="More about ${card.name}">i</button>
        `;
        wireInfoButton(cardEl, card);
        cardEl.addEventListener('click', () => {
            if (engine.winner) return; // The game is over
            if (match.isBotGame && playerColor === 'black') return alert("You cannot use the bot's spells!");
            if (!cardEl.classList.contains('used') && engine.turn === playerColor && !engine.targetingState) {
                showCardModal(card, cardEl, playerColor);
            } else if (engine.turn !== playerColor) {
                alert("Not your turn!");
            }
        });
        return cardEl;
    }));
}

/**
 * The card dialog: the card, then a confirm and a cancel button.
 * @param {any} card
 * @param {{ confirm: string, cancel: string, upsideDown: boolean, onConfirm: () => void }} options
 *   upsideDown: turned to face the black player across the table (tabletop mode).
 */
export function openCardModal(card, { confirm, cancel, upsideDown, onConfirm }) {
    const modal = document.getElementById('card-modal');
    fillModalArt('modal-numeral', 'modal-icon', card);
    document.getElementById('modal-title').textContent = card.name;
    document.getElementById('modal-effect').textContent = card.effect;
    const tabletop = document.body.classList.contains('tabletop-mode');
    modal.querySelector('.modal-content').classList.toggle('rotated-180', upsideDown && tabletop);
    modal.classList.remove('hidden');

    // New buttons each time, so the previous card's handlers are gone.
    const confirmBtn = document.getElementById('modal-confirm');
    const cancelBtn = document.getElementById('modal-cancel');
    const newConfirm = /** @type {HTMLElement} */ (confirmBtn.cloneNode(true));
    const newCancel = /** @type {HTMLElement} */ (cancelBtn.cloneNode(true));
    confirmBtn.replaceWith(newConfirm);
    cancelBtn.replaceWith(newCancel);
    newConfirm.textContent = confirm;
    newCancel.textContent = cancel;
    newConfirm.addEventListener('click', () => {
        modal.classList.add('hidden');
        onConfirm();
    });
    newCancel.addEventListener('click', () => modal.classList.add('hidden'));
}

/** Cast a card from the hand (online, the server referees it). */
function showCardModal(card, cardEl, playerColor) {
    openCardModal(card, {
        confirm: 'Play Card',
        cancel: 'Cancel',
        upsideDown: playerColor === 'black',
        onConfirm: () => {
            if (!session.isOnline) {
                engine.activateSpell(card.id, cardEl);
            } else if (engine.turn === session.myPlayerColor) {
                socket.emit('spellActivated', { roomCode: session.currentRoomCode, cardId: card.id });
            }
        },
    });
}

export function showInfoModal(card) {
    const modal = document.getElementById('info-modal');
    fillModalArt('info-modal-numeral', 'info-modal-icon', card);
    document.getElementById('info-modal-title').textContent = card.name;
    document.getElementById('info-modal-effect').textContent = card.effect;
    document.getElementById('info-modal-timing').textContent = card.details.timing;
    document.getElementById('info-modal-conditions').textContent = card.details.conditions;
    document.getElementById('info-modal-inputs').textContent = card.details.inputs;
    modal.classList.remove('hidden');

    const closeBtn = document.getElementById('info-modal-close');
    const newClose = closeBtn.cloneNode(true);
    closeBtn.replaceWith(newClose);
    newClose.addEventListener('click', () => modal.classList.add('hidden'));
}
