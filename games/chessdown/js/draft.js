// @ts-check
// Draft phase: buying and placing pieces, colours, validation.
import { COLS, MAX_POINTS, PIECES, socket, state, ui } from './state.js';
import { createBoardDOM, getBoardCoords, getDraftZoneView, renderBoard, showScreen } from './board-view.js';
import { handleGameplaySquareClick, startGameplay } from './gameplay.js';
import { autoDraftBot } from './bot.js';

// --- Draft Logic ---

export function toggleRemoveMode() {
    state.removeMode = !state.removeMode;
    ui.btnRemoveMode.textContent = state.removeMode ? "Remove Mode: ON" : "Remove Mode: OFF";
    ui.btnRemoveMode.classList.toggle('btn-danger', state.removeMode);
    ui.btnRemoveMode.classList.toggle('btn-secondary', !state.removeMode);
    if (state.removeMode) {
        state.selectedDraftPiece = null;
        ui.shopItems.forEach(i => i.classList.remove('selected'));
    }
}

export function showTransitionScreen() {
    ui.gameLayout.classList.add('hidden');
    ui.draftHeader.classList.add('hidden');
    ui.draftFooter.classList.add('hidden');
    ui.transitionTitle.textContent = `Player ${state.currentPlayer}'s Turn`;
    ui.statusBar.textContent = `Waiting for Player ${state.currentPlayer}`;
    showScreen(ui.transitionScreen);
}

export function startDraftPhase(player) {
    state.currentPlayer = player;
    state.gameState = `draft${player}`;
    
    if (!state.currentRoomCode) {
        if (player === 2) {
            ui.gameContainer.classList.add('rotate-180');
        } else {
            ui.gameContainer.classList.remove('rotate-180');
        }
    }
    
    ui.statusBar.classList.remove('hidden'); // Ensure visible
    
    if (!state.currentRoomCode && player === 2) {
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

export function handleTransitionReady() {
    showScreen(ui.draftHeader);
    ui.draftFooter.classList.remove('hidden'); // Also show footer
    ui.gameLayout.classList.remove('hidden');
    ui.gameContainer.classList.add('draft-mode');
    createBoardDOM(true);
    setupColorPicker();
    updateShopColors();
    updateDraftUI();
    renderBoard();
    ui.statusBar.textContent = `Draft Phase: Player ${state.currentPlayer}`;
}

export function updateShopColors() {
    ui.shopItems.forEach(item => {
        item.className = item.className.replace(/jersey-\w+/g, '');
        item.classList.add(`jersey-${state.playerColors[state.currentPlayer]}`);
    });
}

export function setupColorPicker() {
    ui.colorSwatches.forEach(s => s.classList.remove('disabled', 'selected'));

    const opponentPlayer = state.currentRoomCode ? (state.myPlayerNumber === 1 ? 2 : 1) : (state.currentPlayer === 1 ? 2 : 1);
    const opponentColor = state.playerColors[opponentPlayer];
    
    // Disable opponent's color
    const disabledSwatch = document.querySelector(`.color-swatch[data-color="${opponentColor}"]`);
    if (disabledSwatch) disabledSwatch.classList.add('disabled');

    // Auto select a different default color if current is disabled
    if (state.playerColors[state.currentPlayer] === opponentColor) {
        const available = /** @type {HTMLElement|null} */ (document.querySelector(`.color-swatch:not(.disabled)`));
        if (available) {
            state.playerColors[state.currentPlayer] = available.dataset.color;
            updateShopColors();
            renderBoard();
            if (state.currentRoomCode) {
                socket.emit('colorSelected', { roomCode: state.currentRoomCode, player: state.myPlayerNumber, color: state.playerColors[state.currentPlayer] });
            }
        }
    }

    // Select current player's color
    const activeSwatch = document.querySelector(`.color-swatch[data-color="${state.playerColors[state.currentPlayer]}"]`);
    if (activeSwatch) activeSwatch.classList.add('selected');
}

export function updateDraftUI() {
    ui.draftPointsSpan.textContent = state.draftPoints[state.currentPlayer];
    
    ui.shopItems.forEach(item => {
        const cost = parseInt(item.dataset.cost);
        const type = item.dataset.type;
        
        if (cost > state.draftPoints[state.currentPlayer] && type !== 'k') {
            item.classList.add('disabled');
        } else if (type === 'k' && state.kingsPlaced[state.currentPlayer]) {
            item.classList.add('disabled');
        } else {
            item.classList.remove('disabled');
        }
    });

    if (state.selectedDraftPiece) {
        const activeShopItem = document.querySelector(`.shop-item[data-type="${state.selectedDraftPiece.type}"]`);
        if (activeShopItem && activeShopItem.classList.contains('disabled')) {
            activeShopItem.classList.remove('selected');
            state.selectedDraftPiece = null;
        }
    }

    ui.btnValidateDraft.disabled = !state.kingsPlaced[state.currentPlayer];
}

export function handleSquareClick(viewR, viewC) {
    if (state.gameState.startsWith('draft')) {
        (draftHooks.squareClick || handleDraftSquareClick)(viewR, viewC);
    } else if (state.gameState === 'gameplay') {
        handleGameplaySquareClick(viewR, viewC);
    }
}

/** The tutorial (demo.js) can take over the draft square clicks. */
export const draftHooks = { /** @type {((viewR: number, viewC: number) => void) | null} */ squareClick: null };

export function handleDraftSquareClick(viewR, viewC) {
    const zone = getDraftZoneView();
    if (viewR < zone.min || viewR > zone.max) {
        // Blink row or square in red
        const squares = /** @type {HTMLCollectionOf<HTMLElement>} */ (ui.chessboard.children);
        for (let c = 0; c < COLS; c++) {
            const sq = squares[viewR * COLS + c];
            sq.classList.remove('error-blink');
            void sq.offsetWidth; // trigger reflow
            sq.classList.add('error-blink');
        }
        return; // Outside draft zone
    }

    const { r, c } = getBoardCoords(viewR, viewC);
    const currentPiece = state.board[r][c];

    if (state.removeMode) {
        if (currentPiece && currentPiece.player === state.currentPlayer) {
            state.draftPoints[state.currentPlayer] += PIECES[currentPiece.type].value;
            if (currentPiece.type === 'k') state.kingsPlaced[state.currentPlayer] = false;
            state.board[r][c] = null;
            updateDraftUI();
            renderBoard();
        }
        return;
    }

    if (!state.selectedDraftPiece) return;

    if (currentPiece) {
        if (currentPiece.player === state.currentPlayer) {
            state.draftPoints[state.currentPlayer] += PIECES[currentPiece.type].value;
            if (currentPiece.type === 'k') state.kingsPlaced[state.currentPlayer] = false;
            state.board[r][c] = null;
        } else {
            return;
        }
    }

    if (state.selectedDraftPiece.type === 'k' && state.kingsPlaced[state.currentPlayer]) return;
    if (state.draftPoints[state.currentPlayer] >= state.selectedDraftPiece.cost) {
        state.board[r][c] = {
            type: state.selectedDraftPiece.type,
            player: state.currentPlayer,
            hasMoved: false
        };
        state.draftPoints[state.currentPlayer] -= state.selectedDraftPiece.cost;
        if (state.selectedDraftPiece.type === 'k') state.kingsPlaced[state.currentPlayer] = true;
        
        updateDraftUI();
        renderBoard();
    }
}

export function clearCurrentDraft() {
    const zone = getDraftZoneView();
    for (let viewR = zone.min; viewR <= zone.max; viewR++) {
        for (let viewC = 0; viewC < COLS; viewC++) {
            const { r, c } = getBoardCoords(viewR, viewC);
            if (state.board[r][c] && state.board[r][c].player === state.currentPlayer) {
                state.board[r][c] = null;
            }
        }
    }
    state.draftPoints[state.currentPlayer] = MAX_POINTS;
    state.kingsPlaced[state.currentPlayer] = false;
    updateDraftUI();
    renderBoard();
}

export function validateDraft() {
    if (!state.kingsPlaced[state.currentPlayer]) return; // Extra safeguard against disabled buttons bypassing via pointerdown

    if (state.currentRoomCode) {
        // Extract pieces for myPlayerNumber
        const myPieces = [];
        const zone = getDraftZoneView();
        for (let viewR = zone.min; viewR <= zone.max; viewR++) {
            for (let viewC = 0; viewC < COLS; viewC++) {
                const { r, c } = getBoardCoords(viewR, viewC);
                if (state.board[r][c] && state.board[r][c].player === state.myPlayerNumber) {
                    myPieces.push({ r, c, type: state.board[r][c].type });
                }
            }
        }
        
        socket.emit('draftComplete', {
            roomCode: state.currentRoomCode,
            player: state.myPlayerNumber,
            color: state.playerColors[state.myPlayerNumber],
            pieces: myPieces
        });

        // Hide draft UI and show waiting message
        ui.draftHeader.classList.add('hidden');
        ui.draftFooter.classList.add('hidden');
        ui.statusBar.textContent = "Waiting for opponent to finish drafting...";
        ui.btnValidateDraft.disabled = true;
    } else {
        if (state.currentPlayer === 1) {
            if (state.isBotMatch) {
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
