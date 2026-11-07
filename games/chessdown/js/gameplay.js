// Gameplay: turns, timer, moves, end of game.

// --- Gameplay Logic ---

function startGameplay(winner) {
    gameState = 'gameplay';
    positionHistory = {}; // Reset repetition history
    playerTimeRemaining[1] = timerBaseSeconds * 1000;
    playerTimeRemaining[2] = timerBaseSeconds * 1000;
    
    ui.statusBar.classList.add('hidden'); // Hide status bar during match
    
    ui.gameContainer.classList.remove('rotate-180');
    ui.gameContainer.classList.remove('draft-mode');
    
    ui.gameLayout.classList.remove('hidden');
    createBoardDOM(false);
    renderBoard();
    startCoinFlip(winner);
}

function finalizeGameplayStart() {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    ui.sideStatus.classList.remove('hidden'); // Show timer
    
    selectedBoardPiece = null;
    clearHighlights();
    renderBoard();
    startTurn();
}

function startTurn() {
    if (checkTouchdownWin()) {
        const winner = currentPlayer;
        const winnerColorHex = COLOR_HEX[playerColors[winner]];
        
        if (myPlayerNumber === winner) {
            fireConfetti([winnerColorHex, '#f1c40f']);
            endGame('Victory!', `TOUCHDOWN! You survived in the endzone!`, winner);
        } else {
            if (!currentRoomCode) {
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame('Victory!', `TOUCHDOWN! Player ${winner} survived in the endzone!`, winner);
            } else {
                endGame('Defeat...', `TOUCHDOWN! Player ${winner} survived in the endzone!`, winner);
            }
        }
        return;
    }
    
    const state = serializeBoard();
    positionHistory[state] = (positionHistory[state] || 0) + 1;
    if (positionHistory[state] >= 3) {
        const p1Color = COLOR_HEX[playerColors[1]];
        const p2Color = COLOR_HEX[playerColors[2]];
        fireConfetti([p1Color, p2Color], 30);
        endGame('DRAW', "by 3 repetitions", 0);
        return;
    }
    
    startTimer();

    if (isBotMatch && currentPlayer === 2 && gameState !== 'over') {
        setTimeout(playBotTurn, 500);
    }
}

function formatTime(ms) {
    const totalSecs = Math.ceil(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    if (timerMode === 'turn') {
        timeLeft = timerBaseSeconds * 1000;
    }
    
    // Set hourglass flow direction
    // P1 (bottom) = flex-end (shrinks downwards)
    // P2 (top) = flex-start (shrinks upwards)
    ui.timerBarContainer.style.justifyContent = currentPlayer === 1 ? 'flex-end' : 'flex-start';

    // Setup initial bar color
    const hex = COLOR_HEX[playerColors[currentPlayer]];
    ui.timerBar.style.backgroundColor = hex;
    
    // Initial display
    const currentMs = timerMode === 'turn' ? timeLeft : playerTimeRemaining[currentPlayer];
    ui.timerBar.style.height = `${(currentMs / (timerBaseSeconds * 1000)) * 100}%`;
    ui.timerTextOverlay.textContent = formatTime(currentMs);

    timerInterval = setInterval(() => {
        if (timerMode === 'turn') {
            timeLeft -= 100;
            const percent = (timeLeft / (timerBaseSeconds * 1000)) * 100;
            ui.timerBar.style.height = `${percent}%`;
            ui.timerTextOverlay.textContent = formatTime(timeLeft);

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                skipTurn();
            }
        } else {
            // Overall Mode
            playerTimeRemaining[currentPlayer] -= 100;
            const percent = (playerTimeRemaining[currentPlayer] / (timerBaseSeconds * 1000)) * 100;
            ui.timerBar.style.height = `${percent}%`;
            ui.timerTextOverlay.textContent = formatTime(playerTimeRemaining[currentPlayer]);

            if (playerTimeRemaining[currentPlayer] <= 0) {
                clearInterval(timerInterval);
                const winner = currentPlayer === 1 ? 2 : 1;
                const winnerColorHex = COLOR_HEX[playerColors[winner]];
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame('Time Out!', `Player ${currentPlayer} ran out of time!`, winner);
            }
        }
    }, 100);
}

function skipTurn() {
    clearHighlights();
    selectedBoardPiece = null;
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    startTurn();
}

function handleGameplaySquareClick(viewR, viewC) {
    if (isAnimating) return;
    if (currentRoomCode && currentPlayer !== myPlayerNumber) return; // Ignore if not our turn in online mode
    if (isBotMatch && currentPlayer === 2) return; // Block human clicks when bot is playing

    const { r, c } = getBoardCoords(viewR, viewC);
    const clickedPiece = board[r][c];
    const squareEl = getSquareElement(viewR, viewC);

    if (selectedBoardPiece && squareEl.classList.contains('highlight')) {
        if (currentRoomCode) {
            // Send move to server
            socket.emit('makeMove', {
                roomCode: currentRoomCode,
                from: { r: selectedBoardPiece.r, c: selectedBoardPiece.c },
                to: { r, c }
            });
            selectedBoardPiece = null;
            clearHighlights();
        } else {
            // Local mode
            movePiece(selectedBoardPiece.r, selectedBoardPiece.c, r, c);
        }
        return;
    }

    const activePlayer = currentRoomCode ? myPlayerNumber : currentPlayer;
    if (clickedPiece && clickedPiece.player === activePlayer) {
        selectedBoardPiece = { r, c, piece: clickedPiece };
        highlightValidMoves(r, c);
    } else {
        selectedBoardPiece = null;
        clearHighlights();
    }
}

function movePiece(fromR, fromC, toR, toC) {
    if (isAnimating) return;
    
    const piece = board[fromR][fromC];
    const targetPiece = board[toR][toC];
    
    clearHighlights();
    selectedBoardPiece = null;

    // --- Animation Phase ---
    isAnimating = true;
    clearInterval(timerInterval); // Pause timer

    const { viewR: fVR, viewC: fVC } = getViewCoords(fromR, fromC);
    const { viewR: tVR, viewC: tVC } = getViewCoords(toR, toC);
    const fromSq = getSquareElement(fVR, fVC);
    const toSq = getSquareElement(tVR, tVC);

    if (fromSq && toSq) {
        const pieceIcon = fromSq.querySelector('.piece-icon');
        if (pieceIcon) {
            // Find target center
            const rectFrom = fromSq.getBoundingClientRect();
            const rectTo = toSq.getBoundingClientRect();
            const dx = rectTo.left - rectFrom.left;
            const dy = rectTo.top - rectFrom.top;

            // Make it pop up above other pieces
            pieceIcon.style.zIndex = '100';
            pieceIcon.style.position = 'relative';
            
            // Trigger hardware-accelerated transition
            requestAnimationFrame(() => {
                pieceIcon.style.transition = 'transform 0.3s ease-in-out';
                pieceIcon.style.transform = `translate(${dx}px, ${dy}px)`;
            });
        }
    }

    // --- Resolution Phase (After 300ms) ---
    setTimeout(() => {
        makeVirtualMove({ fromR, fromC, toR, toC }); // Also handles en passant and lastMove
        
        isAnimating = false;
        renderBoard();

        if (targetPiece && targetPiece.type === 'k') {
            const winner = currentPlayer;
            const winnerColorHex = COLOR_HEX[playerColors[winner]];
            fireConfetti([winnerColorHex, '#f1c40f']);
            endGame('Victory!', `Player ${winner} captured the King!`, winner);
            return;
        }

        currentPlayer = currentPlayer === 1 ? 2 : 1;
        startTurn();
    }, 300);
}

function endGame(title, reason, winner) {
    gameState = 'over';
    clearInterval(timerInterval);
    ui.victoryTitle.textContent = title;
    ui.victoryReason.textContent = reason;
    
    const canvas = document.getElementById('confetti-canvas');
    if (!currentRoomCode && winner === 2 && !isBotMatch) {
        ui.victoryScreen.classList.add('rotate-180');
        if (canvas) canvas.classList.add('rotate-180');
    } else {
        ui.victoryScreen.classList.remove('rotate-180');
        if (canvas) canvas.classList.remove('rotate-180');
    }
    
    showScreen(ui.victoryScreen);
}

function resetGame() {
    clearInterval(timerInterval);
    ui.sideStatus.classList.add('hidden');
    ui.gameContainer.classList.remove('rotate-180');
    ui.victoryScreen.classList.remove('rotate-180');
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) canvas.classList.remove('rotate-180');
    board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    draftPoints = { 1: MAX_POINTS, 2: MAX_POINTS };
    kingsPlaced = { 1: false, 2: false };
    selectedDraftPiece = null;
    lastMove = null;
    currentDraftIndex = 0;
    positionHistory = {};
}
