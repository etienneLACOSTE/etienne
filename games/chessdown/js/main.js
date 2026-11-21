// @ts-check
// Entry point.
import './lang.js'; // First: the language is set before any text is written
import { state, ui } from './state.js';
import { showScreen } from './board-view.js';
import { loadBotProfileForDifficulty } from './bot.js';
import { setupEventListeners } from './events.js';
import { startDemo } from './demo.js';
import { setupAccessibility } from './a11y.js';
import { startCrowd } from './crowd.js';
import { movePiece, skipTurn } from './gameplay.js';
import { generateAllMoves, getValidMoves } from './rules-bridge.js';
import { currentUser, gateOnline, showAccountLine } from '../../../assets/js/session.js';
import { joinFromInvite, setupInvites } from './invites.js';
import { loadTimer } from './settings.js';
import { t } from '../../../assets/js/i18n.js';
import { startCloudSave } from './cloud-save.js';
import { loadClub, saveClub } from './club-store.js';
import { deleteCareer, loadCareer, saveCareer } from './career-store.js';

// Initialization
export function init() {
    // The stands follow the pitch: the board and its end zones, when shown.
    startCrowd(/** @type {HTMLCanvasElement} */ (document.getElementById('crowd')), () => {
        if (ui.gameLayout.classList.contains('hidden')) return null;
        const board = ui.chessboard.getBoundingClientRect();
        return board.width ? board : null;
    });
    setupEventListeners();
    setupAccessibility(); // a11y.js
    
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') {
        startDemo();
        return;
    }
    
    loadTimer();
    showScreen(ui.mainMenu);
    ui.statusBar.textContent = t('status.welcome');
    currentUser().then((user) => {
        state.account = user;
        showAccountLine(document.getElementById('account-line'), user, { game: '/chessdown/', perk: t('menu.perkStats') });
        gateOnline(document.getElementById('online-controls'), document.getElementById('online-gate'), user, '/chessdown/');
        if (!user) return;
        // The club and the career follow the account (the account's win over this browser's).
        startCloudSave({ club: loadClub(), career: loadCareer() }, (club, career) => {
            saveClub(club);
            if (career) saveCareer(career); else deleteCareer();
        });
        setupInvites();
        // Arriving from an invitation on another page: /chessdown/?join=CODE
        const code = new URLSearchParams(location.search).get('join');
        if (code) history.replaceState(null, '', location.pathname); // Not joined again on reload
        if (code && /^[A-Z]{6}$/.test(code)) joinFromInvite(code);
    });
    
    // Fetch AI training data once at startup
    fetch('training_data.json')
        .then(response => response.json())
        .then(data => {
            if (data && data.generations && data.generations.length > 0) {
                state.botTrainingData = data;
                console.log(`Loaded training data with ${data.generations.length} generations.`);
                if (urlParams.get('demo') !== 'true') {
                    loadBotProfileForDifficulty('master');
                } else {
                    loadBotProfileForDifficulty('novice');
                }
            }
        })
        .catch(err => {
            console.log("No trained AI found, using default bot profile.", err);
        });
}

// The live game state and a few actions, for the console and the end-to-end tests.
// Nothing secret: online games are refereed by the server.
Object.assign(window, { chessdown: { state, movePiece, skipTurn, generateAllMoves, getValidMoves } });

// Start
init();
