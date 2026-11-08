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

    return { VALUES, LEGACY_GENES, heuristicSpell };
});
