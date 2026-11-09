// @ts-check
// The deck builder: pick the three cards of a profile's deck and save them.
import { cardsData } from './state.js';
import { ProfileManager } from './profiles.js';
import { renderCards, roman } from './cards-view.js';
import { showScreen } from './screens.js';

const DECK_SIZE = 3;

/** The deck being built, and whose it is. */
const builder = {
    /** @type {Set<number>} */
    cards: new Set(),
    /** @type {string|null} */
    profileId: null,
};

export function setupDeckBuilder() {
    renderCards('deck-grid', { showLocks: true, onPick: (card) => toggleCard(card.id, card.isLocked) });
    document.getElementById('deck-profile-select').addEventListener('change', (e) => {
        loadDeck(/** @type {HTMLSelectElement} */ (e.target).value);
    });
}

/** The deck builder, opened on a profile's deck (from its card in Manage Profiles). */
export function buildDeckForProfile(profileId) {
    builder.profileId = profileId;
    showScreen('deck-builder');
}

/** Fill the profile list and show the deck of the profile being edited (or the first). */
export function openDeckBuilder() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('deck-profile-select'));
    select.replaceChildren(...ProfileManager.profiles.map((p) => new Option(p.name, p.id)));
    const known = ProfileManager.find(builder.profileId);
    loadDeck(known ? builder.profileId : ProfileManager.profiles[0]?.id);
}

/** Show a profile's saved deck, ready to change. */
function loadDeck(profileId) {
    const profile = ProfileManager.find(profileId);
    builder.profileId = profile ? profile.id : null;
    builder.cards = new Set(profile ? profile.deck : []);
    if (profile) /** @type {HTMLSelectElement} */ (document.getElementById('deck-profile-select')).value = profile.id;
    deckMessage(profile
        ? 'Click a card to add it to the deck or take it out. A deck holds three cards.'
        : 'Create a profile first (Manage Profiles): each profile keeps its own deck.');
    updateSelectionUI();
}

export function saveDeckForProfile() {
    if (builder.cards.size !== DECK_SIZE) return;
    const profile = ProfileManager.saveDeck(builder.profileId, builder.cards);
    if (profile) deckMessage(`Deck saved for ${profile.name}.`);
}

function toggleCard(cardId, isLocked) {
    if (isLocked) return deckMessage('This card is locked: complete its objective to unlock it.');
    if (builder.cards.has(cardId)) {
        builder.cards.delete(cardId);
    } else if (builder.cards.size >= DECK_SIZE) {
        return deckMessage(`Your deck is full: remove a card first (click it, or its slot above).`);
    } else {
        builder.cards.add(cardId);
    }
    updateSelectionUI();
}

/** A short message under the deck (also read out by screen readers). */
function deckMessage(text) {
    document.getElementById('deck-status').textContent = text;
}

/** One of the three slots: the chosen card (a click takes it out) or "Empty slot". */
function deckSlot(card) {
    const li = document.createElement('li');
    if (!card) {
        li.className = 'deck-slot empty';
        li.textContent = 'Empty slot';
        return li;
    }
    li.className = 'deck-slot';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'deck-slot-card';
    btn.setAttribute('aria-label', `Remove ${card.name} from the deck`);
    btn.innerHTML = `<span class="deck-slot-icon" aria-hidden="true">${card.icon}</span>
        <span class="deck-slot-text"><span class="card-numeral" aria-hidden="true">${roman(card.id)}</span>
        <span class="deck-slot-name">${card.name}</span></span>
        <span class="deck-slot-remove" aria-hidden="true">✕</span>`;
    btn.addEventListener('click', () => {
        builder.cards.delete(card.id);
        updateSelectionUI();
        document.getElementById('deck-slots').querySelector('button')?.focus();
    });
    li.appendChild(btn);
    return li;
}

/** The deck being built: chosen cards glow in the grid and fill the three slots. */
function updateSelectionUI() {
    const count = builder.cards.size;
    const countEl = document.getElementById('selection-count');
    countEl.textContent = `${count}/${DECK_SIZE} cards`;
    countEl.classList.toggle('complete', count === DECK_SIZE);
    /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('#deck-grid .spell-card')).forEach((el) => {
        const chosen = builder.cards.has(Number(el.dataset.id));
        el.classList.toggle('selected', chosen);
        el.querySelector('.card-main').setAttribute('aria-pressed', String(chosen));
    });

    const chosen = [...builder.cards].map((id) => cardsData.find((c) => c.id === id)).filter(Boolean);
    document.getElementById('deck-slots').replaceChildren(
        ...Array.from({ length: DECK_SIZE }, (_, i) => deckSlot(chosen[i])));

    const saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('save-deck-btn'));
    saveBtn.disabled = !builder.profileId || count !== DECK_SIZE;
}
