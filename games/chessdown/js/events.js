// @ts-check
// Input wiring: menus, modals, draft shop, buttons and board squares (one listener).
import { socket, state, ui } from './state.js';
import { enterFullscreen, renderBoard, showScreen } from './board-view.js';
import { clearCurrentDraft, draftHooks, handleDraftSquareClick, handleTransitionReady, startDraftPhase, toggleRemoveMode, updateShopColors, validateDraft } from './draft.js';
import { handleGameplaySquareClick, resetGame } from './gameplay.js';
import { loadBotProfileForDifficulty } from './bot.js';
import { setupNetwork } from './network.js';

/** A tap on a board square (or Enter on it, see a11y.js) goes to the draft or the match. */
function onBoardPointerdown(e) {
    const square = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('.square'));
    if (!square) return;
    const viewR = Number(square.dataset.vr);
    const viewC = Number(square.dataset.vc);
    if (state.gameState.startsWith('draft')) {
        (draftHooks.squareClick || handleDraftSquareClick)(viewR, viewC);
    } else if (state.gameState === 'gameplay') {
        handleGameplaySquareClick(viewR, viewC);
    }
}

export function setupEventListeners() {
    ui.chessboard.addEventListener('pointerdown', onBoardPointerdown);

    const btnStartLocal = document.getElementById('btn-start-local');
    if (btnStartLocal) {
        btnStartLocal.addEventListener('pointerdown', () => {
            state.currentRoomCode = null;
            state.isBotMatch = false;
            enterFullscreen();
            startDraftPhase(1);
        });
    }

    const btnStartBot = document.getElementById('btn-start-bot');
    if (btnStartBot) {
        btnStartBot.addEventListener('pointerdown', () => {
            ui.mainMenu.classList.add('hidden');
            ui.difficultyModal.classList.remove('hidden');
        });
    }

    const btnCloseDifficulty = document.getElementById('btn-close-difficulty');
    if (btnCloseDifficulty) {
        btnCloseDifficulty.addEventListener('pointerdown', () => {
            ui.difficultyModal.classList.add('hidden');
            ui.mainMenu.classList.remove('hidden');
        });
    }

    const diffButtons = document.querySelectorAll('.btn-difficulty');
    diffButtons.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            diffButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.botDifficultyLevel = btn.getAttribute('data-level');
        });
    });

    const archButtons = document.querySelectorAll('.btn-archetype');
    archButtons.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            archButtons.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.botArchetype = btn.getAttribute('data-arch');
        });
    });

    const btnConfirmCampaign = document.getElementById('btn-confirm-campaign');
    if (btnConfirmCampaign) {
        btnConfirmCampaign.addEventListener('pointerdown', () => {
            loadBotProfileForDifficulty(state.botDifficultyLevel);
            ui.difficultyModal.classList.add('hidden');
            
            state.currentRoomCode = null;
            state.isBotMatch = true;
            enterFullscreen();
            startDraftPhase(1);
        });
    }

    if (ui.btnShowTimer) {
        ui.btnShowTimer.addEventListener('pointerdown', () => {
            ui.mainMenu.classList.add('hidden');
            ui.timerModal.classList.remove('hidden');
        });
    }

    const timerToggleBtns = document.querySelectorAll('.timer-toggle-btn');
    timerToggleBtns.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            timerToggleBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            state.timerMode = btn.getAttribute('data-mode');
            
            if (state.timerMode === 'turn') {
                document.getElementById('timer-desc-turn').classList.remove('hidden');
                document.getElementById('timer-desc-overall').classList.add('hidden');
            } else {
                document.getElementById('timer-desc-turn').classList.add('hidden');
                document.getElementById('timer-desc-overall').classList.remove('hidden');
            }
        });
    });

    if (ui.btnSaveTimer) {
        ui.btnSaveTimer.addEventListener('pointerdown', () => {
            const m = parseInt(ui.timerMinInput.value) || 0;
            const s = parseInt(ui.timerSecInput.value) || 0;
            state.timerBaseSeconds = (m * 60) + s;
            if (state.timerBaseSeconds <= 0) state.timerBaseSeconds = 10; // Fallback
            
            ui.timerModal.classList.add('hidden');
            ui.mainMenu.classList.remove('hidden');
        });
    }

    const btnReady = document.getElementById('btn-ready');
    if (btnReady) {
        btnReady.addEventListener('pointerdown', handleTransitionReady);
    }

    const btnCreateRoom = document.getElementById('btn-create-room');
    const btnJoinRoom = document.getElementById('btn-join-room');
    const inputRoomCode = /** @type {HTMLInputElement} */ (document.getElementById('room-code-input'));

    if (btnCreateRoom) {
        btnCreateRoom.addEventListener('pointerdown', () => {
            if (!socket) return alert("Online mode is not available right now. Please launch the server.");
            enterFullscreen();
            // The creator's timer applies to both players; the server keeps the clock.
            socket.emit('createRoom', { timerMode: state.timerMode, timerSeconds: state.timerBaseSeconds });
        });
    }

    if (btnJoinRoom) {
        btnJoinRoom.addEventListener('pointerdown', () => {
            if (!socket) return alert("Online mode is not available right now. Please launch the server.");
            enterFullscreen();
            const code = inputRoomCode.value.trim().toUpperCase();
            if (code.length === 6) {
                socket.emit('joinRoom', code);
            } else {
                alert("Please enter a valid 6-letter code.");
            }
        });
    }

    setupNetwork(); // Socket.io handlers, see network.js
    
    ui.btnMainMenu.addEventListener('pointerdown', () => {
        if (state.currentRoomCode) {
            socket.emit('leaveRoom', { roomCode: state.currentRoomCode });
            state.currentRoomCode = null;
        }
        resetGame();
        showScreen(ui.mainMenu);
        ui.statusBar.textContent = "Welcome to Chessdown";
    });

    const btnRestart = /** @type {HTMLButtonElement} */ (document.getElementById('btn-restart'));
    if (btnRestart) {
        btnRestart.addEventListener('pointerdown', () => {
            if (state.currentRoomCode) {
                socket.emit('playAgainRequest', { roomCode: state.currentRoomCode });
                btnRestart.textContent = "Waiting... (1/2)";
                btnRestart.disabled = true;
            } else {
                // Fallback for local
                resetGame();
                startDraftPhase(1);
            }
        });
    }
    
    ui.btnHowToPlay.addEventListener('pointerdown', () => {
        showScreen(ui.rulesModal);
    });
    
    ui.btnCloseRules.addEventListener('pointerdown', () => {
        showScreen(ui.mainMenu);
    });
    
    ui.shopItems.forEach(item => {
        item.addEventListener('pointerdown', () => {
            if (state.removeMode) toggleRemoveMode();
            ui.shopItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            state.selectedDraftPiece = {
                type: item.dataset.type,
                cost: parseInt(item.dataset.cost)
            };
        });
    });

    ui.colorSwatches.forEach(swatch => {
        swatch.addEventListener('pointerdown', () => {
            if (swatch.classList.contains('disabled')) return;
            ui.colorSwatches.forEach(s => s.classList.remove('selected'));
            swatch.classList.add('selected');
            state.playerColors[state.currentPlayer] = swatch.dataset.color;
            updateShopColors();
            renderBoard(); // Update piece colors dynamically
            
            if (state.currentRoomCode) {
                socket.emit('colorSelected', { roomCode: state.currentRoomCode, player: state.myPlayerNumber, color: swatch.dataset.color });
            }
        });
    });

    ui.btnRemoveMode.addEventListener('pointerdown', toggleRemoveMode);
    ui.btnClearDraft.addEventListener('pointerdown', clearCurrentDraft);
    ui.btnValidateDraft.addEventListener('pointerdown', validateDraft);
}
