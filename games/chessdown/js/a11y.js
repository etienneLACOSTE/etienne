// @ts-check
// Keyboard and screen-reader support.
// The game reacts to `pointerdown`, which a keyboard never sends: Enter or Space on a
// button produces a `click` instead. This file bridges the two, makes the draft shop,
// the colour swatches and the board operable from the keyboard, and labels the board.
import { COLS, ROWS, state, ui } from './state.js';
import { getBoardCoords, getViewCoords } from './coords.js';

export const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const COLUMN_LETTERS = 'abcdefgh';

/** Replay the game's pointerdown handlers on an element. */
export function activateWithPointerdown(el) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

/** Give a non-button element the keyboard behaviour of a button. */
export function makeKeyboardButton(el, label) {
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    if (label) el.setAttribute('aria-label', label);
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activateWithPointerdown(el);
        }
    });
}

/** Mirror the `selected` / `disabled` classes as ARIA states. */
export function syncPressedState(el) {
    const update = () => {
        el.setAttribute('aria-pressed', String(el.classList.contains('selected')));
        el.setAttribute('aria-disabled', String(el.classList.contains('disabled')));
    };
    update();
    new MutationObserver(update).observe(el, { attributes: true, attributeFilter: ['class'] });
}


// --- Screen changes: when the focus is lost (its screen was hidden), move it to the
// new screen's heading, so screen readers announce it and Tab continues from there.
export function focusLost() {
    const el = document.activeElement;
    return !el || el === document.body || !el.getClientRects().length;
}

export function focusScreen(screen) {
    if (!screen || !focusLost()) return;
    const target = screen.querySelector('h1, h2, h3')
        || screen.querySelector('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
    if (!target) return;
    if (/^H[1-3]$/.test(target.tagName)) target.tabIndex = -1;
    target.focus();
}

export function setupAccessibility() {
    // Keyboard-made clicks (detail === 0) on buttons run the pointerdown handlers.
    document.addEventListener('click', (e) => {
        const button = /** @type {HTMLButtonElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('button'));
        if (button && e.detail === 0 && !button.disabled) activateWithPointerdown(button);
    }, true);

    ui.shopItems.forEach(item => {
        makeKeyboardButton(item, `Buy ${PIECE_NAMES[item.dataset.type]}, ${item.dataset.cost} points`);
        syncPressedState(item);
    });
    ui.colorSwatches.forEach(swatch => {
        makeKeyboardButton(swatch, `${swatch.dataset.color} jersey`);
        syncPressedState(swatch);
    });

    ui.statusBar.setAttribute('role', 'status');
    ui.chessboard.setAttribute('role', 'group');
    ui.chessboard.setAttribute('aria-label', 'Board');
    ui.chessboard.addEventListener('keydown', onBoardKeydown);

    setupAnnouncer();
}

// --- Board: one tab stop, arrow keys between squares, Enter/Space to act ---

export function boardRows() {
    return ui.chessboard.children.length / COLS;
}

/** Called after createBoardDOM(): squares become focusable buttons, one in the tab order. */
export function enhanceBoardSquares() {
    const squares = /** @type {HTMLElement[]} */ ([...ui.chessboard.children]);
    const start = (boardRows() - 1) * COLS; // bottom-left square of the view
    squares.forEach((sq, i) => {
        sq.setAttribute('role', 'button');
        sq.tabIndex = i === start ? 0 : -1;
    });
    refreshSquareLabels();
}

export function focusSquare(index) {
    const squares = /** @type {HTMLCollectionOf<HTMLElement>} */ (ui.chessboard.children);
    if (index < 0 || index >= squares.length) return;
    for (const sq of squares) sq.tabIndex = -1;
    squares[index].tabIndex = 0;
    squares[index].focus();
}

export function onBoardKeydown(e) {
    const sq = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('.square'));
    if (!sq) return;
    const index = [...ui.chessboard.children].indexOf(sq);
    const col = index % COLS;
    // A board shown upside down (player 2 in local draft) keeps arrows matching the screen.
    const flip = ui.gameContainer.classList.contains('rotate-180') ? -1 : 1;
    const moves = {
        ArrowUp: -COLS * flip,
        ArrowDown: COLS * flip,
        ArrowLeft: col === (flip === 1 ? 0 : COLS - 1) ? 0 : -1 * flip,
        ArrowRight: col === (flip === 1 ? COLS - 1 : 0) ? 0 : 1 * flip,
    };
    if (e.key in moves) {
        e.preventDefault();
        focusSquare(index + moves[e.key]);
    } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        focusSquare(index - col + (e.key === 'End' ? COLS - 1 : 0));
    } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateWithPointerdown(sq); // Same path as a tap (events.js routes it)
    }
}

export function describePiece(piece) {
    const name = PIECE_NAMES[piece.type];
    if (state.currentRoomCode) return `${piece.player === state.myPlayerNumber ? 'your' : "opponent's"} ${name}`;
    if (state.isBotMatch) return `${piece.player === 1 ? 'your' : "bot's"} ${name}`;
    return `player ${piece.player} ${name}`;
}

/** Each square says where it is, what it holds and whether it is selected or a legal target. */
export function refreshSquareLabels() {
    const rows = boardRows();
    for (const sq of /** @type {HTMLCollectionOf<HTMLElement>} */ (ui.chessboard.children)) {
        const vr = Number(sq.dataset.vr);
        const vc = Number(sq.dataset.vc);
        const { r, c } = getBoardCoords(vr, vc);
        const piece = state.board[r] && state.board[r][c];
        // During the draft only the current player's pieces are shown.
        const visible = piece && (state.gameState === 'gameplay' || piece.player === state.currentPlayer);
        let label = `${COLUMN_LETTERS[vc]}${rows - vr}: ${visible ? describePiece(piece) : 'empty'}`;
        if (sq.classList.contains('selected')) label += ', selected';
        if (sq.classList.contains('highlight')) label += ', can move here';
        sq.setAttribute('aria-label', label);
    }
}

// --- Announcements: each turn, screen readers hear the move just played (local, bot
// or online opponent) and whose turn it is. The board is compared with the one seen
// at the previous turn, so nothing in the game logic has to report its moves.

export let announcer = null;
export let previousTurn = null; // { lastMove, pieces } at the start of the previous turn

export function announce(text) {
    // Emptied first so that the same sentence twice in a row is read again.
    announcer.textContent = '';
    requestAnimationFrame(() => { announcer.textContent = text; });
}

export function squareName(r, c) {
    const { viewR, viewC } = getViewCoords(r, c);
    return `${COLUMN_LETTERS[viewC]}${ROWS - viewR}`;
}

export function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

export function whoseTurn(player) {
    if (state.currentRoomCode) return player === state.myPlayerNumber ? 'Your turn.' : "Opponent's turn.";
    if (state.isBotMatch) return player === 1 ? 'Your turn.' : "Bot's turn.";
    return `Player ${player}'s turn.`;
}

export function describeLastMove(before) {
    const m = state.lastMove;
    const piece = state.board[m.toR][m.toC];
    if (!piece) return '';
    // En passant: the captured pawn was beside the start square, not on the target.
    const captured = before[m.toR][m.toC]
        || (piece.type === 'p' && m.fromC !== m.toC && before[m.fromR][m.toC]) || null;
    let text = `${capitalize(describePiece(piece))} ${squareName(m.fromR, m.fromC)} to ${squareName(m.toR, m.toC)}`;
    if (captured) text += `, takes ${describePiece(captured)}`;
    if (m.toR === ChessdownEngine.endzoneRow(piece.player)) text += ', in the end zone';
    return text + '.';
}

export function announceTurn() {
    let text;
    if (!previousTurn) text = 'Match starts.';
    else if (state.lastMove && state.lastMove !== previousTurn.lastMove) text = describeLastMove(previousTurn.pieces);
    else text = "Time's up, turn skipped.";
    announce(`${text} ${whoseTurn(state.currentPlayer)}`);
    previousTurn = { lastMove: state.lastMove, pieces: state.board.map(row => row.map(p => p && { type: p.type, player: p.player })) };
}

export function setupAnnouncer() {
    announcer = document.createElement('div');
    announcer.id = 'announcer';
    announcer.className = 'visually-hidden';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(announcer);
}

/** A new match: the next turn is announced as its start. */
export function resetAnnouncements() {
    previousTurn = null;
}
