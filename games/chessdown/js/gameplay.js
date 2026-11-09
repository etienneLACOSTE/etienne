// @ts-check
// Gameplay: turns, timer, moves, end of game.
import { fireConfetti } from '../confetti.js';
import { COLOR_HEX, COLS, MAX_POINTS, ROWS, socket, state, ui } from './state.js';
import { clearHighlights, createBoardDOM, getSquareElement, highlightValidMoves, renderBoard, showScreen, startCoinFlip } from './board-view.js';
import { getBoardCoords, getViewCoords } from './coords.js';
import { chooseBotMove } from './bot.js';
import { announceTurn, resetAnnouncements } from './a11y.js';
import { checkTouchdownWin, makeVirtualMove, serializeBoard } from './rules-bridge.js';
import { reportResult } from '../../../assets/js/session.js';

// --- Gameplay Logic ---

export function startGameplay(winner) {
    resetAnnouncements(); // a11y.js
    state.gameState = 'gameplay';
    state.matchStartedAt = Date.now();
    state.positionHistory = {}; // Reset repetition history
    state.playerTimeRemaining[1] = state.timerBaseSeconds * 1000;
    state.playerTimeRemaining[2] = state.timerBaseSeconds * 1000;
    
    ui.statusBar.classList.add('hidden'); // Hide status bar during match
    
    ui.gameContainer.classList.remove('rotate-180');
    ui.gameContainer.classList.remove('draft-mode');
    
    ui.gameLayout.classList.remove('hidden');
    createBoardDOM(false);
    renderBoard();
    startCoinFlip(winner, finalizeGameplayStart);
}

export function finalizeGameplayStart() {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    ui.sideStatus.classList.remove('hidden'); // Show timer
    
    state.selectedBoardPiece = null;
    clearHighlights();
    renderBoard();
    startTurn();
}

export function startTurn() {
    if (checkTouchdownWin()) {
        const winner = state.currentPlayer;
        const winnerColorHex = COLOR_HEX[state.playerColors[winner]];
        
        if (state.myPlayerNumber === winner) {
            fireConfetti([winnerColorHex, '#f1c40f']);
            endGame('Victory!', `TOUCHDOWN! You survived in the endzone!`, winner, 'touchdown');
        } else {
            if (!state.currentRoomCode) {
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame('Victory!', `TOUCHDOWN! Player ${winner} survived in the endzone!`, winner, 'touchdown');
            } else {
                endGame('Defeat...', `TOUCHDOWN! Player ${winner} survived in the endzone!`, winner, 'touchdown');
            }
        }
        return;
    }
    
    const position = serializeBoard();
    state.positionHistory[position] = (state.positionHistory[position] || 0) + 1;
    if (state.positionHistory[position] >= 3) {
        const p1Color = COLOR_HEX[state.playerColors[1]];
        const p2Color = COLOR_HEX[state.playerColors[2]];
        fireConfetti([p1Color, p2Color], 30);
        endGame('DRAW', "by 3 repetitions", 0, 'repetition');
        return;
    }
    
    startTimer();

    if (state.isBotMatch && state.currentPlayer === 2 && state.gameState !== 'over') {
        setTimeout(playBotTurn, 500);
    }

    // Screen readers hear the move just played and whose turn it is (a11y.js).
    if (state.gameState === 'gameplay') announceTurn();
}

function playBotTurn() {
    if (state.gameState === 'over') return;
    const move = chooseBotMove();
    if (move) movePiece(move.fromR, move.fromC, move.toR, move.toC);
    else skipTurn();
}

export function formatTime(ms) {
    const totalSecs = Math.ceil(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function startTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    
    if (state.timerMode === 'turn') {
        state.timeLeft = state.timerBaseSeconds * 1000;
    }
    
    // Set hourglass flow direction
    // P1 (bottom) = flex-end (shrinks downwards)
    // P2 (top) = flex-start (shrinks upwards)
    ui.timerBarContainer.style.justifyContent = state.currentPlayer === 1 ? 'flex-end' : 'flex-start';

    // Setup initial bar color
    const hex = COLOR_HEX[state.playerColors[state.currentPlayer]];
    ui.timerBar.style.backgroundColor = hex;
    
    // Initial display
    const currentMs = state.timerMode === 'turn' ? state.timeLeft : state.playerTimeRemaining[state.currentPlayer];
    ui.timerBar.style.height = `${(currentMs / (state.timerBaseSeconds * 1000)) * 100}%`;
    ui.timerTextOverlay.textContent = formatTime(currentMs);

    state.timerInterval = setInterval(() => {
        if (state.timerMode === 'turn') {
            state.timeLeft -= 100;
            const percent = (state.timeLeft / (state.timerBaseSeconds * 1000)) * 100;
            ui.timerBar.style.height = `${percent}%`;
            ui.timerTextOverlay.textContent = formatTime(state.timeLeft);

            if (state.timeLeft <= 0) {
                clearInterval(state.timerInterval);
                skipTurn();
            }
        } else {
            // Overall Mode
            state.playerTimeRemaining[state.currentPlayer] -= 100;
            const percent = (state.playerTimeRemaining[state.currentPlayer] / (state.timerBaseSeconds * 1000)) * 100;
            ui.timerBar.style.height = `${percent}%`;
            ui.timerTextOverlay.textContent = formatTime(state.playerTimeRemaining[state.currentPlayer]);

            if (state.playerTimeRemaining[state.currentPlayer] <= 0) {
                clearInterval(state.timerInterval);
                const winner = state.currentPlayer === 1 ? 2 : 1;
                const winnerColorHex = COLOR_HEX[state.playerColors[winner]];
                fireConfetti([winnerColorHex, '#f1c40f']);
                endGame('Time Out!', `Player ${state.currentPlayer} ran out of time!`, winner, 'time');
            }
        }
    }, 100);
}

export function skipTurn() {
    clearHighlights();
    state.selectedBoardPiece = null;
    if (state.currentRoomCode) {
        // Online, the server decides: the player whose time ran out gives up the turn,
        // and both clients switch when the server announces it ('turnSkipped').
        if (state.currentPlayer === state.myPlayerNumber) socket.emit('skipTurn', { roomCode: state.currentRoomCode });
        return;
    }
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
    startTurn();
}

export function handleGameplaySquareClick(viewR, viewC) {
    if (state.isAnimating) return;
    if (state.currentRoomCode && state.currentPlayer !== state.myPlayerNumber) return; // Ignore if not our turn in online mode
    if (state.isBotMatch && state.currentPlayer === 2) return; // Block human clicks when bot is playing

    const { r, c } = getBoardCoords(viewR, viewC);
    const clickedPiece = state.board[r][c];
    const squareEl = getSquareElement(viewR, viewC);

    if (state.selectedBoardPiece && squareEl.classList.contains('highlight')) {
        if (state.currentRoomCode) {
            // Send move to server
            socket.emit('makeMove', {
                roomCode: state.currentRoomCode,
                from: { r: state.selectedBoardPiece.r, c: state.selectedBoardPiece.c },
                to: { r, c }
            });
            state.selectedBoardPiece = null;
            clearHighlights();
        } else {
            // Local mode
            movePiece(state.selectedBoardPiece.r, state.selectedBoardPiece.c, r, c);
        }
        return;
    }

    const activePlayer = state.currentRoomCode ? state.myPlayerNumber : state.currentPlayer;
    if (clickedPiece && clickedPiece.player === activePlayer) {
        state.selectedBoardPiece = { r, c, piece: clickedPiece };
        highlightValidMoves(r, c);
    } else {
        state.selectedBoardPiece = null;
        clearHighlights();
    }
}

export function movePiece(fromR, fromC, toR, toC) {
    if (state.isAnimating) return;
    
    const piece = state.board[fromR][fromC];
    const targetPiece = state.board[toR][toC];
    
    clearHighlights();
    state.selectedBoardPiece = null;

    // --- Animation Phase ---
    state.isAnimating = true;
    clearInterval(state.timerInterval); // Pause timer

    const { viewR: fVR, viewC: fVC } = getViewCoords(fromR, fromC);
    const { viewR: tVR, viewC: tVC } = getViewCoords(toR, toC);
    const fromSq = getSquareElement(fVR, fVC);
    const toSq = getSquareElement(tVR, tVC);

    if (fromSq && toSq) {
        const pieceIcon = /** @type {HTMLElement|null} */ (fromSq.querySelector('.piece-icon'));
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
        
        state.isAnimating = false;
        renderBoard();

        if (targetPiece && targetPiece.type === 'k') {
            const winner = state.currentPlayer;
            const winnerColorHex = COLOR_HEX[state.playerColors[winner]];
            fireConfetti([winnerColorHex, '#f1c40f']);
            endGame('Victory!', `Player ${winner} captured the King!`, winner, 'king');
            return;
        }

        state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
        startTurn();
    }, 300);
}

/**
 * @param {string} title @param {string} reason what the end screen says
 * @param {number} winner 1 or 2, or 0 for a draw
 * @param {'king' | 'touchdown' | 'time' | 'repetition'} [how] for the stats
 */
export function endGame(title, reason, winner, how) {
    state.gameState = 'over';
    clearInterval(state.timerInterval);
    // Against the bot or on the same screen, the signed-in player is player 1 (online,
    // the server records the result).
    if (!state.currentRoomCode && state.account && how) {
        reportResult({
            game: 'chessdown',
            mode: state.isBotMatch ? 'bot' : 'local',
            result: winner === 0 ? 'draw' : winner === 1 ? 'win' : 'loss',
            reason: how,
            opponent: state.isBotMatch ? `Bot (${state.botDifficultyLevel || 'master'})` : 'Player 2',
            startedAt: state.matchStartedAt,
        });
    }
    ui.victoryTitle.textContent = title;
    ui.victoryReason.textContent = reason;
    
    const canvas = document.getElementById('confetti-canvas');
    if (!state.currentRoomCode && winner === 2 && !state.isBotMatch) {
        ui.victoryScreen.classList.add('rotate-180');
        if (canvas) canvas.classList.add('rotate-180');
    } else {
        ui.victoryScreen.classList.remove('rotate-180');
        if (canvas) canvas.classList.remove('rotate-180');
    }
    
    showScreen(ui.victoryScreen);
}

export function resetGame() {
    clearInterval(state.timerInterval);
    ui.sideStatus.classList.add('hidden');
    ui.gameContainer.classList.remove('rotate-180');
    ui.victoryScreen.classList.remove('rotate-180');
    const canvas = document.getElementById('confetti-canvas');
    if (canvas) canvas.classList.remove('rotate-180');
    state.board = Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    state.draftPoints = { 1: MAX_POINTS, 2: MAX_POINTS };
    state.kingsPlaced = { 1: false, 2: false };
    state.selectedDraftPiece = null;
    state.lastMove = null;
    state.currentDraftIndex = 0;
    state.positionHistory = {};
}
