// UI event wiring for menus, modals, draft shop and buttons.

function setupEventListeners() {
    const btnStartLocal = document.getElementById('btn-start-local');
    if (btnStartLocal) {
        btnStartLocal.addEventListener('pointerdown', () => {
            currentRoomCode = null;
            isBotMatch = false;
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
            e.target.classList.add('selected');
            botDifficultyLevel = e.target.getAttribute('data-level');
        });
    });

    const archButtons = document.querySelectorAll('.btn-archetype');
    archButtons.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            archButtons.forEach(b => b.classList.remove('selected'));
            e.target.classList.add('selected');
            botArchetype = e.target.getAttribute('data-arch');
        });
    });

    const btnConfirmCampaign = document.getElementById('btn-confirm-campaign');
    if (btnConfirmCampaign) {
        btnConfirmCampaign.addEventListener('pointerdown', () => {
            loadBotProfileForDifficulty(botDifficultyLevel);
            ui.difficultyModal.classList.add('hidden');
            
            currentRoomCode = null;
            isBotMatch = true;
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
            e.target.classList.add('selected');
            timerMode = e.target.getAttribute('data-mode');
            
            if (timerMode === 'turn') {
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
            timerBaseSeconds = (m * 60) + s;
            if (timerBaseSeconds <= 0) timerBaseSeconds = 10; // Fallback
            
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
    const inputRoomCode = document.getElementById('room-code-input');

    if (btnCreateRoom) {
        btnCreateRoom.addEventListener('pointerdown', () => {
            if (!socket) return alert("Online mode is not available right now. Please launch the server.");
            enterFullscreen();
            socket.emit('createRoom');
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
        if (currentRoomCode) {
            socket.emit('leaveRoom', { roomCode: currentRoomCode });
            currentRoomCode = null;
        }
        resetGame();
        showScreen(ui.mainMenu);
        ui.statusBar.textContent = "Welcome to Chessdown";
    });

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
        btnRestart.addEventListener('pointerdown', () => {
            if (currentRoomCode) {
                socket.emit('playAgainRequest', { roomCode: currentRoomCode });
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
            if (removeMode) toggleRemoveMode();
            ui.shopItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedDraftPiece = {
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
            playerColors[currentPlayer] = swatch.dataset.color;
            updateShopColors();
            renderBoard(); // Update piece colors dynamically
            
            if (currentRoomCode) {
                socket.emit('colorSelected', { roomCode: currentRoomCode, player: myPlayerNumber, color: swatch.dataset.color });
            }
        });
    });

    ui.btnRemoveMode.addEventListener('pointerdown', toggleRemoveMode);
    ui.btnClearDraft.addEventListener('pointerdown', clearCurrentDraft);
    ui.btnValidateDraft.addEventListener('pointerdown', validateDraft);
}
