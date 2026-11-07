// Keyboard and screen-reader support.
// The game reacts to `pointerdown`, which a keyboard never sends: Enter or Space on a
// button produces a `click` instead. This file bridges the two, makes the draft shop,
// the colour swatches and the board operable from the keyboard, and labels the board.

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const COLUMN_LETTERS = 'abcdefgh';

/** Replay the game's pointerdown handlers on an element. */
function activateWithPointerdown(el) {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
}

/** Give a non-button element the keyboard behaviour of a button. */
function makeKeyboardButton(el, label) {
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
function syncPressedState(el) {
    const update = () => {
        el.setAttribute('aria-pressed', String(el.classList.contains('selected')));
        el.setAttribute('aria-disabled', String(el.classList.contains('disabled')));
    };
    update();
    new MutationObserver(update).observe(el, { attributes: true, attributeFilter: ['class'] });
}

function setupAccessibility() {
    // Keyboard-made clicks (detail === 0) on buttons run the pointerdown handlers.
    document.addEventListener('click', (e) => {
        const button = e.target.closest('button');
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
}

// --- Board: one tab stop, arrow keys between squares, Enter/Space to act ---

function boardRows() {
    return ui.chessboard.children.length / COLS;
}

/** Called after createBoardDOM(): squares become focusable buttons, one in the tab order. */
function enhanceBoardSquares() {
    const squares = [...ui.chessboard.children];
    const start = (boardRows() - 1) * COLS; // bottom-left square of the view
    squares.forEach((sq, i) => {
        sq.setAttribute('role', 'button');
        sq.tabIndex = i === start ? 0 : -1;
    });
    refreshSquareLabels();
}

function focusSquare(index) {
    const squares = ui.chessboard.children;
    if (index < 0 || index >= squares.length) return;
    for (const sq of squares) sq.tabIndex = -1;
    squares[index].tabIndex = 0;
    squares[index].focus();
}

function onBoardKeydown(e) {
    const sq = e.target.closest('.square');
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
        handleSquareClick(Number(sq.dataset.vr), Number(sq.dataset.vc));
    }
}

function describePiece(piece) {
    const name = PIECE_NAMES[piece.type];
    if (currentRoomCode) return `${piece.player === myPlayerNumber ? 'your' : "opponent's"} ${name}`;
    return `player ${piece.player} ${name}`;
}

/** Each square says where it is, what it holds and whether it is selected or a legal target. */
function refreshSquareLabels() {
    const rows = boardRows();
    for (const sq of ui.chessboard.children) {
        const vr = Number(sq.dataset.vr);
        const vc = Number(sq.dataset.vc);
        const { r, c } = getBoardCoords(vr, vc);
        const piece = board[r] && board[r][c];
        // During the draft only the current player's pieces are shown.
        const visible = piece && (gameState === 'gameplay' || piece.player === currentPlayer);
        let label = `${COLUMN_LETTERS[vc]}${rows - vr}: ${visible ? describePiece(piece) : 'empty'}`;
        if (sq.classList.contains('selected')) label += ', selected';
        if (sq.classList.contains('highlight')) label += ', can move here';
        sq.setAttribute('aria-label', label);
    }
}
