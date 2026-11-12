// @ts-check
// Entry point: wires the game flow (who reacts to which event), the buttons of
// index.html and the start of the page.
//
// Modules, from the bottom up (each one imports only the ones above it):
//   state.js, events.js        shared state; the list of events
//   profiles.js                profiles (data, localStorage)
//   spell-fx.js, sky.js        spell effects; the starry sky
//   game-engine.js             the game on this page (rules in game.js)
//   screens.js                 one screen at a time
//   board-view.js              the board: drawing, taps, drag and drop
//   cards-view.js              spell cards, hands and card dialogs
//   deck-builder.js            building a profile's deck
//   profiles-view.js           the profile screen, player lists and banners
//   draft.js, clock.js         the card draft; the clock
//   bot-player.js              the campaign bot on the page (decisions in bot.js)
//   match.js                   a match from start to end screen
//   draw.js, chat.js           draw offers and the chat (the game screen's buttons)
//   online.js, demo.js         online play; the tutorial
//   invites.js                 friends: the waiting room's invite list, joining from an invitation
//   a11y.js                    keyboard and screen reader
//   ../../../assets/js/session.js   who is signed in (shared with the hub)
import { botSettings, match, session } from './state.js';
import { on } from './events.js';
import { engine } from './game-engine.js';
import { ProfileManager } from './profiles.js';
import { showScreen, toggleTabletopMode, watchFullscreenExit } from './screens.js';
import { renderChessboard } from './board-view.js';
import { renderCards } from './cards-view.js';
import { openDeckBuilder, refreshDeckBuilder, saveDeckForProfile, setupDeckBuilder } from './deck-builder.js';
import { cancelEdit, renderProfilesList, submitProfile, updatePlayerSelects } from './profiles-view.js';
import { setTimerMode, startTimer } from './clock.js';
import { botStrength, playBotTurn, selectBotDeck } from './bot-player.js';
import { endGame, leaveGame, rematch, startCampaign, startGame } from './match.js';
import { joinFromInvite, setupOnline } from './online.js';
import { drawTurnPlayed, resetDrawOffers, setupDraw, updateDrawButton } from './draw.js';
import { chat } from './chat.js';
import { setupInvites } from './invites.js';
import { startDemo } from './demo.js';
import { setupAccessibility } from './a11y.js';
import { startSky } from './sky.js';
import { currentUser, showAccountLine } from '../../../assets/js/session.js';

// --- Game flow: what happens after each event (a11y.js adds its own announcements).
on('boardChanged', renderChessboard);
on('turnStarted', () => {
    drawTurnPlayed();
    startTimer();
    if (match.isBotGame && engine.turn === 'black') setTimeout(playBotTurn, 500);
});
on('gameOver', (result) => {
    resetDrawOffers();
    endGame(result);
});
on('gameStarted', resetDrawOffers);
on('profilesChanged', () => {
    renderProfilesList();
    updatePlayerSelects();
    refreshDeckBuilder();
});
on('screenShown', ({ screenId }) => {
    updateDrawButton();
    if (screenId !== 'game-board') chat?.stop(); // The game was left
    if (screenId === 'player-select-screen') updatePlayerSelects();
    if (screenId === 'deck-builder') openDeckBuilder();
});

// The live game, for the console and the end-to-end tests.
// Nothing secret: online games are refereed by the server.
Object.assign(window, { chesspell: { engine, session, match, botSettings, botStrength } });

// Buttons in index.html declare what they do with data-action (no inline handlers).
export const UI_ACTIONS = {
    showScreen: (el) => showScreen(el.dataset.screen),
    toggleTabletopMode: () => toggleTabletopMode(),
    startDraftGame: () => startGame(false),
    startCampaign: () => startCampaign(),
    saveDeck: () => saveDeckForProfile(),
    rematch: () => rematch(),
    leaveGame: () => leaveGame(),
    setTimerMode: (el) => setTimerMode(el.dataset.mode),
    selectBotDeck: (el) => selectBotDeck(el.dataset.deck),
    submitProfile: () => submitProfile(),
    cancelProfileEdit: () => cancelEdit(),
};

document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-action]'));
    if (el && UI_ACTIONS[el.dataset.action]) UI_ACTIONS[el.dataset.action](el);
});

document.addEventListener('DOMContentLoaded', () => {
    setupAccessibility();
    startSky(/** @type {HTMLCanvasElement} */ (document.getElementById('sky')));
    watchFullscreenExit();
    const eloSlider = /** @type {HTMLInputElement} */ (document.getElementById('bot-elo-slider'));
    eloSlider.addEventListener('input', () => {
        document.getElementById('elo-display').textContent = eloSlider.value + ' ELO';
    });

    if (new URLSearchParams(window.location.search).get('demo') === 'true') {
        startDemo();
        return;
    }
    currentUser().then((user) => {
        session.account = user;
        showAccountLine(document.getElementById('account-line'), user, { game: '/chesspell/', perk: 'deck and stats' });
        if (!user) return;
        const account = ProfileManager.loadAccount(user).catch(() => {}); // Guests only if the account cannot be read
        // An invitation joins with the account's deck: once the account is loaded.
        setupInvites((code) => account.then(() => joinFromInvite(code)));
        // Arriving from an invitation on another page: /chesspell/?join=CODE
        const code = new URLSearchParams(location.search).get('join');
        if (code) history.replaceState(null, '', location.pathname); // Not joined again on reload
        if (code && /^[A-Z]{6}$/.test(code)) account.then(() => joinFromInvite(code));
    });
    ProfileManager.loadProfiles();
    renderProfilesList();
    updatePlayerSelects();
    renderCards('index-grid');
    setupDeckBuilder();
    setupOnline();
    setupDraw();
});
