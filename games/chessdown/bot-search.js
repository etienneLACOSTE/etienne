// @ts-check
// Chessdown bot: draft, evaluation and minimax search, for either side.
// Shared by the game (js/bot.js, the campaign bot plays player 2) and by the trainer
// (tools/chessdown/train.js), so the bot is trained exactly as it plays.
// Loaded by the browser (as `window.ChessdownBot`) and by Node (`require`).
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./engine.js') : root.ChessdownEngine);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ChessdownBot = api;
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function (Engine) {
    'use strict';

    const { ROWS, COLS, MAX_POINTS, PIECE_VALUES } = Engine;
    const WIN = 99999;

    /**
     * What the bot knows: piece weights (centipawns) and positional bonuses.
     * @typedef {{ pieceWeights: Record<string, number>, centerBonusCols?: number, centerBonusRows?: number,
     *   pawnForwardBonus?: number, touchdownBonus?: number, depth?: number }} Profile
     */

    /** Standard values, used when no trained profile is loaded. */
    const DEFAULT_PROFILE = {
        depth: 5,
        pieceWeights: { p: 100, n: 300, b: 300, r: 500, q: 900, k: 10000 },
        centerBonusCols: 10,
        centerBonusRows: 20,
        pawnForwardBonus: 10,
        // A piece standing in the opposite end zone has not scored yet (it must survive a
        // turn, which the search checks): the bonus stays below a rook, so a speculative
        // run never outweighs real material.
        touchdownBonus: 400,
    };

    /** Extra plies of captures only, after the main search (see quiescence). */
    const QUIESCENCE_PLIES = 4;

    const other = (player) => (player === 1 ? 2 : 1);

    /** Board score for `me` (positive = good for `me`). */
    function evaluate(board, profile, me) {
        const bonusCols = profile.centerBonusCols !== undefined ? profile.centerBonusCols : 10;
        const bonusRows = profile.centerBonusRows !== undefined ? profile.centerBonusRows : 20;
        const pawnForward = profile.pawnForwardBonus !== undefined ? profile.pawnForwardBonus : 10;
        const tdBonus = profile.touchdownBonus !== undefined ? profile.touchdownBonus : 400;
        let score = 0; // From player 2's side, then turned to `me`
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const piece = board[r][c];
                if (!piece) continue;
                const val = piece.type === 'k' ? 10000 : (profile.pieceWeights[piece.type] || PIECE_VALUES[piece.type] * 100);
                let positionBonus = 0;
                let centerBonus = 0;
                if (c >= 2 && c <= 5) centerBonus += bonusCols;
                if (r >= 4 && r <= 7) centerBonus += bonusRows;
                if (piece.type !== 'p' && piece.type !== 'k') positionBonus += centerBonus;

                if (piece.player === 2) {
                    if (piece.type === 'p') positionBonus += r * pawnForward;
                    if (r === ROWS - 1) positionBonus += tdBonus;
                    score += val + positionBonus;
                } else {
                    if (piece.type === 'p') positionBonus += (ROWS - 1 - r) * pawnForward;
                    if (r === 0) positionBonus += tdBonus;
                    score -= val + positionBonus;
                }
            }
        }
        return me === 2 ? score : -score;
    }

    /** Material only (piece weights), from `me`'s side: to choose between lost positions. */
    function material(board, profile, me) {
        let score = 0;
        for (const row of board) {
            for (const p of row) {
                if (!p || p.type === 'k') continue;
                const val = profile.pieceWeights[p.type] || PIECE_VALUES[p.type] * 100;
                score += p.player === me ? val : -val;
            }
        }
        return score;
    }

    /** Captures first (king first), for better alpha-beta pruning. */
    function orderMoves(board, moves) {
        const gain = (m) => {
            const t = board[m.toR][m.toC];
            return t ? (t.type === 'k' ? 10000 : PIECE_VALUES[t.type]) : 0;
        };
        return moves.sort((a, b) => gain(b) - gain(a));
    }

    /**
     * Score of a finished game (a king taken, or a touchdown scored at the start of the
     * player's turn), or null. Earlier results score more: `depth` is the plies left.
     */
    function terminalScore(state, me, depth, maximizing) {
        let myKing = false;
        let theirKing = false;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const p = state.board[r][c];
                if (p && p.type === 'k') {
                    if (p.player === me) myKing = true;
                    else theirKing = true;
                }
            }
        }
        if (!myKing) return -WIN - depth;
        if (!theirKing) return WIN + depth;
        if (maximizing && Engine.hasPieceInEndzone(state.board, me)) return WIN + depth;
        if (!maximizing && Engine.hasPieceInEndzone(state.board, other(me))) return -WIN - depth;
        return null;
    }

    /**
     * At the end of the search, keep playing captures only, so the score is not taken
     * in the middle of an exchange (a piece left hanging just past the horizon).
     * The side to move may also stop capturing ("stand pat").
     */
    function quiescence(state, profile, me, alpha, beta, maximizing, plies) {
        const end = terminalScore(state, me, 0, maximizing);
        if (end !== null) return end;
        const standPat = evaluate(state.board, profile, me);
        if (plies === 0) return standPat;
        if (maximizing) {
            if (standPat >= beta) return standPat;
            alpha = Math.max(alpha, standPat);
        } else {
            if (standPat <= alpha) return standPat;
            beta = Math.min(beta, standPat);
        }
        const captures = Engine.generateAllMoves(state, maximizing ? me : other(me))
            .filter((m) => state.board[m.toR][m.toC]);
        orderMoves(state.board, captures);
        let best = standPat;
        for (const move of captures) {
            const undo = Engine.applyMove(state, move);
            const ev = quiescence(state, profile, me, alpha, beta, !maximizing, plies - 1);
            Engine.undoMove(state, move, undo);
            if (maximizing) {
                best = Math.max(best, ev);
                alpha = Math.max(alpha, ev);
            } else {
                best = Math.min(best, ev);
                beta = Math.min(beta, ev);
            }
            if (beta <= alpha) break;
        }
        return best;
    }

    /** Minimax with alpha-beta; `maximizing` means it is `me` to play. */
    function minimax(state, profile, me, depth, alpha, beta, maximizing) {
        const end = terminalScore(state, me, depth, maximizing);
        if (end !== null) return end;

        if (depth === 0) return quiescence(state, profile, me, alpha, beta, maximizing, QUIESCENCE_PLIES);

        const moves = Engine.generateAllMoves(state, maximizing ? me : other(me));
        if (moves.length === 0) return maximizing ? -WIN : WIN;
        orderMoves(state.board, moves);

        let best = maximizing ? -Infinity : Infinity;
        for (const move of moves) {
            const undo = Engine.applyMove(state, move);
            const ev = minimax(state, profile, me, depth - 1, alpha, beta, !maximizing);
            Engine.undoMove(state, move, undo);
            if (maximizing) {
                best = Math.max(best, ev);
                alpha = Math.max(alpha, ev);
            } else {
                best = Math.min(best, ev);
                beta = Math.min(beta, ev);
            }
            if (beta <= alpha) break;
        }
        return best;
    }

    /**
     * Best move for `me`, searching `depth` plies ({ board, lastMove } state).
     * A tiny random noise varies the games; `random` can be seeded.
     */
    function bestMove(state, me, depth, profile, random = Math.random) {
        const moves = orderMoves(state.board, Engine.generateAllMoves(state, me));
        let best = null;
        let maxEval = -Infinity;
        let alpha = -Infinity;
        const beta = Infinity;
        for (const move of moves) {
            const undo = Engine.applyMove(state, move);
            let ev = minimax(state, profile, me, depth - 1, alpha, beta, false);
            // A lost position: every move scores as a loss. Prefer the one that keeps the
            // most material, so the bot keeps resisting instead of giving pieces away.
            // (A later loss already scores higher; this breaks ties between equal losses.)
            if (ev <= -WIN) ev = minimax(state, profile, me, depth - 1, -Infinity, Infinity, false)
                + Math.max(-0.9, Math.min(0.9, material(state.board, profile, me) / 100000));
            else ev += random() * 0.1;
            Engine.undoMove(state, move, undo);
            if (ev > maxEval) {
                maxEval = ev;
                best = move;
            }
            alpha = Math.max(alpha, ev);
        }
        return best;
    }

    const KNIGHT_JUMPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
    const AROUND = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    const RAYS = {
        r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
        b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
        q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    };

    /**
     * How many of its own pieces attack each square of a formation (3 rows x 8, in the
     * bot's own frame: row 0 is its back rank, it moves towards higher rows).
     * Only its own pieces are on the board during the draft.
     */
    function formationControl(grid) {
        const control = grid.map((row) => row.map(() => 0));
        const hit = (r, c) => { if (r >= 0 && r < 3 && c >= 0 && c < COLS) control[r][c]++; };
        grid.forEach((row, r) => row.forEach((type, c) => {
            if (!type) return;
            if (type === 'p') { hit(r + 1, c - 1); hit(r + 1, c + 1); return; }
            if (type === 'k') { AROUND.forEach(([dr, dc]) => hit(r + dr, c + dc)); return; }
            if (type === 'n') { KNIGHT_JUMPS.forEach(([dr, dc]) => hit(r + dr, c + dc)); return; }
            for (const [dr, dc] of RAYS[type]) {
                for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < 3 && cc >= 0 && cc < COLS; rr += dr, cc += dc) {
                    hit(rr, cc);
                    if (grid[rr][cc]) break; // Blocked, but the blocking piece is defended
                }
            }
        }));
        return control;
    }

    /**
     * True if the king can be hit from afar at once: its file or a forward diagonal runs
     * out of the formation without meeting one of its own pieces (the middle rows are empty).
     */
    function kingExposed(grid) {
        for (let r = 0; r < 3; r++) {
            const c = grid[r].indexOf('k');
            if (c === -1) continue;
            return [[1, 0], [1, 1], [1, -1]].some(([dr, dc]) => {
                for (let rr = r + dr, cc = c + dc; cc >= 0 && cc < COLS; rr += dr, cc += dc) {
                    if (rr >= 3) return true; // Out of the formation: open to the enemy
                    if (grid[rr][cc]) return false;
                }
                return false; // A diagonal that leaves by the side of the board
            });
        }
        return false;
    }

    /**
     * Weaknesses of a formation, worst first: a king open to a long-range attack; then
     * back-rank squares (the opponent's end zone) not controlled by its own pieces, a
     * piece standing there counting only if defended (it can be taken, and the taker
     * would stay); then files left open to the enemy (nothing in front of the back
     * rank) whose back square is not controlled twice, since two rooks stacked on a file
     * take, retake and stay; then undefended pieces on the front row, then the middle row.
     */
    function formationFaults(grid) {
        const control = formationControl(grid);
        let open = 0;
        let stackable = 0;
        let frontUndefended = 0;
        let middleUndefended = 0;
        for (let c = 0; c < COLS; c++) {
            if (control[0][c] === 0) open++;
            if (!grid[1][c] && !grid[2][c]) stackable += Math.max(0, 2 - control[0][c]);
            if (grid[2][c] && control[2][c] === 0) frontUndefended++;
            if (grid[1][c] && grid[1][c] !== 'k' && control[1][c] === 0) middleUndefended++;
        }
        const king = kingExposed(grid) ? 1 : 0;
        return {
            king, open, stackable, frontUndefended, middleUndefended,
            cost: king * 1000000 + open * 10000 + stackable * 1000 + frontUndefended * 100 + middleUndefended * 10,
        };
    }

    /**
     * Rearrange a formation so the back rank is guarded and the front pieces defended,
     * moving as few pieces as possible: swaps of two squares, kept while they lower the
     * faults (the king stays off the front row).
     */
    function strengthenFormation(grid) {
        const squares = [];
        for (let r = 0; r < 3; r++) for (let c = 0; c < COLS; c++) squares.push([r, c]);
        let cost = formationFaults(grid).cost;
        for (let pass = 0; pass < 20 && cost > 0; pass++) {
            let improved = false;
            for (const [r1, c1] of squares) {
                if (!grid[r1][c1]) continue;
                for (const [r2, c2] of squares) {
                    const a = grid[r1][c1];
                    const b = grid[r2][c2];
                    if (a === b || (a === 'k' && r2 === 2) || (b === 'k' && r1 === 2)) continue;
                    grid[r1][c1] = b;
                    grid[r2][c2] = a;
                    const next = formationFaults(grid).cost;
                    if (next < cost) {
                        cost = next;
                        improved = true;
                    } else {
                        grid[r2][c2] = b;
                        grid[r1][c1] = a;
                    }
                }
            }
            if (!improved) break;
        }
        return grid;
    }

    /**
     * The bot's army for `player`, drafted with its profile: king placement by difficulty,
     * optional archetype, best value for the points left, then a structured formation.
     * Returns the pieces `{ r, c, type }` (in `player`'s deployment rows) and the points left.
     * @param {Profile} profile
     * @param {number} player
     * @param {{ difficulty?: string, archetype?: string, random?: () => number, strengthen?: boolean }} [options]
     */
    function draftArmy(profile, player, options = {}) {
        const difficulty = options.difficulty || 'master';
        const archetype = options.archetype || 'normal';
        const random = options.random || Math.random;
        // Rows counted from the bot's own back rank (0), then mapped to the board.
        const row = (r) => (player === 2 ? r : ROWS - 1 - r);
        const placed = [];
        const taken = new Set();
        const put = (r, c, type) => {
            placed.push({ r: row(r), c, type });
            taken.add(`${r},${c}`);
        };
        let points = MAX_POINTS;

        let kR = 0;
        let kC = 2 + Math.floor(random() * 4); // Safe central columns
        if (difficulty === 'novice') {
            kR = Math.floor(random() * 3);
            kC = Math.floor(random() * COLS);
        } else if (difficulty === 'apprentice') {
            kR = Math.floor(random() * 2);
        }
        put(kR, kC, 'k');

        const counts = { p: 0, n: 0, b: 0, r: 0, q: 0 };
        const army = [];
        const buy = (type) => {
            counts[type]++;
            army.push(type);
            points -= PIECE_VALUES[type];
        };

        // Archetypes spend about half the budget on one piece type.
        const ARCHETYPES = { ecuries: ['n', 6], citadelle: ['r', 3], chapiteau: ['b', 6], chair: ['p', 19], sorcieres: ['q', 2] };
        if (ARCHETYPES[archetype]) {
            const [type, count] = ARCHETYPES[archetype];
            for (let i = 0; i < count; i++) if (points >= PIECE_VALUES[type]) buy(type);
        }

        const pool = ['p', 'n', 'b', 'r', 'q'];
        const subOptimalChance = { expert: 0.15, apprentice: 0.5 }[difficulty] ?? 0.05;
        while (points > 0) {
            const affordable = pool.filter((t) => PIECE_VALUES[t] <= points);
            if (affordable.length === 0) break;
            let choice;
            if (difficulty === 'novice') {
                choice = affordable[Math.floor(random() * affordable.length)];
            } else {
                // Best weight per point, with diminishing returns.
                const roi = (t) => profile.pieceWeights[t] / PIECE_VALUES[t] / (counts[t] + 1);
                affordable.sort((a, b) => roi(b) - roi(a));
                choice = affordable[0];
                if (affordable.length > 1 && random() < subOptimalChance) choice = affordable[1];
            }
            buy(choice);
        }

        // Formation: free squares from the front row (2) to the back rank (0).
        const slots = [];
        for (let r = 2; r >= 0; r--) {
            for (let c = 0; c < COLS; c++) if (!taken.has(`${r},${c}`)) slots.push({ r, c });
        }
        const place = (type, preferredRows, preferEdges) => {
            let bestIdx = -1;
            let bestScore = -9999;
            slots.forEach((slot, i) => {
                let score = 0;
                if (preferredRows.includes(slot.r)) score += 100 - preferredRows.indexOf(slot.r) * 10;
                else score -= Math.abs(slot.r - preferredRows[0]) * 50;
                const distToCenter = Math.abs(slot.c - 3.5);
                score += preferEdges ? distToCenter * 10 : -distToCenter * 10;
                if (score > bestScore) {
                    bestScore = score;
                    bestIdx = i;
                }
            });
            if (bestIdx !== -1) {
                const slot = slots.splice(bestIdx, 1)[0];
                put(slot.r, slot.c, type);
            }
        };
        const each = (type, fn) => army.filter((t) => t === type).forEach(fn);
        each('r', () => place('r', [0, 1], true)); // Rooks: back rank, on the edges
        each('q', () => place('q', [0, 1], false)); // Queens: back rank, centre
        each('b', () => place('b', [0, 1], false)); // Bishops: back rows, centre
        each('n', () => place('n', [1, 2], false)); // Knights: middle row
        each('p', () => place('p', [2, 1, 0], false)); // Pawns: a front wall

        // Beyond the beginner level, the back rank is guarded and the front defended,
        // so a file opened by stacked rooks never gives a free touchdown.
        if (difficulty !== 'novice' && options.strengthen !== false) {
            const local = (r) => (player === 2 ? r : ROWS - 1 - r);
            const grid = [0, 1, 2].map(() => Array(COLS).fill(null));
            placed.forEach((p) => { grid[local(p.r)][p.c] = p.type; });
            strengthenFormation(grid);
            placed.length = 0;
            grid.forEach((line, r) => line.forEach((type, c) => { if (type) placed.push({ r: row(r), c, type }); }));
        }

        return { pieces: placed, pointsLeft: points };
    }

    return { DEFAULT_PROFILE, evaluate, bestMove, draftArmy, formationFaults, kingExposed };
});
