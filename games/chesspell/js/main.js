// @ts-check
// Entry point.
// These add their methods to `app` (online play, tutorial, bot, rendering).
import { session } from './state.js';
import { engine } from './game-engine.js';
import { ProfileManager } from './profiles.js';
import { app } from './app.js';
import { setupAccessibility } from './a11y.js';

import './app-online.js';
import './app-demo.js';
import './app-bot.js';
import './app-view.js';

// The live game, for the console and the end-to-end tests.
// Nothing secret: online games are refereed by the server.
Object.assign(window, { chesspell: { engine, app, session } });

// Buttons in index.html declare what they do with data-action (no inline handlers).
export const UI_ACTIONS = {
    showScreen: (el) => app.showScreen(el.dataset.screen),
    toggleTabletopMode: () => app.toggleTabletopMode(),
    startDraftGame: () => app.startGame(false),
    startCampaign: () => app.startCampaign(),
    saveDeck: () => app.saveDeckForProfile(),
    setTimerMode: (el) => app.setTimerMode(el.dataset.mode),
    selectBotDeck: (el) => app.selectBotDeck(el.dataset.deck),
    submitProfile: () => ProfileManager.submitProfile(),
    cancelProfileEdit: () => ProfileManager.cancelEdit(),
};

document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-action]'));
    if (el && UI_ACTIONS[el.dataset.action]) UI_ACTIONS[el.dataset.action](el);
});

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupAccessibility(); // a11y.js
    app.init();

    const eloSlider = /** @type {HTMLInputElement} */ (document.getElementById('bot-elo-slider'));
    eloSlider.addEventListener('input', () => {
        document.getElementById('elo-display').textContent = eloSlider.value + ' ELO';
    });
});

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        document.body.classList.remove('tabletop-mode');
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }
});
