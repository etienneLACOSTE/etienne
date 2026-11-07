// @ts-check
// Entry point.
import { state, ui } from './state.js';
import { showScreen } from './board-view.js';
import { loadBotProfileForDifficulty } from './bot.js';
import { setupEventListeners } from './events.js';
import { startDemo } from './demo.js';
import { setupAccessibility } from './a11y.js';
import { startCrowd } from './crowd.js';
import { movePiece, skipTurn } from './gameplay.js';
import { generateAllMoves, getValidMoves } from './rules-bridge.js';

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
    
    showScreen(ui.mainMenu);
    ui.statusBar.textContent = "Welcome to Chessdown";
    
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
