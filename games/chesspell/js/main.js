// Entry point.

// Buttons in index.html declare what they do with data-action (no inline handlers).
const UI_ACTIONS = {
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
    const el = e.target.closest('[data-action]');
    if (el && UI_ACTIONS[el.dataset.action]) UI_ACTIONS[el.dataset.action](el);
});

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupAccessibility(); // a11y.js
    app.init();

    const eloSlider = document.getElementById('bot-elo-slider');
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
