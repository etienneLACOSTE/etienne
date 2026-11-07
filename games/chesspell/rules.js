// Ches'spell rules: piece colours, legal moves under active spells, promotion, FEN.
// No DOM and no globals: functions read a `state` object with the same fields
// as the game's `engine` (board, turn, frozenPieces, shieldedPieces, hasMoved,
// ghostActive, leapFrogActive, assassinActive, cannibalismActive,
// doubleTroubleState, domiReversiPiece). Board cells hold FEN letters
// (uppercase = white), 'W' for a wall, or null.
// Loaded by the browser (as `window.ChesspellRules`) and by Node (`require`).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ChesspellRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SIZE = 8;
    const WALL = 'W';
    const KNIGHT_JUMPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

    /** Standard starting position; row 0 is black's back rank. */
    function initialBoard() {
        return [
            ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
            ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            [null, null, null, null, null, null, null, null],
            ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
            ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
        ];
    }

    /** 'white', 'black', or null for an empty square or a wall. */
    function getColor(p) {
        if (!p || p === WALL) return null;
        return p === p.toUpperCase() ? 'white' : 'black';
    }

    /**
     * Legal destinations of the piece on (r, c), taking active spells into account.
     * There is no check: kings are captured. Each move is `{ r, c, capture, castle? }`.
     */
    function getValidMoves(state, r, c) {
        if (state.frozenPieces.some((fp) => fp.r === r && fp.c === c)) return [];

        const board = state.board;
        const p = board[r][c];
        if (!p) return [];
        const color = getColor(p);
        const type = p.toLowerCase();
        const moves = [];
        let ghostsPassed = 0;
        const isShielded = (nr, nc) => state.shieldedPieces.some((sp) => sp.r === nr && sp.c === nc);

        const addIfValid = (nr, nc, captureOnly = false, moveOnly = false) => {
            if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return false;
            const target = board[nr][nc];

            // While these spells are active, the king cannot be captured.
            const isRestrictedState = (state.doubleTroubleState && state.doubleTroubleState.active)
                || state.ghostActive || state.leapFrogActive || state.assassinActive;

            if (state.ghostActive) {
                // Ghost: slide through at most one piece.
                if (target) {
                    if (getColor(target) !== color && target !== WALL && !moveOnly) {
                        if (target.toLowerCase() === 'k' && isRestrictedState) return true;
                        if (type !== 'k' && isShielded(nr, nc)) return true;
                        moves.push({ r: nr, c: nc, capture: true });
                    }
                    ghostsPassed++;
                    if (ghostsPassed > 1) return false;
                    return true;
                }
                if (!captureOnly) moves.push({ r: nr, c: nc, capture: false });
                return true;
            }

            if (target) {
                if (moveOnly) return false;
                if ((getColor(target) !== color || state.cannibalismActive) && target !== WALL) {
                    if (target.toLowerCase() === 'k' && isRestrictedState) return false;
                    if (target.toLowerCase() === 'k' && getColor(target) === color) return false; // Never eat your own king
                    // A piece taken over by Domi Reversi cannot capture a king.
                    if (target.toLowerCase() === 'k' && state.domiReversiPiece
                        && r === state.domiReversiPiece.r && c === state.domiReversiPiece.c) return false;
                    if (type === 'k' || !isShielded(nr, nc)) {
                        moves.push({ r: nr, c: nc, capture: true });
                    }
                }
                return false;
            }
            if (!captureOnly) moves.push({ r: nr, c: nc, capture: false });
            return true;
        };

        // Leap Frog: any piece of the side to move may also jump like a knight.
        if (state.leapFrogActive && color === state.turn) {
            KNIGHT_JUMPS.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
        }

        if (type === 'p') {
            const dir = color === 'white' ? -1 : 1;
            const startRow = color === 'white' ? 6 : 1;
            if (addIfValid(r + dir, c, false, true) && r === startRow) {
                addIfValid(r + dir * 2, c, false, true);
            }
            addIfValid(r + dir, c - 1, true, false);
            addIfValid(r + dir, c + 1, true, false);
        } else if (type === 'n') {
            KNIGHT_JUMPS.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
        } else if (type === 'b' || type === 'r' || type === 'q') {
            const dirs = [];
            if (type === 'b' || type === 'q') dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
            if (type === 'r' || type === 'q') dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
            dirs.forEach(([dr, dc]) => {
                let nr = r + dr;
                let nc = c + dc;
                ghostsPassed = 0;
                while (addIfValid(nr, nc)) { nr += dr; nc += dc; }
            });
        } else if (type === 'k') {
            KING_STEPS.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
            if (!state.ghostActive && !state.assassinActive) {
                addCastlingMoves(state, r, c, color, moves);
            }
        }
        return moves;
    }

    function addCastlingMoves(state, r, c, color, moves) {
        const board = state.board;
        const isWhite = color === 'white';
        const moved = state.hasMoved;
        if (!moved || moved[isWhite ? 'whiteKing' : 'blackKing']) return;

        const isOwnRook = (p) => p && p.toLowerCase() === 'r' && getColor(p) === color;
        const rookH = board[r][7];
        if (!moved[isWhite ? 'whiteRookH' : 'blackRookH'] && !board[r][c + 1] && !board[r][c + 2] && isOwnRook(rookH)) {
            moves.push({ r, c: c + 2, capture: false, castle: 'kingside' });
        }
        const rookA = board[r][0];
        if (!moved[isWhite ? 'whiteRookA' : 'blackRookA'] && !board[r][c - 1] && !board[r][c - 2] && !board[r][c - 3]
            && isOwnRook(rookA)) {
            moves.push({ r, c: c - 2, capture: false, castle: 'queenside' });
        }
    }

    /** Pawns on the last rank become queens. Mutates `board`. */
    function promotePawns(board) {
        for (let c = 0; c < SIZE; c++) {
            if (board[0][c] === 'P') board[0][c] = 'Q';
            if (board[7][c] === 'p') board[7][c] = 'q';
        }
    }

    /** FEN of the position for the Python AI. Walls are sent separately, so they count as empty. */
    function toFEN(board, turn) {
        let fen = '';
        for (let r = 0; r < SIZE; r++) {
            let empty = 0;
            for (let c = 0; c < SIZE; c++) {
                const piece = board[r][c];
                if (piece && piece !== WALL && piece.toLowerCase() !== 'w') {
                    if (empty > 0) { fen += empty; empty = 0; }
                    fen += piece;
                } else {
                    empty++;
                }
            }
            if (empty > 0) fen += empty;
            if (r < SIZE - 1) fen += '/';
        }
        return fen + ' ' + (turn === 'white' ? 'w' : 'b') + ' - - 0 1';
    }

    return { SIZE, WALL, initialBoard, getColor, getValidMoves, promotePawns, toFEN };
});
