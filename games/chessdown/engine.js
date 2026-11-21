// @ts-check
// Chessdown rules engine: board geometry, legal moves, applying moves, touchdowns.
// No DOM and no globals: every function works on a `state` object
// `{ board, lastMove }`. Loaded by the browser (as `window.ChessdownEngine`)
// and by Node tools and tests (`require`).
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ChessdownEngine = api;
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function () {
    'use strict';

    const ROWS = 12;
    const COLS = 8;
    const MAX_POINTS = 39;

    // Draft cost of each piece type at level 3 (the classic piece).
    const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    // Piece levels (All Star mode, docs/games/chessdown-levels.md): 1 to 5, the classic
    // piece is level 3. A piece without `level` is level 3; the king is always level 5.
    // Classic mode = every piece at level 3: the rules are then exactly the classic ones.
    const LEVELS = [1, 2, 3, 4, 5];
    /** Draft cost of each type at levels 1 to 5. */
    const LEVEL_COSTS = {
        p: [1, 1, 1, 2, 2],
        n: [2, 2, 3, 4, 4],
        b: [2, 2, 3, 4, 4],
        r: [3, 4, 5, 6, 6],
        q: [7, 8, 9, 10, 11],
        k: [0, 0, 0, 0, 0],
    };
    /** How far a sliding piece goes at levels 1 and 2 (from level 3 on: no limit). */
    const SLIDE_RANGE = { r: [3, 6], b: [2, 4], q: [4, 6] };
    const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

    /** A piece's level (1 to 5). */
    function levelOf(piece) {
        if (piece.type === 'k') return 5;
        const level = piece.level;
        return Number.isInteger(level) && level >= 1 && level <= 5 ? level : 3;
    }

    /** Draft cost of a piece of `type` at `level` (default 3). */
    function pieceCost(type, level = 3) {
        const costs = LEVEL_COSTS[type];
        if (!costs) return undefined;
        return costs[(Number.isInteger(level) && level >= 1 && level <= 5 ? level : 3) - 1];
    }

    /**
     * Whether the square (tr, tc) can be seen from (fr, fc): the segment between the two
     * square centres crosses the inside of no occupied square (the two ends excepted).
     * Passing exactly through a corner crosses neither square. Exact, in integers: the
     * coordinates are doubled, so centres are odd numbers and square edges even ones.
     */
    function lineOfSight(board, fr, fc, tr, tc) {
        const ax = 2 * fc + 1, ay = 2 * fr + 1;
        const dx = 2 * (tc - fc), dy = 2 * (tr - fr);
        // Fractions n / d (d > 0); a < b ?
        const less = (a, b) => a.n * b.d < b.n * a.d;
        /** The open t-interval where a ∈ (lo, hi), for a(t) = a0 + da * t; null if never. */
        const span = (a0, da, lo, hi) => {
            if (da === 0) return a0 > lo && a0 < hi ? [{ n: 0, d: 1 }, { n: 1, d: 1 }] : null;
            return da > 0
                ? [{ n: lo - a0, d: da }, { n: hi - a0, d: da }]
                : [{ n: a0 - hi, d: -da }, { n: a0 - lo, d: -da }];
        };
        for (let r = Math.min(fr, tr); r <= Math.max(fr, tr); r++) {
            for (let c = Math.min(fc, tc); c <= Math.max(fc, tc); c++) {
                if ((r === fr && c === fc) || (r === tr && c === tc) || !board[r][c]) continue;
                const sx = span(ax, dx, 2 * c, 2 * c + 2);
                const sy = span(ay, dy, 2 * r, 2 * r + 2);
                if (!sx || !sy) continue;
                let lo = { n: 0, d: 1 };
                let hi = { n: 1, d: 1 };
                for (const [l, h] of [sx, sy]) {
                    if (less(lo, l)) lo = l;
                    if (less(h, hi)) hi = h;
                }
                if (less(lo, hi)) return false; // The segment goes through this piece
            }
        }
        return true;
    }

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
     * @param {{board: Array<Array<object|null>>, lastMove: object|null, rules?: any}} state
     *   rules: special match rules (matchRules), when a career quest sets some
     * @returns {Array<{r: number, c: number, isEnPassant?: boolean}>}
     */
    function getValidMoves(state, r, c) {
        const board = state.board;
        const piece = board[r][c];
        if (!piece) return [];

        const moves = [];
        const dir = piece.player === 1 ? -1 : 1; // Player 1 moves up the board
        const level = levelOf(piece);
        const inside = (tr, tc) => tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS;
        const empty = (tr, tc) => inside(tr, tc) && !board[tr][tc];

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

        /** Slide up to `range` squares (Infinity: no limit). */
        function slide(dr, dc, range = Infinity) {
            let tr = r + dr;
            let tc = c + dc;
            for (let n = 1; n <= range && addIfValid(tr, tc); n++) {
                tr += dr;
                tc += dc;
            }
        }

        /**
         * Level 4 rook and bishop: slide to the first piece; if it is one of ours, land on
         * the square just behind it (empty; or, with `canCapture`, an opponent's piece).
         */
        function hopOverOwn(dr, dc, canCapture) {
            let tr = r + dr;
            let tc = c + dc;
            while (empty(tr, tc)) { tr += dr; tc += dc; }
            if (!inside(tr, tc) || board[tr][tc].player !== piece.player) return;
            const lr = tr + dr, lc = tc + dc;
            if (!inside(lr, lc)) return;
            const target = board[lr][lc];
            if (!target || (canCapture && target.player !== piece.player)) moves.push({ r: lr, c: lc });
        }

        /** A jump that never captures: the landing square must be empty. */
        const jumpTo = (tr, tc) => { if (empty(tr, tc)) moves.push({ r: tr, c: tc }); };

        const range = (type) => (level <= 2 ? SLIDE_RANGE[type][level - 1] : Infinity);

        switch (piece.type) {
            case 'p': {
                const firstMove = !piece.hasMoved;
                const steps = level >= 4 && firstMove ? 3 : level >= 3 && firstMove ? 2 : 1;
                for (let n = 1; n <= steps && addIfValid(r + dir * n, c, false); n++) { /* Path must stay clear */ }
                if (level >= 2) {
                    addIfValid(r + dir, c - 1, true, true);
                    addIfValid(r + dir, c + 1, true, true);
                }
                // En passant (level 3 and up): a pawn that just moved 2 or 3 squares can be
                // taken on any square it went over, as if it had stopped there.
                const last = state.lastMove;
                if (level >= 3 && last && last.piece.type === 'p' && Math.abs(last.toC - c) === 1) {
                    if (last.passedRows) {
                        for (const passedR of last.passedRows) {
                            if (passedR === r + dir) moves.push({ r: passedR, c: last.toC, isEnPassant: true });
                        }
                    } else if (last.isDoubleStep && last.toR === r) {
                        moves.push({ r: r + dir, c: last.toC, isEnPassant: true }); // The classic rule
                    }
                }
                break;
            }
            case 'n':
                KNIGHT_JUMPS.forEach(([dr, dc]) => {
                    // The long leg of the L (2 squares), then 1 to the side.
                    const [sr, sc] = Math.abs(dr) === 2 ? [Math.sign(dr), 0] : [0, Math.sign(dc)];
                    if (level === 1 && !(empty(r + sr, c + sc) && empty(r + 2 * sr, c + 2 * sc))) return;
                    if (level === 2 && !empty(r + sr, c + sc)) return;
                    addIfValid(r + dr, c + dc);
                });
                if (level >= 4) ORTHOGONAL.forEach(([dr, dc]) => jumpTo(r + 3 * dr, c + 3 * dc));
                if (level >= 5) DIAGONAL.forEach(([dr, dc]) => jumpTo(r + 2 * dr, c + 2 * dc));
                break;
            case 'b':
                DIAGONAL.forEach(([dr, dc]) => slide(dr, dc, range('b')));
                if (level >= 4) DIAGONAL.forEach(([dr, dc]) => hopOverOwn(dr, dc, false));
                if (level >= 5) ORTHOGONAL.forEach(([dr, dc]) => jumpTo(r + dr, c + dc));
                break;
            case 'r':
                ORTHOGONAL.forEach(([dr, dc]) => slide(dr, dc, range('r')));
                if (level >= 4) ORTHOGONAL.forEach(([dr, dc]) => hopOverOwn(dr, dc, level >= 5));
                break;
            case 'q':
                ORTHOGONAL.forEach(([dr, dc]) => slide(dr, dc, range('q')));
                DIAGONAL.forEach(([dr, dc]) => slide(dr, dc, range('q')));
                if (level >= 4) KNIGHT_JUMPS.forEach(([dr, dc]) => jumpTo(r + dr, c + dc));
                if (level >= 5) {
                    // Next to her king (up, down, left, right), when she can see him.
                    const king = findKing(board, piece.player);
                    if (king && lineOfSight(board, r, c, king.r, king.c)) {
                        ORTHOGONAL.forEach(([dr, dc]) => jumpTo(king.r + dr, king.c + dc));
                    }
                }
                break;
            case 'k':
                KING_STEPS.forEach(([dr, dc]) => addIfValid(r + dr, c + dc));
                break;
        }
        let legal = moves;
        if (level !== 3 && piece.type !== 'k') {
            // Bonus moves may reach a square a normal move reaches too: keep it once.
            const seen = new Set();
            legal = moves.filter((m) => {
                const key = m.r * COLS + m.c;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        }
        return state.rules ? withMatchRules(state, piece, r, legal) : legal;
    }

    /**
     * Special match rules (career quests, docs/games/chessdown-career.md), kept in
     * `state.rules` (see matchRules); online and classic games have none.
     *   noRetreat: the players whose pieces may not move back towards their own end zone
     *   noCaptureMoves: per player, how many of its first moves may not capture
     *   noKingCapture: the players who may not take the king (they win by touchdown)
     *   moves: the moves each player has made (kept by applyMove and undoMove)
     */
    function withMatchRules(state, piece, r, moves) {
        const rules = state.rules;
        const player = piece.player;
        let out = moves;
        if (rules.noRetreat && rules.noRetreat.includes(player)) {
            const forward = player === 1 ? -1 : 1;
            out = out.filter((m) => (m.r - r) * forward >= 0); // Forward or sideways
        }
        if (rules.noKingCapture && rules.noKingCapture.includes(player)) {
            out = out.filter((m) => !(state.board[m.r][m.c] && state.board[m.r][m.c].type === 'k'));
        }
        const limit = rules.noCaptureMoves && rules.noCaptureMoves[player];
        if (limit && ((rules.moves && rules.moves[player]) || 0) < limit) {
            out = out.filter((m) => !m.isEnPassant && !(state.board[m.r][m.c] && state.board[m.r][m.c].player !== player));
        }
        return out;
    }

    /**
     * Fresh special rules for a match (one object per game: it counts the moves).
     * @param {{ noRetreat?: number[], noCaptureMoves?: Record<number, number>, noKingCapture?: number[] }} spec
     */
    function matchRules(spec = {}) {
        return {
            ...(spec.noRetreat && spec.noRetreat.length ? { noRetreat: spec.noRetreat.slice() } : {}),
            ...(spec.noCaptureMoves ? { noCaptureMoves: { ...spec.noCaptureMoves } } : {}),
            ...(spec.noKingCapture && spec.noKingCapture.length ? { noKingCapture: spec.noKingCapture.slice() } : {}),
            moves: { 1: 0, 2: 0 },
        };
    }

    /** The rows a player drafts on: its 3 back rows, or (invertedRows) its 3 rows nearest the middle. */
    function draftRows(player, invertedRows = false) {
        const half = ROWS / 2;
        if (player === 1) return invertedRows ? [half, half + 2] : [ROWS - 3, ROWS - 1];
        return invertedRows ? [half - 3, half - 1] : [0, 2];
    }

    /**
     * What is wrong with an army (empty when it is legal): exactly one king, inside the draft
     * rows, one piece a square, within the budget (levels' costs), and the quest's limits.
     * @param {{ r: number, c: number, type: string, level?: number, clubId?: number }[]} pieces
     * @param {number} player
     * @param {{ budget?: number, squad?: string[], banned?: string[], maxPieces?: number, invertedRows?: boolean, allowedIds?: number[] }} [army]
     *   squad: the only pieces allowed (each type at most as many times as listed);
     *   allowedIds: the only club players allowed (the club's original squad)
     */
    function checkArmy(pieces, player, army = {}) {
        const errors = [];
        const [minRow, maxRow] = draftRows(player, army.invertedRows);
        const seen = new Set();
        let cost = 0;
        for (const p of pieces) {
            if (!Number.isInteger(p.r) || !Number.isInteger(p.c) || p.c < 0 || p.c >= COLS || p.r < minRow || p.r > maxRow) errors.push('square');
            const key = `${p.r},${p.c}`;
            if (seen.has(key)) errors.push('twice');
            seen.add(key);
            if (!Object.hasOwn(PIECE_VALUES, p.type)) { errors.push('type'); continue; }
            cost += p.type === 'k' ? 0 : pieceCost(p.type, p.level === undefined ? 3 : p.level);
        }
        if (pieces.filter((p) => p.type === 'k').length !== 1) errors.push('king');
        if (cost > (army.budget === undefined ? MAX_POINTS : army.budget)) errors.push('budget');
        if (army.banned && pieces.some((p) => army.banned.includes(p.type))) errors.push('banned');
        if (army.maxPieces !== undefined && pieces.length > army.maxPieces) errors.push('maxPieces');
        if (army.squad) {
            const left = army.squad.slice();
            for (const p of pieces) {
                const i = left.indexOf(p.type);
                if (i === -1) { errors.push('squad'); break; }
                left.splice(i, 1);
            }
        }
        if (army.allowedIds && pieces.some((p) => !army.allowedIds.includes(p.clubId))) errors.push('players');
        return [...new Set(errors)];
    }

    function findKing(board, player) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const p = board[r][c];
                if (p && p.type === 'k' && p.player === player) return { r, c };
            }
        }
        return null;
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
     * Play a move on `state` (board and lastMove), handling en passant and the level 5
     * pawn's transformation (it becomes the piece it took, at level 3; not a pawn or king).
     * @returns undo data for `undoMove`; `targetPiece` is the captured piece, if any.
     */
    function applyMove(state, move) {
        const board = state.board;
        const piece = board[move.fromR][move.fromC];
        const targetPiece = board[move.toR][move.toC];
        const isEnPassant = piece.type === 'p' && move.fromC !== move.toC && targetPiece === null;
        const stepped = piece.type === 'p' && move.fromC === move.toC ? Math.abs(move.fromR - move.toR) : 0;
        const isDoubleStep = stepped === 2;

        let enPassantCapturedPiece = null;
        let enPassantSquare = null;
        if (isEnPassant) {
            // The pawn that just moved, wherever it stopped (beside us after a double step).
            const last = state.lastMove;
            enPassantSquare = last ? { r: last.toR, c: last.toC } : { r: move.fromR, c: move.toC };
            enPassantCapturedPiece = board[enPassantSquare.r][enPassantSquare.c];
            board[enPassantSquare.r][enPassantSquare.c] = null;
        }

        board[move.toR][move.toC] = piece;
        board[move.fromR][move.fromC] = null;

        const oldHasMoved = piece.hasMoved;
        piece.hasMoved = true;

        let transformed = null;
        if (piece.type === 'p' && levelOf(piece) === 5 && targetPiece && targetPiece.type !== 'p' && targetPiece.type !== 'k') {
            transformed = { type: piece.type, level: piece.level, hadTransformed: piece.transformed };
            piece.type = targetPiece.type;
            piece.level = 3;
            piece.transformed = true;
        }

        if (state.rules) {
            if (!state.rules.moves) state.rules.moves = { 1: 0, 2: 0 };
            state.rules.moves[piece.player]++;
        }

        const oldLastMove = state.lastMove;
        state.lastMove = { piece, fromR: move.fromR, fromC: move.fromC, toR: move.toR, toC: move.toC, isDoubleStep };
        if (stepped === 3) {
            const dir = Math.sign(move.toR - move.fromR);
            state.lastMove.passedRows = [move.fromR + dir, move.fromR + 2 * dir];
        }

        return { targetPiece, isEnPassant, enPassantCapturedPiece, enPassantSquare, oldHasMoved, oldLastMove, transformed };
    }

    /** Revert a move played with `applyMove`. */
    function undoMove(state, move, undoData) {
        const board = state.board;
        const piece = board[move.toR][move.toC];
        if (state.rules && state.rules.moves) state.rules.moves[piece.player]--;
        board[move.fromR][move.fromC] = piece;
        board[move.toR][move.toC] = undoData.targetPiece;
        piece.hasMoved = undoData.oldHasMoved;
        if (undoData.transformed) {
            piece.type = undoData.transformed.type;
            if (undoData.transformed.level === undefined) delete piece.level;
            else piece.level = undoData.transformed.level;
            if (undoData.transformed.hadTransformed === undefined) delete piece.transformed;
            else piece.transformed = undoData.transformed.hadTransformed;
        }
        if (undoData.isEnPassant) {
            const at = undoData.enPassantSquare || { r: move.fromR, c: move.toC };
            board[at.r][at.c] = undoData.enPassantCapturedPiece;
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
                // The level only when set and not the classic one (classic keys unchanged).
                const level = p && p.type !== 'k' && p.level !== undefined && levelOf(p) !== 3 ? levelOf(p) : '';
                str += p ? `${p.player}${p.type}${level}` : '.';
            }
        }
        return str + currentPlayer;
    }

    return {
        ROWS, COLS, MAX_POINTS, PIECE_VALUES, LEVELS, LEVEL_COSTS,
        levelOf, pieceCost, lineOfSight, matchRules, draftRows, checkArmy,
        createBoard, endzoneRow, getValidMoves, generateAllMoves,
        applyMove, undoMove, hasPieceInEndzone, serializeBoard,
    };
});
