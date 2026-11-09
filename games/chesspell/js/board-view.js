// @ts-check
// The board on screen: squares, pieces, traps, graveyards, move highlights and drag and
// drop. A tap, a click or a key press on a square all go through squareAction(), so the
// rules of selecting and moving a piece are written once.
import { PIECE_MAP, match, session } from './state.js';
import { engine } from './game-engine.js';
import { emit } from './events.js';

/** The board is shown upside down for the online black player. */
export const boardFlipped = () => session.isOnline && session.myPlayerColor === 'black';

/** Where square (r, c) is drawn: the same place, or turned round for the black player online. */
function viewOf(r, c) {
    return boardFlipped() ? { r: 7 - r, c: 7 - c } : { r, c };
}

/**
 * Square (r, c) on the page. Squares are created in board order; turning the board
 * round is only CSS placement.
 * @returns {HTMLElement}
 */
export function squareAt(r, c) {
    return /** @type {HTMLElement} */ (document.getElementById('chessboard').children[r * 8 + c]);
}

/** Whether the player on this page may move the piece on (r, c) now. */
export function canMove(r, c) {
    const p = engine.board[r][c];
    return Boolean(p) && p !== 'W' && engine.getColor(p) === engine.turn
        && !engine.targetingState && !engine.winner
        && (!session.isOnline || engine.turn === session.myPlayerColor)
        && !(match.isBotGame && engine.turn === 'black'); // The bot's pieces are not ours
}

export function clearHighlights() {
    for (const sq of document.getElementById('chessboard').children) {
        sq.classList.remove('valid-move', 'valid-capture');
    }
    emit('highlightsCleared');
}

/** Highlight the moves of the piece on (r, c); returns them. */
function showMoves(r, c) {
    clearHighlights();
    const validMoves = engine.getValidMoves(r, c);
    validMoves.forEach(m => squareAt(m.r, m.c).classList.add(m.capture ? 'valid-capture' : 'valid-move'));
    return validMoves;
}

/** Pick the piece on (r, c): its moves are highlighted, the next tap plays one. */
export function selectPiece(r, c) {
    match.selectedPiece = { r, c, validMoves: showMoves(r, c) };
}

/**
 * One tap or key press on square (r, c): pick a spell target, play the selected piece
 * there, or pick (or drop, if it is picked already) the piece on it.
 */
export function squareAction(r, c) {
    if (engine.targetingState) {
        engine.handleSquareClick(r, c);
        return;
    }
    const selected = match.selectedPiece;
    match.selectedPiece = null;
    if (selected && selected.validMoves.some(m => m.r === r && m.c === c)) {
        engine.move(selected.r, selected.c, r, c);
        clearHighlights();
        return;
    }
    clearHighlights();
    const again = selected && selected.r === r && selected.c === c;
    if (!again && canMove(r, c)) selectPiece(r, c);
}

/** A tap on a piece is a square action unless it starts a drag of that piece. */
function isSquareAction(r, c) {
    const selected = match.selectedPiece;
    return Boolean(engine.targetingState || (selected && selected.validMoves.some(m => m.r === r && m.c === c)));
}

function trapElement() {
    const trapEl = document.createElement('div');
    trapEl.textContent = '🕸️';
    Object.assign(trapEl.style, {
        position: 'absolute', width: '100%', height: '100%', display: 'flex',
        justifyContent: 'center', alignItems: 'center', fontSize: '3vh', opacity: '0.7',
        pointerEvents: 'none', zIndex: '5',
    });
    return trapEl;
}

export function renderChessboard() {
    const board = document.getElementById('chessboard');
    const hadFocus = board.contains(document.activeElement);
    board.innerHTML = '';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = document.createElement('div');
            const view = viewOf(r, c);
            square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            // Placed explicitly: for the online black player the view is turned round,
            // and the square must sit where its piece is drawn.
            square.style.gridRow = String(view.r + 1);
            square.style.gridColumn = String(view.c + 1);
            square.dataset.r = String(r);
            square.dataset.c = String(c);
            if (engine.traps.some(t => t.r === r && t.c === c)) square.appendChild(trapElement()); // Seen by both players
            square.addEventListener('pointerdown', () => squareAction(r, c));
            board.appendChild(square);
        }
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = engine.board[r][c];
            if (!p) continue;
            const view = viewOf(r, c);
            const pieceEl = document.createElement('div');
            pieceEl.className = `chess-piece ${engine.getColor(p)}`;
            pieceEl.textContent = PIECE_MAP[p];
            pieceEl.style.top = `${view.r * 12.5}%`;
            pieceEl.style.left = `${view.c * 12.5}%`;
            if (engine.frozenPieces.some(fp => fp.r === r && fp.c === c)) pieceEl.classList.add('frozen');
            const draggable = canMove(r, c);
            pieceEl.addEventListener('pointerdown', (e) => {
                if (draggable && !isSquareAction(r, c)) return; // setupDrag handles it
                e.stopImmediatePropagation(); // Neither the square below nor the drag
                squareAction(r, c);
            });
            if (draggable) setupDrag(pieceEl, r, c);
            board.appendChild(pieceEl);
        }
    }
    renderGraveyards();
    emit('boardRendered', { hadFocus });
}

/** Captured pieces beside each player, strongest first. */
function renderGraveyards() {
    const power = { q: 9, r: 5, b: 3, n: 3, p: 1, w: 0 };
    const renderGY = (containerId, pieces) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.replaceChildren(...[...pieces]
            .sort((a, b) => (power[b.toLowerCase()] || 0) - (power[a.toLowerCase()] || 0))
            .map((p) => {
                const el = document.createElement('div');
                el.className = `graveyard-piece ${engine.getColor(p)}`;
                el.textContent = PIECE_MAP[p];
                return el;
            }));
    };
    renderGY('player1-graveyard', engine.capturedByWhite); // Black pieces taken by white, on White's side
    renderGY('player2-graveyard', engine.capturedByBlack); // White pieces taken by black, on Black's side
}

/** Drag a piece to a highlighted square to play it; a tap without moving picks it. */
function setupDrag(pieceEl, startR, startC) {
    let isDragging = false;
    let hasMoved = false;
    let lastClientX, lastClientY;
    let currentX, currentY;
    let validMoves = [];
    const start = viewOf(startR, startC);
    const boardWidth = () => document.getElementById('chessboard').offsetWidth;
    const snapBack = () => {
        pieceEl.style.top = `${start.r * 12.5}%`;
        pieceEl.style.left = `${start.c * 12.5}%`;
    };

    pieceEl.addEventListener('pointerdown', (e) => {
        isDragging = true;
        hasMoved = false;
        pieceEl.classList.add('dragging');
        try {
            pieceEl.setPointerCapture(e.pointerId);
        } catch (err) {
            console.warn("Could not set pointer capture:", err);
        }
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        currentX = start.c * (boardWidth() / 8);
        currentY = start.r * (boardWidth() / 8);
        validMoves = showMoves(startR, startC);
    });

    pieceEl.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - lastClientX;
        const deltaY = e.clientY - lastClientY;
        if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) hasMoved = true;
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        if (document.body.classList.contains('tabletop-mode')) { // The board is turned a quarter
            currentX += deltaY;
            currentY -= deltaX;
        } else {
            currentX += deltaX;
            currentY += deltaY;
        }
        pieceEl.style.left = `${(currentX / boardWidth()) * 100}%`;
        pieceEl.style.top = `${(currentY / boardWidth()) * 100}%`;
    });

    pieceEl.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        pieceEl.classList.remove('dragging');
        try {
            pieceEl.releasePointerCapture(e.pointerId);
        } catch (err) {}

        if (!hasMoved) { // A tap: the piece is picked
            selectPiece(startR, startC);
            snapBack();
            return;
        }
        clearHighlights();
        const square = boardWidth() / 8;
        const target = viewOf(Math.floor((currentY + square / 2) / square), Math.floor((currentX + square / 2) / square));
        if (validMoves.some(m => m.r === target.r && m.c === target.c)) {
            match.selectedPiece = null;
            engine.move(startR, startC, target.r, target.c);
        } else {
            snapBack();
        }
    });
}
