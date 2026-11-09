// @ts-check
// Ches'spell bot, without any DOM: which spell to cast and which move to play.
// Shared by the page (js/app-bot.js) and the trainer (tools/chesspell/train_spells.js).
// It works on the same `state` object as game.js, and plays through game.js, so the
// bot always follows the real rules of the 20 spells.
//
// Two ways of choosing a spell:
// - heuristicSpell: the original hand-written rules (one per spell, tuned by genes);
//   kept as the easy levels and as the reference the new bot is measured against;
// - the search bot (chooseTurn, below): tries every spell and target on a copy of the
//   game, then searches the replies, and casts a spell only when it pays.
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const api = factory(node ? require('./rules.js') : root.ChesspellRules, node ? require('./game.js') : root.ChesspellGame);
    if (node) module.exports = api;
    else root.ChesspellBot = api;
})(/** @type {any} */ (typeof self !== 'undefined' ? self : this), function (Rules, Game) {
    'use strict';

    const WALL = 'W';
    const other = (color) => (color === 'white' ? 'black' : 'white');
    const inBoard = (r, c) => r >= 0 && r <= 7 && c >= 0 && c <= 7;

    /** Piece values of the heuristic spells. */
    const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
    const value = (p) => VALUES[p.toLowerCase()] || 0;

    /** Genes of the original bot (genetic training, generation 100). */
    const LEGACY_GENES = {
        meta: { patience: 0.12, aggressiveness: 0.19, desperation: 0.23 },
        sniper: { earlyProb: 0.70, lateProb: 0.38, minVal: 997 },
        freeze: { prob: 0.16, minVal: 166 },
        shield: { prob: 0.84, minVal: 289 },
        sacrifice: { minVal: 665, desperationProb: 0.88 },
        ghost: { offensiveProb: 0.17, defensiveProb: 0.95 },
        leapFrog: { prob: 0.03 },
        doubleTrouble: { earlyProb: 0, lateProb: 0.92 },
        tornado: { disruptionProb: 0.21 },
        swap: { savePieceProb: 0.19, attackProb: 0.87 },
        revive: { prob: 0.36 },
        cannibalism: { prob: 0.68 },
        sidestep: { prob: 0.78 },
        mirror: { prob: 0.87 },
        trap: { prob: 0.35 },
        teleport: { defensiveProb: 0.05, offensiveProb: 0.10 },
        assassin: { earlyProb: 0.65, lateProb: 0.68 },
        promotion: { prob: 1.0 },
        domiReversi: { minValEarly: 689, minValLate: 233, urgencyProb: 0.64 },
        kamikaze: { minValDiff: 929, desperationMultiplier: 1.08 },
    };

    /** Every square, row by row. */
    function* squares() {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) yield [r, c];
    }

    /** Row `row` seen from black's side (the original bot played black). */
    const side = (ctx, row) => (ctx.me === 'black' ? row : 7 - row);

    /** Of the pieces matching `keep`, the most valuable (the first one on ties), or null. */
    function mostValuable(state, keep) {
        let best = null;
        let max = -1;
        for (const [r, c] of squares()) {
            const p = state.board[r][c];
            if (p && keep(p) && value(p) > max) { max = value(p); best = { r, c }; }
        }
        return best && { square: best, value: max };
    }

    /** An empty square between rows `from` and `to` (black's side), picked at random. */
    function randomEmpty(state, ctx, from, to) {
        const empties = [];
        const [lo, hi] = [side(ctx, from), side(ctx, to)].sort((a, b) => a - b);
        for (let r = lo; r <= hi; r++) for (let c = 0; c < 8; c++) if (!state.board[r][c]) empties.push({ r, c });
        return empties.length ? [empties[Math.floor(ctx.random() * empties.length)]] : null;
    }

    /** Spells that only switch something on: cast with probability `prob(ctx, genes)`. */
    const chance = (prob) => (state, ctx, genes) => (ctx.random() < prob(ctx, genes) ? [] : null);

    /** Sniper (7): the most valuable enemy, if a bishop of ours sees one worth `minVal`. */
    function sniper(state, ctx, genes) {
        const g = genes.sniper;
        if (!(ctx.random() < (ctx.isLateGame ? g.lateProb : g.earlyProb))) return null;
        const best = mostValuable(state, (p) => Rules.getColor(p) === ctx.enemy && p.toLowerCase() !== 'k');
        if (!best || best.value < g.minVal) return null;
        let bishop = null;
        for (const [r, c] of squares()) {
            const p = state.board[r][c];
            if (p && p.toLowerCase() === 'b' && Rules.getColor(p) === ctx.me) bishop = { r, c };
        }
        if (!bishop) return null;
        let target = null;
        for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
            let r = bishop.r + dr;
            let c = bishop.c + dc;
            while (inBoard(r, c)) {
                const p = state.board[r][c];
                if (p) {
                    if (Rules.getColor(p) === ctx.enemy && p.toLowerCase() !== 'k' && value(p) >= g.minVal) target = { r, c };
                    break;
                }
                r += dr;
                c += dc;
            }
        }
        return target && [bishop, target];
    }

    /** Freeze (15): the most valuable enemy, if worth `minVal`. */
    function freeze(state, ctx, genes) {
        const g = genes.freeze;
        if (!(ctx.random() < g.prob)) return null;
        const best = mostValuable(state, (p) => Rules.getColor(p) === ctx.enemy && p.toLowerCase() !== 'k');
        return best && best.value >= g.minVal ? [best.square] : null;
    }

    /** Shield (11): our most valuable piece (the king, in practice). */
    function shield(state, ctx, genes) {
        const best = mostValuable(state, (p) => Rules.getColor(p) === ctx.me);
        return best && best.value >= genes.shield.minVal ? [best.square] : null;
    }

    /** Sacrifice (14): our cheapest officer goes, a pawn becomes one, if worth it. */
    function sacrifice(state, ctx, genes) {
        let target = null;
        let min = 99999;
        let pawn = null;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = state.board[r][c];
                if (!p || Rules.getColor(p) !== ctx.me) continue;
                const type = p.toLowerCase();
                if (type !== 'k' && type !== 'p' && value(p) < min) { min = value(p); target = { r, c }; }
            }
            // The first pawn of the last row that has one.
            for (let c = 0; c < 8; c++) {
                const p = state.board[r][c];
                if (p && Rules.getColor(p) === ctx.me && p.toLowerCase() === 'p') { pawn = { r, c }; break; }
            }
        }
        const g = genes.sacrifice;
        const threshold = ctx.isDesperate ? g.minVal * g.desperationProb : g.minVal;
        return target && pawn && min >= threshold ? [target, pawn] : null;
    }

    /**
     * Sidestep (4): a piece of ours next to an empty square. Searching rows in order:
     * every piece of a row until one fits, then only the first piece of each later row,
     * which takes over when it fits (kept as the original bot did it).
     */
    function sidestep(state, ctx, genes) {
        if (!(ctx.random() < genes.sidestep.prob)) return null;
        let found = null;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = state.board[r][c];
                if (!p || Rules.getColor(p) !== ctx.me) continue;
                for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    if (inBoard(r + dr, c + dc) && !state.board[r + dr][c + dc]) {
                        found = [{ r, c }, { r: r + dr, c: c + dc }];
                        break;
                    }
                }
                if (found) break;
            }
        }
        return found;
    }

    /** Swap (6): two of our non-king pieces, at random. */
    function swap(state, ctx, genes) {
        if (!(ctx.random() < (ctx.isAggressive ? genes.swap.attackProb : genes.swap.savePieceProb))) return null;
        const pieces = [];
        for (const [r, c] of squares()) {
            const p = state.board[r][c];
            if (p && Rules.getColor(p) === ctx.me && p.toLowerCase() !== 'k') pieces.push({ r, c });
        }
        if (pieces.length < 2) return null;
        pieces.sort(() => ctx.random() - 0.5);
        return [pieces[0], pieces[1]];
    }

    /** Revive (9): the first empty square of our pawn rank, if a pawn of ours was captured. */
    function revive(state, ctx, genes) {
        if (!(ctx.random() < genes.revive.prob)) return null;
        const row = side(ctx, 1);
        let square = null;
        for (let c = 0; c < 8; c++) if (!state.board[row][c]) { square = { r: row, c }; break; }
        const lost = ctx.me === 'black' ? state.capturedByWhite : state.capturedByBlack;
        return square && lost.some((p) => p.toLowerCase() === 'p') ? [square] : null;
    }

    /** Tornado (10): a random centre in the middle of the board. */
    function tornado(state, ctx, genes) {
        if (!(ctx.random() < genes.tornado.disruptionProb)) return null;
        const r = Math.floor(ctx.random() * 4) + 2;
        const c = Math.floor(ctx.random() * 4) + 2;
        return [{ r, c }];
    }

    /** True if, once (r, c) is ours, an enemy piece could capture it. */
    function capturableOnceOurs(state, ctx, r, c) {
        const original = state.board[r][c];
        state.board[r][c] = ctx.me === 'white' ? original.toUpperCase() : original.toLowerCase();
        let capturable = false;
        try {
            for (const [ir, ic] of squares()) {
                const p = state.board[ir][ic];
                if (p && Rules.getColor(p) === ctx.enemy
                    && Rules.getValidMoves(state, ir, ic).some((m) => m.r === r && m.c === c && m.capture)) {
                    capturable = true;
                    break;
                }
            }
        } finally {
            state.board[r][c] = original;
        }
        return capturable;
    }

    /** Domi Reversi (3): the most valuable enemy piece that would be safe once ours. */
    function domiReversi(state, ctx, genes) {
        const g = genes.domiReversi;
        if (!(ctx.random() < (ctx.isDesperate ? g.urgencyProb * 2 : g.urgencyProb))) return null;
        let target = null;
        let max = -1;
        for (const [r, c] of squares()) {
            const p = state.board[r][c];
            if (!p || Rules.getColor(p) !== ctx.enemy || p.toLowerCase() === 'k') continue;
            if (!capturableOnceOurs(state, ctx, r, c) && value(p) > max) { max = value(p); target = { r, c }; }
        }
        const threshold = ctx.isLateGame ? g.minValLate : g.minValEarly;
        return target && max >= threshold ? [target] : null;
    }

    /** Kamikaze (18): the piece of ours whose blast wins the most material. */
    function kamikaze(state, ctx, genes) {
        const g = genes.kamikaze;
        const threshold = ctx.isDesperate ? g.minValDiff / g.desperationMultiplier : g.minValDiff;
        let best = null;
        let bestScore = -9999;
        for (const [r, c] of squares()) {
            const p = state.board[r][c];
            if (!p || Rules.getColor(p) !== ctx.me || p.toLowerCase() === 'k') continue;
            let enemy = 0;
            let friendly = value(p);
            for (let i = r - 1; i <= r + 1; i++) {
                for (let j = c - 1; j <= c + 1; j++) {
                    const t = inBoard(i, j) && (i !== r || j !== c) && state.board[i][j];
                    if (!t || t === WALL || t.toLowerCase() === 'k') continue;
                    if (Rules.getColor(t) === ctx.enemy) enemy += value(t);
                    else friendly += value(t);
                }
            }
            const score = enemy - friendly;
            if (score > threshold && score > bestScore) { bestScore = score; best = { r, c }; }
        }
        return best && [best];
    }

    /** Teleport (17): our last piece (scanning the board) to our back rank. */
    function teleport(state, ctx, genes) {
        if (!(ctx.random() < (ctx.isAggressive ? genes.teleport.offensiveProb : genes.teleport.defensiveProb))) return null;
        let piece = null;
        for (const [r, c] of squares()) if (state.board[r][c] && Rules.getColor(state.board[r][c]) === ctx.me) piece = { r, c };
        const row = side(ctx, 0);
        let square = null;
        for (let c = 0; c < 8; c++) if (!state.board[row][c]) { square = { r: row, c }; break; }
        return piece && square ? [piece, square] : null;
    }

    /** Each spell's rule: the targets to click ([] for none), or null to keep the card. */
    const HEURISTICS = {
        1: () => [], // Cannibalism
        2: chance((ctx, g) => (ctx.isLateGame ? g.doubleTrouble.lateProb : g.doubleTrouble.earlyProb)),
        3: domiReversi,
        4: sidestep,
        5: chance((ctx, g) => (ctx.isAggressive ? g.ghost.offensiveProb : g.ghost.defensiveProb)),
        6: swap,
        7: sniper,
        8: (state, ctx) => randomEmpty(state, ctx, 3, 5), // Wall
        9: revive,
        10: tornado,
        11: shield,
        12: chance((ctx, g) => g.leapFrog.prob),
        14: sacrifice,
        15: freeze,
        16: (state, ctx, genes) => (ctx.random() < genes.trap.prob ? randomEmpty(state, ctx, 2, 6) : null), // Trap
        17: teleport,
        18: kamikaze,
        19: chance((ctx, g) => (ctx.isLateGame ? g.assassin.lateProb : g.assassin.earlyProb)),
        20: chance((ctx, g) => g.promotion.prob),
    };

    /** What the heuristic bot knows about the position before choosing. */
    function heuristicContext(state, me, genes, random) {
        let empty = 0;
        let material = 0;
        for (const [r, c] of squares()) {
            const p = state.board[r][c];
            if (!p) { empty++; continue; }
            if (p === WALL) continue;
            material += Rules.getColor(p) === me ? value(p) : -value(p);
        }
        const ctx = { me, enemy: other(me), random, isLateGame: empty > 40, isDesperate: material < -300, isAggressive: false };
        ctx.isAggressive = random() < genes.meta.aggressiveness;
        return ctx;
    }

    /**
     * The original bot's spell for `me`, from its unused cards (in hand order):
     * { cardId, spellId, targets } (spellId differs from cardId for Mirror), or null.
     * Nothing is changed in `state`.
     */
    function heuristicSpell(state, me, cards, genes = LEGACY_GENES, random = Math.random) {
        if (cards.length === 0) return null;
        const ctx = heuristicContext(state, me, genes, random);
        if (random() < genes.meta.patience && !ctx.isDesperate && !ctx.isLateGame) return null;
        const playable = cards.filter((id) => id >= 1 && id <= 20);
        if (playable.length === 0) return null;
        playable.sort(() => random() - 0.5);
        for (const cardId of playable) {
            let spellId = cardId;
            if (cardId === 13) { // Mirror
                if (!state.lastPlayedCardId || !(random() < genes.mirror.prob)) continue;
                spellId = state.lastPlayedCardId;
            }
            const rule = HEURISTICS[spellId];
            const targets = rule && rule(state, ctx, genes);
            if (targets) return { cardId, spellId, targets };
        }
        return null;
    }


    // ---------------------------------------------------------------------------
    // The search bot: every spell and target is tried on a copy of the game (through
    // game.js, so with the real rules), then the replies are searched (minimax with
    // alpha-beta and quiescence on the board). A card is cast only when the position
    // after it is worth more than keeping the card: each card in hand has a value.

    const WIN = 1000000;
    const INF = 10 * WIN;
    const TIMEOUT = Symbol('timeout');
    const SPELL_IDS = Array.from({ length: 20 }, (_, i) => i + 1);

    /** Piece-square tables, from black's side (row 0 is black's back rank). */
    const PST = {
        p: [
            [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 5, 5, 0, 0, 0], [0, 0, 5, 10, 10, 5, 0, 0],
            [5, 5, 10, 15, 15, 10, 5, 5], [10, 10, 20, 30, 30, 20, 10, 10], [30, 30, 30, 30, 30, 30, 30, 30], [0, 0, 0, 0, 0, 0, 0, 0],
        ],
        n: [
            [-50, -40, -30, -30, -30, -30, -40, -50], [-40, -20, 0, 5, 5, 0, -20, -40], [-30, 5, 10, 15, 15, 10, 5, -30],
            [-30, 0, 15, 20, 20, 15, 0, -30], [-30, 5, 15, 20, 20, 15, 5, -30], [-30, 0, 10, 15, 15, 10, 0, -30],
            [-40, -20, 0, 0, 0, 0, -20, -40], [-50, -40, -30, -30, -30, -30, -40, -50],
        ],
        b: [
            [-20, -10, -10, -10, -10, -10, -10, -20], [-10, 5, 0, 0, 0, 0, 5, -10], [-10, 10, 10, 10, 10, 10, 10, -10],
            [-10, 0, 10, 10, 10, 10, 0, -10], [-10, 5, 5, 10, 10, 5, 5, -10], [-10, 0, 5, 10, 10, 5, 0, -10],
            [-10, 0, 0, 0, 0, 0, 0, -10], [-20, -10, -10, -10, -10, -10, -10, -20],
        ],
    };

    /**
     * The standard profile. `weights`: piece values; the *Scale genes multiply the
     * positional terms of the original evaluation; `adjacencyThreat` / `domiThreat`:
     * share of a piece's value at risk from the opponent's Assassin or Kamikaze (piece
     * next to an enemy) and Domi Reversi (rooks and queens); `cardValues`: what a card
     * in hand is worth (a card is cast only if it gains more than that).
     */
    const DEFAULT_PROFILE = {
        depth: 3,
        spells: 'search',
        weights: { p: 100, n: 320, b: 330, r: 500, q: 900 },
        pstScale: 1,
        pawnScale: 1,
        kingScale: 1,
        developmentScale: 1,
        adjacencyThreat: 0.25,
        domiThreat: 0.15,
        cardValues: {
            1: 30, 2: 150, 3: 200, 4: 60, 5: 80, 6: 60, 7: 250, 8: 40, 9: 60, 10: 50,
            11: 60, 12: 80, 13: 100, 14: 120, 15: 100, 16: 60, 17: 60, 18: 200, 19: 150, 20: 120,
        },
        spellCandidates: 6,
    };

    /** The original bot: heuristic spells, its evaluation (strong contact threats), no card values. */
    const LEGACY_PROFILE = {
        ...DEFAULT_PROFILE,
        spells: 'heuristic',
        adjacencyThreat: 0.8,
        domiThreat: 0.3,
        cardValues: Object.fromEntries(SPELL_IDS.map((id) => [id, 0])),
    };

    /** Cards still in each hand: the decks minus the cards used. */
    function hands(state, decks) {
        const left = (color) => (decks[color] || []).filter((id) => !(state.usedCards && state.usedCards[color].includes(id)));
        return { white: left('white'), black: left('black') };
    }

    /** Pawn structure, king shelter and development, white minus black, before scaling. */
    function structureTerms(board, pawnCols, kings) {
        let pawns = 0;
        for (let c = 0; c < 8; c++) {
            for (const { color, sign } of [{ color: 'white', sign: 1 }, { color: 'black', sign: -1 }]) {
                const cols = pawnCols[color];
                if (cols[c] > 1) pawns -= 15 * sign;
                if (cols[c] > 0 && (c === 0 || cols[c - 1] === 0) && (c === 7 || cols[c + 1] === 0)) pawns -= 10 * sign;
            }
        }
        let king = 0;
        const shelter = (k, pawn, dir) => {
            let n = 0;
            for (let c = Math.max(0, k.c - 1); c <= Math.min(7, k.c + 1); c++) {
                const one = board[k.r + dir] && board[k.r + dir][c] === pawn;
                const two = board[k.r + 2 * dir] && board[k.r + 2 * dir][c] === pawn;
                if (one || two) n++;
            }
            return n;
        };
        if (kings.white && kings.white.r > 5 && shelter(kings.white, 'P', -1) < 2) king -= 20;
        if (kings.black && kings.black.r < 2 && shelter(kings.black, 'p', 1) < 2) king += 20;
        if (kings.white && kings.white.r === 7 && (kings.white.c === 2 || kings.white.c === 6)) king += 40;
        if (kings.black && kings.black.r === 0 && (kings.black.c === 2 || kings.black.c === 6)) king -= 40;
        let development = 0;
        for (const [r, c, p] of [[7, 1, 'N'], [7, 6, 'N'], [7, 2, 'B'], [7, 5, 'B']]) if (board[r][c] === p) development -= 40;
        for (const [r, c, p] of [[0, 1, 'n'], [0, 6, 'n'], [0, 2, 'b'], [0, 5, 'b']]) if (board[r][c] === p) development += 40;
        if (board[6][3] === 'Q' || board[5][3] === 'Q' || board[4][3] === 'Q') development -= 30;
        if (board[1][3] === 'q' || board[2][3] === 'q' || board[3][3] === 'q') development += 30;
        return { pawns, king, development };
    }

    /** True if a non-king enemy of `color` stands next to (r, c). */
    function enemyNextTo(board, r, c, color) {
        for (let i = r - 1; i <= r + 1; i++) {
            for (let j = c - 1; j <= c + 1; j++) {
                if ((i === r && j === c) || !inBoard(i, j)) continue;
                const t = board[i][j];
                if (t && t !== WALL && t.toLowerCase() !== 'k' && Rules.getColor(t) !== color) return true;
            }
        }
        return false;
    }

    /** Value at risk from the opponent's cards, white minus black (positive: black is at risk). */
    function threatTerms(board, profile, cards) {
        let score = 0;
        for (const { color, sign } of [{ color: 'white', sign: -1 }, { color: 'black', sign: 1 }]) {
            const theirs = cards[other(color)] || [];
            const contact = theirs.includes(19) || theirs.includes(18);
            const domi = theirs.includes(3);
            if (!contact && !domi) continue;
            for (const [r, c] of squares()) {
                const p = board[r][c];
                if (!p || p === WALL || Rules.getColor(p) !== color || p.toLowerCase() === 'k') continue;
                const v = profile.weights[p.toLowerCase()];
                if (contact && enemyNextTo(board, r, c, color)) score += sign * v * profile.adjacencyThreat;
                if (domi && v >= 500) score += sign * v * profile.domiThreat;
            }
        }
        return score;
    }

    /**
     * How good the position is for `me` (centipawns). `cards`: the cards still in each
     * hand ({ white, black }), for the threats and the value of the cards kept.
     */
    function evaluate(state, me, profile, cards = { white: [], black: [] }) {
        const board = state.board;
        const w = profile.weights;
        const pawnCols = { white: Array(8).fill(0), black: Array(8).fill(0) };
        const kings = { white: null, black: null };
        // A piece taken over by Domi Reversi goes back to its owner after a turn: it counts for them.
        const domi = state.domi !== undefined ? state.domi : state.domiReversiPiece;
        let score = 0;
        for (const [r, c] of squares()) {
            const p = board[r][c];
            if (!p || p === WALL) continue;
            const color = domi && domi.r === r && domi.c === c ? domi.originalColor : Rules.getColor(p);
            const type = p.toLowerCase();
            if (type === 'k') { kings[color] = { r, c }; continue; }
            if (type === 'p') pawnCols[color][c]++;
            const row = color === 'black' ? r : 7 - r;
            const bonus = PST[type] ? PST[type][row][c] : (r >= 3 && r <= 4 && c >= 3 && c <= 4 ? 10 : 0);
            score += (color === 'white' ? 1 : -1) * (w[type] + bonus * profile.pstScale);
        }
        const t = structureTerms(board, pawnCols, kings);
        score += t.pawns * profile.pawnScale + t.king * profile.kingScale + t.development * profile.developmentScale;
        score -= threatTerms(board, profile, cards);
        const hand = (color) => (cards[color] || []).reduce((sum, id) => sum + (profile.cardValues[id] || 0), 0);
        score += hand('white') - hand('black');
        return me === 'white' ? score : 0 - score;
    }

    // --- Board search (no spells: they are only tried at the root) ---

    /** A light copy of the game for the board search: one-turn spells are over. */
    function searchPosition(state) {
        return {
            board: state.board.map((row) => [...row]),
            turn: state.turn,
            frozenPieces: state.frozenPieces.map((f) => ({ ...f })),
            shieldedPieces: state.shieldedPieces.map((s) => ({ ...s })),
            traps: state.traps.map((t) => ({ ...t })), // Traps are visible to both players
            hasMoved: { ...state.hasMoved },
            doubleTroubleState: null,
            domiReversiPiece: null,
            domi: state.domiReversiPiece && state.board[state.domiReversiPiece.r][state.domiReversiPiece.c] ? { r: state.domiReversiPiece.r, c: state.domiReversiPiece.c, originalColor: state.domiReversiPiece.originalColor } : null,
            ghostActive: false, leapFrogActive: false, assassinActive: false, cannibalismActive: false, promotionActive: false,
        };
    }

    const CASTLING_FLAG = { K: 'whiteKing', k: 'blackKing' };
    const ROOK_FLAG = { R: { 0: 'whiteRookA', 7: 'whiteRookH' }, r: { 0: 'blackRookA', 7: 'blackRookH' } };

    /** Play a move on the search position; returns what `unmake` needs. */
    function make(pos, m) {
        const b = pos.board;
        const moving = b[m.fr][m.fc];
        const captured = b[m.tr][m.tc];
        const d = pos.domi;
        if (d && captured && d.r === m.tr && d.c === m.tc) {
            // Capturing the Domi Reversi piece gives it back to its owner (game.js: 'reverted').
            b[m.tr][m.tc] = d.originalColor === 'white' ? captured.toUpperCase() : captured.toLowerCase();
            pos.domi = null;
            return { reverted: true, moving, captured, prevDomi: d };
        }
        b[m.tr][m.tc] = moving;
        b[m.fr][m.fc] = null;
        if (m.castle) {
            const [from, to] = m.castle === 'kingside' ? [7, m.tc - 1] : [0, m.tc + 1];
            b[m.tr][to] = b[m.tr][from];
            b[m.tr][from] = null;
        }
        if ((moving === 'P' && m.tr === 0) || (moving === 'p' && m.tr === 7)) b[m.tr][m.tc] = moving === 'P' ? 'Q' : 'q';
        let trap = null;
        const ti = pos.traps.findIndex((t) => t.r === m.tr && t.c === m.tc && t.owner !== Rules.getColor(moving));
        if (ti !== -1) {
            trap = pos.traps.splice(ti, 1)[0];
            if (moving.toLowerCase() !== 'k') b[m.tr][m.tc] = null;
        }
        const prevMoved = pos.hasMoved;
        const flag = CASTLING_FLAG[moving] || (ROOK_FLAG[moving] && (m.fr === 0 || m.fr === 7) && ROOK_FLAG[moving][m.fc]);
        if (flag) pos.hasMoved = { ...prevMoved, [flag]: true };
        // Follow the Domi Reversi piece (or forget it once captured).
        const prevDomi = pos.domi;
        // A trap can destroy it on the way: then there is nothing left to give back.
        if (prevDomi && prevDomi.r === m.fr && prevDomi.c === m.fc) pos.domi = b[m.tr][m.tc] ? { ...prevDomi, r: m.tr, c: m.tc } : null;
        else if (prevDomi && prevDomi.r === m.tr && prevDomi.c === m.tc) pos.domi = null;
        return { moving, captured, trap, ti, prevMoved, prevDomi };
    }

    function unmake(pos, m, u) {
        const b = pos.board;
        if (u.reverted) {
            b[m.tr][m.tc] = u.captured;
            pos.domi = u.prevDomi;
            return;
        }
        if (u.trap) pos.traps.splice(u.ti, 0, u.trap);
        if (m.castle) {
            const [from, to] = m.castle === 'kingside' ? [7, m.tc - 1] : [0, m.tc + 1];
            b[m.tr][from] = b[m.tr][to];
            b[m.tr][to] = null;
        }
        b[m.fr][m.fc] = u.moving;
        b[m.tr][m.tc] = u.captured;
        pos.hasMoved = u.prevMoved;
        pos.domi = u.prevDomi;
    }

    /** Moves of `color`, captures first (most valuable victim, then least valuable attacker). */
    function generate(pos, color, capturesOnly = false) {
        const moves = [];
        const b = pos.board;
        pos.turn = color;
        for (const [r, c] of squares()) {
            const p = b[r][c];
            if (!p || p === WALL || Rules.getColor(p) !== color) continue;
            for (const m of Rules.getValidMoves(pos, r, c)) {
                if (capturesOnly && !m.capture) continue;
                const victim = m.capture ? b[m.r][m.c] : null;
                const order = victim ? 10 * (victim.toLowerCase() === 'k' ? WIN : VALUES[victim.toLowerCase()] || 0) - (VALUES[p.toLowerCase()] || 0) : -INF;
                moves.push({ fr: r, fc: c, tr: m.r, tc: m.c, castle: m.castle, order });
            }
        }
        return moves.sort((a, b2) => b2.order - a.order);
    }

    function tick(ctx) {
        if ((++ctx.nodes & 255) === 0 && Date.now() > ctx.deadline) throw TIMEOUT;
    }

    /** Captures only, until the position is quiet (score for `color`, to move). */
    function quiesce(pos, color, alpha, beta, ctx, depth = 0) {
        tick(ctx);
        const standPat = evaluate(pos, color, ctx.profile, ctx.cards);
        if (standPat >= beta || depth >= 6) return standPat;
        if (standPat > alpha) alpha = standPat;
        for (const m of generate(pos, color, true)) {
            const u = make(pos, m);
            const v = !u.reverted && u.captured && u.captured.toLowerCase() === 'k' ? WIN : -quiesce(pos, other(color), -beta, -alpha, ctx, depth + 1);
            unmake(pos, m, u);
            if (v >= beta) return v;
            if (v > alpha) alpha = v;
        }
        return alpha;
    }

    /** Negamax with alpha-beta: the score for `color`, to move, `depth` plies ahead. */
    function negamax(pos, color, depth, alpha, beta, ctx) {
        if (depth <= 0) return quiesce(pos, color, alpha, beta, ctx);
        tick(ctx);
        const moves = generate(pos, color);
        if (moves.length === 0) return evaluate(pos, color, ctx.profile, ctx.cards);
        let best = -INF;
        for (const m of moves) {
            const u = make(pos, m);
            // A king taken ends the game; sooner is better.
            const v = !u.reverted && u.captured && u.captured.toLowerCase() === 'k' ? WIN + depth : -negamax(pos, other(color), depth - 1, -beta, -alpha, ctx);
            unmake(pos, m, u);
            if (v > best) best = v;
            if (v > alpha) alpha = v;
            if (alpha >= beta) break;
        }
        return best;
    }

    // --- The root: real rules, through game.js, on copies of the game ---

    const SPELL_FIELDS = ['activeSpellId', 'spellCard', 'spellCaster', 'targetingState', 'tpSource', 'sacrificePiece', 'swapPiece1', 'sidestepFrom', 'sniperBishop'];

    /** A copy of the game for `me` to try its spells on. */
    function cloneGame(state) {
        const copy = {
            board: state.board.map((row) => [...row]),
            turn: state.turn,
            frozenPieces: state.frozenPieces.map((f) => ({ ...f })),
            shieldedPieces: state.shieldedPieces.map((s) => ({ ...s })),
            traps: state.traps.map((t) => ({ ...t })), // Traps are visible to both players
            leapFrogActive: state.leapFrogActive, promotionActive: state.promotionActive, assassinActive: state.assassinActive,
            ghostActive: state.ghostActive, cannibalismActive: state.cannibalismActive,
            history: [],
            doubleTroubleState: state.doubleTroubleState ? { ...state.doubleTroubleState } : null,
            domiReversiPiece: state.domiReversiPiece ? { ...state.domiReversiPiece } : null,
            lastPlayedCardId: state.lastPlayedCardId,
            capturedByWhite: [...state.capturedByWhite],
            capturedByBlack: [...state.capturedByBlack],
            hasMoved: { ...state.hasMoved },
            usedCards: { white: [...state.usedCards.white], black: [...state.usedCards.black] },
            winner: state.winner,
            assassinTargets: state.assassinTargets ? state.assassinTargets.map((t) => ({ ...t })) : null,
        };
        for (const f of SPELL_FIELDS) copy[f] = state[f] && typeof state[f] === 'object' ? { ...state[f] } : (state[f] ?? null);
        return copy;
    }

    /** Value for `me` of a game copy, `plies` plies ahead (whoever is to move). */
    function valueOf(game, me, plies, alpha, ctx) {
        if (game.winner) return (game.winner.toLowerCase() === me ? 1 : -1) * (WIN + plies + 1);
        ctx.cards = hands(game, ctx.decks);
        if (game.turn === me) {
            if (plies <= 0) return quiesce(searchPosition(game), me, alpha, INF, ctx);
            return bestRootMove(game, me, plies, alpha, ctx).value;
        }
        return -negamax(searchPosition(game), other(me), plies, -INF, -alpha, ctx);
    }

    /** All moves of the player to move in a game copy, as { fr, fc, tr, tc }, captures first. */
    function rootMoves(game, me, random) {
        const moves = [];
        for (const [r, c] of squares()) {
            const p = game.board[r][c];
            if (!p || p === WALL || Rules.getColor(p) !== me) continue;
            for (const m of Rules.getValidMoves(game, r, c)) {
                const victim = m.capture ? game.board[m.r][m.c] : null;
                moves.push({ fr: r, fc: c, tr: m.r, tc: m.c, order: (victim ? VALUES[victim.toLowerCase()] || 0 : 0) + random() });
            }
        }
        return moves.sort((a, b) => b.order - a.order);
    }

    /** Play a move on a copy of the game; returns the copies after it (one per Assassin victim). */
    function afterMove(game, me, m) {
        const child = cloneGame(game);
        const result = Game.move(child, m.fr, m.fc, m.tr, m.tc);
        if (result === 'reverted') return [{ game: child }];
        if (result === 'assassin_kill') {
            return child.assassinTargets.map((t) => {
                const g = cloneGame(child);
                Game.clickSquare(g, t.r, t.c);
                Game.endTurn(g);
                return { game: g, kill: { r: t.r, c: t.c } };
            });
        }
        Game.endTurn(child);
        return [{ game: child }];
    }

    /** The best move of `me` (to move in `game`), searched `plies` plies ahead. */
    function bestRootMove(game, me, plies, alpha, ctx) {
        let best = { value: -INF, move: null, kill: null };
        for (const m of rootMoves(game, me, ctx.random)) {
            for (const next of afterMove(game, me, m)) {
                const v = valueOf(next.game, me, plies - 1, Math.max(alpha, best.value), ctx);
                if (v > best.value) best = { value: v, move: { from: { r: m.fr, c: m.fc }, to: { r: m.tr, c: m.tc } }, kill: next.kill || null };
            }
        }
        if (!best.move) best.value = evaluate(game, me, ctx.profile, hands(game, ctx.decks));
        return best;
    }

    /** Every way to cast one of `cards` now: { cardId, targets, game (the copy after it) }. */
    function spellOptions(game, me, cards, random) {
        const options = [];
        const pick = (g, cardId, targets) => {
            for (const [r, c] of squares()) {
                const next = cloneGame(g);
                const res = Game.clickSquare(next, r, c, random);
                const chosen = [...targets, { r, c }];
                if (res.status === 'next') pick(next, cardId, chosen);
                else if (res.status === 'done') {
                    if (res.endTurn) Game.endTurn(next);
                    Game.completeSpell(next);
                    options.push({ cardId, targets: chosen, game: next });
                }
            }
        };
        for (const cardId of new Set(cards)) {
            const g = cloneGame(game);
            const res = Game.activateSpell(g, cardId);
            if (res.status === 'instant') options.push({ cardId, targets: [], game: g });
            else if (res.status === 'targeting') pick(g, cardId, []);
        }
        return options;
    }

    /**
     * The bot's turn for `me`: { spell: { cardId, targets } | null, move, kill }.
     * `decks`: both players' decks ({ white, black }, the cards used are in the state).
     * The move is for the position without a spell; after a spell that keeps the turn,
     * ask bestMove again. The search deepens until `profile.depth` or the time limit.
     */
    function chooseTurn(state, me, decks, profile = DEFAULT_PROFILE, random = Math.random, timeLimitMs = Infinity) {
        const ctx = { profile, decks, cards: null, random, nodes: 0, deadline: Date.now() + timeLimitMs };
        const game = cloneGame(state);
        game.turn = me;
        const mine = hands(game, decks)[me];
        const options = profile.spells === 'search' && mine.length ? spellOptions(game, me, mine, random) : [];
        let result = null;
        let shortlist = options;
        for (let plies = 1; plies <= profile.depth; plies++) {
            try {
                const keep = bestRootMove(game, me, plies, -INF, ctx);
                let choice = { spell: null, move: keep.move, kill: keep.kill, value: keep.value };
                const scored = [];
                for (const o of shortlist) {
                    // A spell is one ply, like a move: the turn may go on (free spells) or not.
                    const v = valueOf(o.game, me, o.game.turn === me ? plies : plies - 1, choice.value, ctx);
                    scored.push({ o, v });
                    if (v > choice.value) choice = { spell: { cardId: o.cardId, targets: o.targets }, move: null, kill: null, value: v };
                }
                if (plies === 1) shortlist = scored.sort((a, b) => b.v - a.v).slice(0, profile.spellCandidates).map((s) => s.o);
                result = choice;
            } catch (e) {
                if (e !== TIMEOUT) throw e;
                break;
            }
        }
        return result || { spell: null, move: null, kill: null, value: 0 };
    }

    /** The best move only (after a spell that keeps the turn): { move, kill }. */
    function bestMove(state, me, decks, profile = DEFAULT_PROFILE, random = Math.random, timeLimitMs = Infinity) {
        return chooseTurn(state, me, decks, { ...profile, spells: 'none' }, random, timeLimitMs);
    }

    return {
        VALUES, LEGACY_GENES, heuristicSpell, DEFAULT_PROFILE, LEGACY_PROFILE, WIN,
        evaluate, hands, cloneGame, spellOptions, chooseTurn, bestMove,
    };
});
