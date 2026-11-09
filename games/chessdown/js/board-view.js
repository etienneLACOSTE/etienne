// @ts-check
// Drawing only: screens, the board, highlights and the coin flip. Square clicks are
// routed by events.js (one listener on the board), never wired here.
import { COLS, PIECES, ROWS, state, ui } from './state.js';
import { getBoardCoords, getDraftZoneView, getViewCoords } from './coords.js';
import { enhanceBoardSquares, focusScreen, refreshSquareLabels } from './a11y.js';
import { getValidMoves } from './rules-bridge.js';

export function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    screen.classList.remove('hidden');
    focusScreen(screen); // a11y.js
}

export function enterFullscreen() {
    const elem = /** @type {any} */ (document.documentElement); // webkit prefix on old Safari
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(err => console.log(err));
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    }
    
    // Lock orientation to portrait if supported
    const orientation = /** @type {any} */ (screen.orientation); // lock() is not in every browser
    if (orientation && orientation.lock) {
        orientation.lock("portrait").catch(err => console.log("Orientation lock not supported:", err));
    }
}

export function createBoardDOM(isDraft) {
    ui.chessboard.innerHTML = '';
    const viewRows = isDraft ? 6 : ROWS;
    
    ui.chessboard.style.gridTemplateRows = `repeat(${viewRows}, minmax(0, 1fr))`;
    ui.chessboard.style.aspectRatio = isDraft ? '1 / 1' : '1 / 2';
    ui.chessboard.style.maxWidth = isDraft ? 'min(100%, 45vh)' : 'min(100%, 45vh)';

    // Hide endzones during draft
    if (isDraft) {
        ui.endzoneTop.classList.add('hidden');
        ui.endzoneBottom.classList.add('hidden');
    } else {
        ui.endzoneTop.classList.remove('hidden');
        ui.endzoneBottom.classList.remove('hidden');
        // Set endzone colors based on jerseys
        if (state.myPlayerNumber === 2) {
            ui.endzoneTop.className = `endzone endzone-${state.playerColors[1]}`;
            ui.endzoneBottom.className = `endzone endzone-${state.playerColors[2]}`;
        } else {
            ui.endzoneTop.className = `endzone endzone-${state.playerColors[2]}`;
            ui.endzoneBottom.className = `endzone endzone-${state.playerColors[1]}`;
        }
    }

    for (let viewR = 0; viewR < viewRows; viewR++) {
        for (let viewC = 0; viewC < COLS; viewC++) {
            const square = document.createElement('div');
            square.classList.add('square');
            // Checkerboard pattern
            if ((viewR + viewC) % 2 === 0) square.classList.add('light');
            else square.classList.add('dark');
            
            // Yard lines only in full gameplay mode
            if (!isDraft) {
                if (viewR === 2 || viewR === 5 || viewR === 8) square.classList.add('yard-line-bottom');
                if (viewR === 3 || viewR === 6 || viewR === 9) square.classList.add('yard-line-top');
            } else {
                // In draft mode, we show a red line above row 3
                if (viewR === 3) square.classList.add('draft-limit');
            }

            square.dataset.vr = String(viewR);
            square.dataset.vc = String(viewC);
            ui.chessboard.appendChild(square);
        }
    }
    enhanceBoardSquares(); // a11y.js
}

// --- Coin Flip ---

/** Spin the coin, then call `onLanded` once the starting player is shown. */
export function startCoinFlip(winner, onLanded) {
    showScreen(ui.coinFlipScreen);
    
    // Apply chosen colors to the coin faces
    ui.coinFront.className = `coin-face coin-front endzone-${state.playerColors[1]}`;
    ui.coinBack.className = `coin-face coin-back endzone-${state.playerColors[2]}`;
    
    // Reset rotation before spinning
    ui.coin.style.transition = 'none';
    ui.coin.style.transform = `rotateY(0deg)`;
    
    // Force reflow
    void ui.coin.offsetWidth;

    // Determine winner from server
    const result = winner;
    const spinDegrees = result === 1 ? 3600 : 3780; // 10 spins instead of 5

    ui.coin.style.transition = 'transform 2s cubic-bezier(0.2, 0.8, 0.2, 1)';
    ui.coin.style.transform = `rotateY(${spinDegrees}deg)`;

    const coinContainer = /** @type {HTMLElement} */ (ui.coinFlipScreen.querySelector('.coin-container'));
    coinContainer.style.animation = 'none';
    void coinContainer.offsetWidth;
    coinContainer.style.animation = 'coinThrow 2s ease-in-out forwards';

    setTimeout(() => {
        state.currentPlayer = result; // Set starting player
        setTimeout(onLanded, 1000); // 1 second pause to see result then start
    }, 2000);
}

export function renderBoard() {
    const squares = ui.chessboard.children;
    const viewRows = state.gameState === 'gameplay' ? ROWS : 6;
    const draftZone = state.gameState !== 'gameplay' ? getDraftZoneView() : null;

    for (let viewR = 0; viewR < viewRows; viewR++) {
        for (let viewC = 0; viewC < COLS; viewC++) {
            const index = viewR * COLS + viewC;
            const square = squares[index];
            square.innerHTML = '';
            
            square.classList.remove('draft-area');
            if (draftZone && viewR >= draftZone.min && viewR <= draftZone.max) {
                square.classList.add('draft-area');
            }

            const { r, c } = getBoardCoords(viewR, viewC);
            const piece = state.board[r][c];

            // Reset classes
            square.className = square.className.replace(/jersey-\w+/g, '');
            square.classList.remove('has-piece');

            if (piece) {
                // In draft, only show current player's pieces
                if (state.gameState !== 'gameplay' && piece.player !== state.currentPlayer) {
                    continue;
                }

                const pieceDef = PIECES[piece.type];
                
                // Create span to allow rotating just the icon
                const span = document.createElement('span');
                span.classList.add('piece-icon');
                span.textContent = pieceDef.icon;
                
                const isOpponent = state.currentRoomCode ? piece.player !== state.myPlayerNumber : piece.player === 2;
                if (state.gameState === 'gameplay' && isOpponent) {
                    span.classList.add('piece-rotated');
                }
                
                square.appendChild(span);
                square.classList.add('has-piece');
                square.classList.add(`jersey-${state.playerColors[piece.player]}`);
            }
        }
    }
    refreshSquareLabels(); // a11y.js
}

export function getSquareElement(viewR, viewC) {
    return ui.chessboard.children[viewR * COLS + viewC];
}

export function clearHighlights() {
    const squares = ui.chessboard.children;
    for (let i = 0; i < squares.length; i++) {
        squares[i].classList.remove('highlight', 'selected');
    }
    refreshSquareLabels(); // a11y.js
}

export function highlightValidMoves(r, c) {
    clearHighlights();
    const { viewR: vr, viewC: vc } = getViewCoords(r, c);
    getSquareElement(vr, vc).classList.add('selected');

    const moves = getValidMoves(r, c);
    moves.forEach(m => {
        const { viewR, viewC } = getViewCoords(m.r, m.c);
        const sq = getSquareElement(viewR, viewC);
        if (sq) sq.classList.add('highlight');
    });
    refreshSquareLabels(); // a11y.js
}
