// Keyboard and screen-reader support.
// - Spell cards (draft, deck builder, in game) become keyboard buttons.
// - The board is one tab stop: arrow keys move between squares, Enter/Space select a
//   piece, play a move or pick a spell target, with the same rules as the mouse.
// - Every square says what it holds and what it can do.

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const FILES = 'abcdefgh';
const CARD_SELECTOR = '.spell-card, .in-game-card';

/** Cards are rendered often: give each new one the keyboard behaviour of a button. */
function enhanceCards(root) {
    root.querySelectorAll(CARD_SELECTOR).forEach(card => {
        if (card.hasAttribute('role')) return;
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        const title = card.querySelector('.card-title');
        if (title) card.setAttribute('aria-label', title.textContent.trim());
    });
}

/** The board is shown upside down for the online black player. */
const boardFlipped = () => isOnline && myPlayerColor === 'black';

function squareAt(r, c) {
    return document.getElementById('chessboard').children[r * 8 + c];
}

function describeSquare(r, c, sq) {
    const p = engine.board[r][c];
    let what = 'empty';
    if (p === 'W') what = 'wall';
    else if (p) what = `${ChesspellRules.getColor(p)} ${PIECE_NAMES[p.toLowerCase()]}`;
    const notes = [];
    if (engine.frozenPieces.some(fp => fp.r === r && fp.c === c)) notes.push('frozen');
    if (engine.shieldedPieces.some(sp => sp.r === r && sp.c === c)) notes.push('shielded');
    if (sq.classList.contains('kbd-selected')) notes.push('selected');
    if (sq.classList.contains('valid-capture')) notes.push('can capture');
    else if (sq.classList.contains('valid-move')) notes.push('can move here');
    return `${FILES[c]}${8 - r}: ${what}${notes.length ? ', ' + notes.join(', ') : ''}`;
}

function refreshSquareLabels() {
    const board = document.getElementById('chessboard');
    for (const sq of board.children) {
        if (!sq.classList.contains('square')) continue;
        sq.setAttribute('aria-label', describeSquare(Number(sq.dataset.r), Number(sq.dataset.c), sq));
    }
}

let focusedSquare = { r: 7, c: 0 }; // White's a1 corner until the player moves the focus

function enhanceBoard(restoreFocus) {
    const board = document.getElementById('chessboard');
    board.setAttribute('role', 'group');
    board.setAttribute('aria-label', 'Board');
    for (const sq of board.children) {
        if (!sq.classList.contains('square')) continue;
        sq.setAttribute('role', 'button');
        const here = Number(sq.dataset.r) === focusedSquare.r && Number(sq.dataset.c) === focusedSquare.c;
        sq.tabIndex = here ? 0 : -1;
    }
    refreshSquareLabels();
    if (restoreFocus) squareAt(focusedSquare.r, focusedSquare.c)?.focus();
}

function focusSquare(r, c) {
    if (r < 0 || r > 7 || c < 0 || c > 7) return;
    squareAt(focusedSquare.r, focusedSquare.c).tabIndex = -1;
    focusedSquare = { r, c };
    const sq = squareAt(r, c);
    sq.tabIndex = 0;
    sq.focus();
}

function selectedSquareCleanup() {
    document.querySelectorAll('#chessboard .kbd-selected').forEach(sq => sq.classList.remove('kbd-selected'));
}

/** Same outcomes as the mouse: target a spell, play a highlighted move, or select a piece. */
function keyboardSquareAction(r, c) {
    if (engine.targetingState) {
        engine.handleSquareClick(r, c);
        return;
    }
    const selected = app.selectedPiece;
    if (selected && selected.validMoves.some(m => m.r === r && m.c === c)) {
        app.selectedPiece = null;
        engine.move(selected.r, selected.c, r, c);
        app.clearHighlights();
        return;
    }
    const p = engine.board[r][c];
    const canPlay = p && p !== 'W' && ChesspellRules.getColor(p) === engine.turn
        && (!isOnline || engine.turn === myPlayerColor)
        && !(app.isBotGame && engine.turn === 'black');
    app.clearHighlights();
    if (!canPlay || (selected && selected.r === r && selected.c === c)) {
        app.selectedPiece = null;
        refreshSquareLabels();
        return;
    }
    const validMoves = engine.getValidMoves(r, c);
    app.selectedPiece = { r, c, validMoves };
    squareAt(r, c).classList.add('kbd-selected');
    validMoves.forEach(m => squareAt(m.r, m.c).classList.add(m.capture ? 'valid-capture' : 'valid-move'));
    refreshSquareLabels();
}

function onBoardKeydown(e) {
    const sq = e.target.closest('.square');
    if (!sq) return;
    const r = Number(sq.dataset.r);
    const c = Number(sq.dataset.c);
    const d = boardFlipped() ? -1 : 1; // Arrows follow the screen, not the board
    const steps = { ArrowUp: [-d, 0], ArrowDown: [d, 0], ArrowLeft: [0, -d], ArrowRight: [0, d] };
    if (e.key in steps) {
        e.preventDefault();
        focusSquare(r + steps[e.key][0], c + steps[e.key][1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        focusedSquare = { r, c };
        keyboardSquareAction(r, c);
    }
}

function setupAccessibility() {
    // Enter/Space on any non-native button (cards) acts like a click.
    document.addEventListener('keydown', (e) => {
        const el = e.target;
        if ((e.key === 'Enter' || e.key === ' ') && el.getAttribute && el.getAttribute('role') === 'button'
            && el.tagName !== 'BUTTON' && !el.classList.contains('square')) {
            e.preventDefault();
            el.click();
        }
    });
    enhanceCards(document);
    new MutationObserver(() => enhanceCards(document)).observe(document.getElementById('app'), { childList: true, subtree: true });

    document.getElementById('spell-instruction').setAttribute('role', 'status');
    document.getElementById('chessboard').addEventListener('keydown', onBoardKeydown);

    // The board DOM is rebuilt on every render: re-enhance it and keep the keyboard focus.
    const render = app.renderChessboard;
    app.renderChessboard = function (...args) {
        const board = document.getElementById('chessboard');
        const hadFocus = board.contains(document.activeElement);
        const result = render.apply(this, args);
        enhanceBoard(hadFocus);
        return result;
    };
    const clear = app.clearHighlights;
    app.clearHighlights = function (...args) {
        const result = clear.apply(this, args);
        selectedSquareCleanup();
        refreshSquareLabels();
        return result;
    };
}
