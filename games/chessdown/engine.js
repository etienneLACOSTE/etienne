// Chessdown rules engine: board geometry, legal moves, applying moves, touchdowns.
// No DOM and no globals: every function works on a `state` object
// `{ board, lastMove }`. Loaded by the browser (as `window.ChessdownEngine`)
// and by Node tools and tests (`require`).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ChessdownEngine = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const ROWS = 12;
    const COLS = 8;
    const MAX_POINTS = 39;

    // Draft cost of each piece type.
    const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    const KNIGHT_JUMPS = [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2]];
    const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

    /** @returns {Array<Array<object|null>>} an empty ROWS x COLS board */
    function createBoard() {
        return Array(ROWS).fill(null).map(() => Array(COLS).fill(null));
    }

    /** Row a player must reach to score a touchdown. Player 1 attacks row 0. */
    function endzoneRow(player) {
        return player === 1 ? 0 : ROWS - 1;
    }

    /**
     * Legal destinations of the piece on (r, c). There is no check in Chessdown:
     * a king may move into danger. En passant uses `state.lastMove`.
     * @param {{board: Array<Array<object|null>>, lastMove: object|null}} state
     * @returns {Array<{r: number, c: number, isEnPassant?: boolean}>}
     */
    function getValidMoves(state, r, c) {
        const board = state.board;
        const piece = board[r][c];
        if (!piece) return [];

        const moves = [];
        const dir = piece.player === 1 ? -1 : 1; // Player 1 moves up the board

        function addIfValid(tr, tc, canCapture = true, mustCapture = false) {
            if (tr < 0 || tr >= ROWS || tc < 0 || tc >= COLS) return false;
            const target = board[tr][tc];
            if (!target) {
                if (!mustCapture) {
                    moves.push({ r: tr, c: tc });
                    return true;
                }
                return false;
            }
            if (canCapture && target.player !== piece.player) {
                moves.push({ r: tr, c: tc });
            }
            return false;
        }

        function slide(dr, dc) {
            let tr = r + dr;
            let tc = c + dc;
            while (addIfValid(tr, tc)) {
                tr += dr;
                tc += dc;
            }
        }

        switch (piece.type) {
            case 'p': {
                if (addIfValid(r + dir, c, false) && !piece.hasMoved) {
                    addIfValid(r + dir * 2, c, false);
                }
                addIfValid(r + dir, c - 1, true, true);
                addIfValid(r + dir, c + 1, true, true);
                const last = state.lastMove;
                if (last && last.piece.type === 'p' && last.isDoubleStep
                    && last.toR === r && Math.abs(last.toC - c) === 1) {
                    moves.push({ r: r + dir, c: last.toC, isEnPassant: true });
                }
                break;
            }
            case 'n':
                KNIGHT_JUMPS.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
                break;
            case 'b':
                slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
                break;
            case 'r':
                slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1);
                break;
            case 'q':
                slide(1, 0); slide(-1, 0); slide(0, 1); slide(0, -1);
                slide(1, 1); slide(1, -1); slide(-1, 1); slide(-1, -1);
                break;
            case 'k':
                KING_STEPS.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
                break;
        }
        return moves;
    }

    /** Every legal move of `player`, as `{ fromR, fromC, toR, toC, isEnPassant }`. */
    function generateAllMoves(state, player) {
        const allMoves = [];
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const piece = state.board[r][c];
                if (piece && piece.player === player) {
                    for (const m of getValidMoves(state, r, c)) {
                        allMoves.push({ fromR: r, fromC: c, toR: m.r, toC: m.c, isEnPassant: m.isEnPassant });
                    }
                }
            }
        }
        return allMoves;
    }

    /**
     * Play a move on `state` (board and lastMove), handling en passant.
     * @returns undo data for `undoMove`; `targetPiece` is the captured piece, if any.
     */
    function applyMove(state, move) {
        const board = state.board;
        const piece = board[move.fromR][move.fromC];
        const targetPiece = board[move.toR][move.toC];
        const isEnPassant = piece.type === 'p' && move.fromC !== move.toC && targetPiece === null;
        const isDoubleStep = piece.type === 'p' && Math.abs(move.fromR - move.toR) === 2;

        let enPassantCapturedPiece = null;
        if (isEnPassant) {
            enPassantCapturedPiece = board[move.fromR][move.toC];
            board[move.fromR][move.toC] = null;
        }

        board[move.toR][move.toC] = piece;
        board[move.fromR][move.fromC] = null;

        const oldHasMoved = piece.hasMoved;
        piece.hasMoved = true;

        const oldLastMove = state.lastMove;
        state.lastMove = { piece, fromR: move.fromR, fromC: move.fromC, toR: move.toR, toC: move.toC, isDoubleStep };

        return { targetPiece, isEnPassant, enPassantCapturedPiece, oldHasMoved, oldLastMove };
    }

    /** Revert a move played with `applyMove`. */
    function undoMove(state, move, undoData) {
        const board = state.board;
        const piece = board[move.toR][move.toC];
        board[move.fromR][move.fromC] = piece;
        board[move.toR][move.toC] = undoData.targetPiece;
        piece.hasMoved = undoData.oldHasMoved;
        if (undoData.isEnPassant) {
            board[move.fromR][move.toC] = undoData.enPassantCapturedPiece;
        }
        state.lastMove = undoData.oldLastMove;
    }

    /**
     * True if `player` has a piece in the opponent's endzone. Checked at the start
     * of that player's turn, it means the piece survived a turn: touchdown.
     */
    function hasPieceInEndzone(board, player) {
        const row = endzoneRow(player);
        for (let c = 0; c < COLS; c++) {
            const piece = board[row][c];
            if (piece && piece.player === player) return true;
        }
        return false;
    }

    /** Position key (board + side to move), used to detect threefold repetition. */
    function serializeBoard(board, currentPlayer) {
        let str = '';
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const p = board[r][c];
                str += p ? `${p.player}${p.type}` : '.';
            }
        }
        return str + currentPlayer;
    }

    return {
        ROWS, COLS, MAX_POINTS, PIECE_VALUES,
        createBoard, endzoneRow, getValidMoves, generateAllMoves,
        applyMove, undoMove, hasPieceInEndzone, serializeBoard,
    };
});
