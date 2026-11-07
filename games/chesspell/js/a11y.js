// Keyboard and screen-reader support.
// - Spell cards are keyboard-ready by design: their title is a <button> whose click
//   reaches the card (see .card-main in style.css), next to the "i" info button.
// - The board is one tab stop: arrow keys move between squares, Enter/Space select a
//   piece, play a move or pick a spell target, with the same rules as the mouse.
// - Every square says what it holds and what it can do.

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const FILES = 'abcdefgh';

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


// --- Dialogs: card choice and spell info ---
// Each modal is announced as a dialog, takes the focus when it opens, keeps Tab inside,
// closes with Escape (same as its cancel/close button) and gives the focus back.
const DIALOGS = [
    { id: 'card-modal', title: 'modal-title', initial: 'modal-confirm', cancel: 'modal-cancel' },
    { id: 'info-modal', title: 'info-modal-title', initial: 'info-modal-close', cancel: 'info-modal-close' },
];

function focusableIn(root) {
    return [...root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.disabled && el.getClientRects().length);
}

function setupDialog({ id, title, initial, cancel }) {
    const modal = document.getElementById(id);
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', title);
    let opener = null;

    new MutationObserver(() => {
        const open = !modal.classList.contains('hidden');
        if (open && !opener) {
            opener = document.activeElement;
            // Buttons are re-created when the dialog opens: look them up now.
            document.getElementById(initial)?.focus();
        } else if (!open && opener) {
            const back = opener;
            opener = null;
            // Give the focus back unless the action already moved it somewhere useful.
            const focusLost = document.activeElement === document.body || modal.contains(document.activeElement);
            if (focusLost && back.isConnected) back.focus();
        }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });

    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            document.getElementById(cancel)?.click();
        } else if (e.key === 'Tab') {
            const items = focusableIn(modal);
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    });
}


// --- Screen changes: when the focus is lost (its screen was hidden), move it to the
// new screen's heading, so screen readers announce it and Tab continues from there.
function focusLost() {
    const el = document.activeElement;
    return !el || el === document.body || !el.getClientRects().length;
}

function focusScreen(screen) {
    if (!screen || !focusLost()) return;
    const target = screen.querySelector('h1, h2, h3')
        || screen.querySelector('button, [href], input, select, [tabindex]:not([tabindex="-1"])');
    if (!target) return;
    if (/^H[1-3]$/.test(target.tagName)) target.tabIndex = -1;
    target.focus();
}

function setupAccessibility() {
    document.getElementById('spell-instruction').setAttribute('role', 'status');
    setupAnnouncer();
    DIALOGS.forEach(setupDialog);
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
    const show = app.showScreen;
    app.showScreen = function (screenId, ...rest) {
        const result = show.call(this, screenId, ...rest);
        focusScreen(document.getElementById(screenId));
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

// --- Announcements: after each turn, screen readers hear the spell cast, the move or
// board change, and whose turn it is. The board is compared with the one seen at the
// previous turn, so local, bot and online moves are all covered.

let announcer = null;
let previousBoard = null;
let pendingSpell = '';

function announce(text) {
    // Emptied first so that the same sentence twice in a row is read again.
    announcer.textContent = '';
    requestAnimationFrame(() => { announcer.textContent = text; });
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function describePiece(p) {
    return p === 'W' ? 'wall' : `${ChesspellRules.getColor(p)} ${PIECE_NAMES[p.toLowerCase()]}`;
}

function whoseTurn() {
    if (isOnline) return engine.turn === myPlayerColor ? 'Your turn.' : "Opponent's turn.";
    if (app.isBotGame) return engine.turn === 'white' ? 'Your turn.' : "Bot's turn.";
    return `${capitalize(engine.turn)} to move.`;
}

/** "white pawn e2 to e4, takes black knight", or the list of changed squares after a spell. */
function describeBoardChange(before) {
    const after = engine.board;
    const emptied = [];
    const filled = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (before[r][c] === after[r][c]) continue;
            (after[r][c] ? filled : emptied).push({ r, c });
        }
    }
    const name = ({ r, c }) => `${FILES[c]}${8 - r}`;
    if (filled.length === 1 && emptied.length <= 2) {
        const to = filled[0];
        const from = emptied.find(e => before[e.r][e.c] === after[to.r][to.c])
            || emptied.find(e => before[e.r][e.c] && ChesspellRules.getColor(before[e.r][e.c]) === ChesspellRules.getColor(after[to.r][to.c]));
        if (from) {
            const taken = before[to.r][to.c] || emptied.filter(e => e !== from).map(e => before[e.r][e.c])[0];
            let text = `${capitalize(describePiece(after[to.r][to.c]))} ${name(from)} to ${name(to)}`;
            if (taken) text += `, takes ${describePiece(taken)}`;
            return text + '.';
        }
    }
    const changes = [...filled, ...emptied].map(sq => `${name(sq)} ${after[sq.r][sq.c] ? describePiece(after[sq.r][sq.c]) : 'empty'}`);
    if (!changes.length) return '';
    if (changes.length > 6) return `${changes.length} squares changed.`;
    return `Board: ${changes.join(', ')}.`;
}

const snapshot = () => engine.board.map(row => [...row]);

function announceTurn() {
    const parts = [pendingSpell, previousBoard ? describeBoardChange(previousBoard) : '', whoseTurn()];
    announce(parts.filter(Boolean).join(' '));
    pendingSpell = '';
    previousBoard = snapshot();
}

function setupAnnouncer() {
    announcer = document.createElement('div');
    announcer.id = 'announcer';
    announcer.className = 'visually-hidden';
    announcer.setAttribute('role', 'status');
    announcer.setAttribute('aria-atomic', 'true');
    document.body.appendChild(announcer);

    const init = engine.init;
    engine.init = function (...args) {
        const result = init.apply(this, args);
        previousBoard = snapshot();
        pendingSpell = '';
        return result;
    };
    const activate = engine.activateSpell;
    engine.activateSpell = function (cardId, ...rest) {
        const card = cardsData.find(c => c.id === cardId);
        if (card) pendingSpell = `${capitalize(this.turn)} casts ${card.name}.`;
        return activate.call(this, cardId, ...rest);
    };
    const endTurn = engine.endTurn;
    engine.endTurn = function (...args) {
        const result = endTurn.apply(this, args);
        announceTurn();
        return result;
    };
    // Online: the server sends the state after each action.
    const applyServerState = engine.applyServerState;
    engine.applyServerState = function (state, action) {
        if (action && action.type === 'spell' && action.status !== 'refused') {
            const card = cardsData.find(c => c.id === action.cardId);
            if (card) pendingSpell = `${capitalize(action.by)} casts ${card.name}.`;
        } else if (action && action.type === 'timeout') {
            pendingSpell = "Time's up.";
        }
        const result = applyServerState.call(this, state, action);
        if (action && action.turnEnded) announceTurn();
        return result;
    };
    // The first turn (local games): announced once the board is on screen.
    const initGame = app.initGame;
    app.initGame = function (...args) {
        const result = initGame.apply(this, args);
        announce(`Match starts. ${whoseTurn()}`);
        return result;
    };
}
