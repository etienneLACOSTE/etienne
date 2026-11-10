// @ts-check
// The deck builder: pick the three cards of a profile's deck and save them.
import { cardsData, session } from './state.js';
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
    /** A save is on its way to the server. */
    saving: false,
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
    fillProfileList();
    const known = ProfileManager.find(builder.profileId);
    loadDeck(known ? builder.profileId : ProfileManager.all()[0]?.id);
}

/**
 * The profiles changed while the deck builder is open (the account arrived, a profile
 * was renamed...): the list is redrawn; the cards being picked stay, unless their
 * profile is gone.
 */
export function refreshDeckBuilder() {
    if (!document.getElementById('deck-builder').classList.contains('active')) return;
    fillProfileList();
    if (!ProfileManager.find(builder.profileId)) return loadDeck(ProfileManager.all()[0]?.id);
    /** @type {HTMLSelectElement} */ (document.getElementById('deck-profile-select')).value = builder.profileId;
    updateSelectionUI();
}

function fillProfileList() {
    const select = /** @type {HTMLSelectElement} */ (document.getElementById('deck-profile-select'));
    select.replaceChildren(...ProfileManager.all().map((p) => new Option(p === ProfileManager.account ? `${p.name} (you)` : p.name, p.id)));
    // Signed in, the account is not "on this device only", even before its profile loads.
    showAccountInvite(!ProfileManager.account && !session.account);
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

export async function saveDeckForProfile() {
    if (builder.cards.size !== DECK_SIZE || builder.saving) return;
    // What is saved is the deck as it is now: picking cards while it is on its way
    // changes the next save, not this one.
    const deck = [...builder.cards];
    const profileId = builder.profileId;
    builder.saving = true;
    updateSelectionUI();
    try {
        const profile = await ProfileManager.saveDeck(profileId, deck);
        if (!profile) return;
        deckMessage(profile === ProfileManager.account
            ? 'Deck saved on your account: it follows you on every device.'
            : `Deck saved for ${profile.name}, on this device.`);
    } catch (err) {
        deckMessage(err.message);
    } finally {
        builder.saving = false;
        updateSelectionUI();
    }
}

/** Without an account, the deck stays on this device: say how to keep it everywhere. */
function showAccountInvite(show) {
    document.getElementById('deck-account-invite').hidden = !show;
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
    saveBtn.disabled = !builder.profileId || count !== DECK_SIZE || builder.saving;
}
