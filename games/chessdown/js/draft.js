// Draft phase: buying and placing pieces, colours, validation.

// --- Draft Logic ---

function toggleRemoveMode() {
    removeMode = !removeMode;
    ui.btnRemoveMode.textContent = removeMode ? "Remove Mode: ON" : "Remove Mode: OFF";
    ui.btnRemoveMode.classList.toggle('btn-danger', removeMode);
    ui.btnRemoveMode.classList.toggle('btn-secondary', !removeMode);
    if (removeMode) {
        selectedDraftPiece = null;
        ui.shopItems.forEach(i => i.classList.remove('selected'));
    }
}

function showTransitionScreen() {
    ui.gameLayout.classList.add('hidden');
    ui.draftHeader.classList.add('hidden');
    ui.draftFooter.classList.add('hidden');
    ui.transitionTitle.textContent = `Player ${currentPlayer}'s Turn`;
    ui.statusBar.textContent = `Waiting for Player ${currentPlayer}`;
    showScreen(ui.transitionScreen);
}

function startDraftPhase(player) {
    currentPlayer = player;
    gameState = `draft${player}`;
    
    if (!currentRoomCode) {
        if (player === 2) {
            ui.gameContainer.classList.add('rotate-180');
        } else {
            ui.gameContainer.classList.remove('rotate-180');
        }
    }
    
    ui.statusBar.classList.remove('hidden'); // Ensure visible
    
    if (!currentRoomCode && player === 2) {
        showTransitionScreen();
    } else {
        // Bypass the old transition screen, go straight to drafting!
        showScreen(ui.draftHeader);
        ui.draftFooter.classList.remove('hidden');
        ui.gameLayout.classList.remove('hidden');
        ui.gameContainer.classList.add('draft-mode');
        createBoardDOM(true);
        setupColorPicker();
        updateShopColors();
        updateDraftUI();
        renderBoard();
        ui.statusBar.textContent = `Draft Phase: Build your army!`;
    }
}

function handleTransitionReady() {
    showScreen(ui.draftHeader);
    ui.draftFooter.classList.remove('hidden'); // Also show footer
    ui.gameLayout.classList.remove('hidden');
    ui.gameContainer.classList.add('draft-mode');
    createBoardDOM(true);
    setupColorPicker();
    updateShopColors();
    updateDraftUI();
    renderBoard();
    ui.statusBar.textContent = `Draft Phase: Player ${currentPlayer}`;
}

function updateShopColors() {
    ui.shopItems.forEach(item => {
        item.className = item.className.replace(/jersey-\w+/g, '');
        item.classList.add(`jersey-${playerColors[currentPlayer]}`);
    });
}

function setupColorPicker() {
    ui.colorSwatches.forEach(s => s.classList.remove('disabled', 'selected'));

    const opponentPlayer = currentRoomCode ? (myPlayerNumber === 1 ? 2 : 1) : (currentPlayer === 1 ? 2 : 1);
    const opponentColor = playerColors[opponentPlayer];
    
    // Disable opponent's color
    const disabledSwatch = document.querySelector(`.color-swatch[data-color="${opponentColor}"]`);
    if (disabledSwatch) disabledSwatch.classList.add('disabled');

    // Auto select a different default color if current is disabled
    if (playerColors[currentPlayer] === opponentColor) {
        const available = document.querySelector(`.color-swatch:not(.disabled)`);
        if (available) {
            playerColors[currentPlayer] = available.dataset.color;
            updateShopColors();
            renderBoard();
            if (currentRoomCode) {
                socket.emit('colorSelected', { roomCode: currentRoomCode, player: myPlayerNumber, color: playerColors[currentPlayer] });
            }
        }
    }

    // Select current player's color
    const activeSwatch = document.querySelector(`.color-swatch[data-color="${playerColors[currentPlayer]}"]`);
    if (activeSwatch) activeSwatch.classList.add('selected');
}

function updateDraftUI() {
    ui.draftPointsSpan.textContent = draftPoints[currentPlayer];
    
    ui.shopItems.forEach(item => {
        const cost = parseInt(item.dataset.cost);
        const type = item.dataset.type;
        
        if (cost > draftPoints[currentPlayer] && type !== 'k') {
            item.classList.add('disabled');
        } else if (type === 'k' && kingsPlaced[currentPlayer]) {
            item.classList.add('disabled');
        } else {
            item.classList.remove('disabled');
        }
    });

    if (selectedDraftPiece) {
        const activeShopItem = document.querySelector(`.shop-item[data-type="${selectedDraftPiece.type}"]`);
        if (activeShopItem && activeShopItem.classList.contains('disabled')) {
            activeShopItem.classList.remove('selected');
            selectedDraftPiece = null;
        }
    }

    ui.btnValidateDraft.disabled = !kingsPlaced[currentPlayer];
}

function handleSquareClick(viewR, viewC) {
    if (gameState.startsWith('draft')) {
        handleDraftSquareClick(viewR, viewC);
    } else if (gameState === 'gameplay') {
        handleGameplaySquareClick(viewR, viewC);
    }
}

function handleDraftSquareClick(viewR, viewC) {
    const zone = getDraftZoneView();
    if (viewR < zone.min || viewR > zone.max) {
        // Blink row or square in red
        const squares = ui.chessboard.children;
        for (let c = 0; c < COLS; c++) {
            const sq = squares[viewR * COLS + c];
            sq.classList.remove('error-blink');
            void sq.offsetWidth; // trigger reflow
            sq.classList.add('error-blink');
        }
        return; // Outside draft zone
    }

    const { r, c } = getBoardCoords(viewR, viewC);
    const currentPiece = board[r][c];

    if (removeMode) {
        if (currentPiece && currentPiece.player === currentPlayer) {
            draftPoints[currentPlayer] += PIECES[currentPiece.type].value;
            if (currentPiece.type === 'k') kingsPlaced[currentPlayer] = false;
            board[r][c] = null;
            updateDraftUI();
            renderBoard();
        }
        return;
    }

    if (!selectedDraftPiece) return;

    if (currentPiece) {
        if (currentPiece.player === currentPlayer) {
            draftPoints[currentPlayer] += PIECES[currentPiece.type].value;
            if (currentPiece.type === 'k') kingsPlaced[currentPlayer] = false;
            board[r][c] = null;
        } else {
            return;
        }
    }

    if (selectedDraftPiece.type === 'k' && kingsPlaced[currentPlayer]) return;
    if (draftPoints[currentPlayer] >= selectedDraftPiece.cost) {
        board[r][c] = {
            type: selectedDraftPiece.type,
            player: currentPlayer,
            hasMoved: false
        };
        draftPoints[currentPlayer] -= selectedDraftPiece.cost;
        if (selectedDraftPiece.type === 'k') kingsPlaced[currentPlayer] = true;
        
        updateDraftUI();
        renderBoard();
    }
}

function clearCurrentDraft() {
    const zone = getDraftZoneView();
    for (let viewR = zone.min; viewR <= zone.max; viewR++) {
        for (let viewC = 0; viewC < COLS; viewC++) {
            const { r, c } = getBoardCoords(viewR, viewC);
            if (board[r][c] && board[r][c].player === currentPlayer) {
                board[r][c] = null;
            }
        }
    }
    draftPoints[currentPlayer] = MAX_POINTS;
    kingsPlaced[currentPlayer] = false;
    updateDraftUI();
    renderBoard();
}

function validateDraft() {
    if (!kingsPlaced[currentPlayer]) return; // Extra safeguard against disabled buttons bypassing via pointerdown

    if (currentRoomCode) {
        // Extract pieces for myPlayerNumber
        const myPieces = [];
        const zone = getDraftZoneView();
        for (let viewR = zone.min; viewR <= zone.max; viewR++) {
            for (let viewC = 0; viewC < COLS; viewC++) {
                const { r, c } = getBoardCoords(viewR, viewC);
                if (board[r][c] && board[r][c].player === myPlayerNumber) {
                    myPieces.push({ r, c, type: board[r][c].type });
                }
            }
        }
        
        socket.emit('draftComplete', {
            roomCode: currentRoomCode,
            player: myPlayerNumber,
            color: playerColors[myPlayerNumber],
            pieces: myPieces
        });

        // Hide draft UI and show waiting message
        ui.draftHeader.classList.add('hidden');
        ui.draftFooter.classList.add('hidden');
        ui.statusBar.textContent = "Waiting for opponent to finish drafting...";
        ui.btnValidateDraft.disabled = true;
    } else {
        if (currentPlayer === 1) {
            if (isBotMatch) {
                autoDraftBot();
                ui.draftHeader.classList.add('hidden');
                ui.draftFooter.classList.add('hidden');
                const winner = Math.random() < 0.5 ? 1 : 2;
                startGameplay(winner);
            } else {
                startDraftPhase(2);
            }
        } else {
            // Both drafted! Start coin flip.
            ui.draftHeader.classList.add('hidden');
            ui.draftFooter.classList.add('hidden');
            const winner = Math.random() < 0.5 ? 1 : 2;
            startGameplay(winner);
        }
    }
}
