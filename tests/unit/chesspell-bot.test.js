// Unit tests for games/chesspell/bot.js: the heuristic spells (one rule per spell).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../../games/chesspell/game.js');
const Bot = require('../../games/chesspell/bot.js');

const empty = () => Array.from({ length: 8 }, () => Array(8).fill(null));

/** A game on a custom board: `pieces` maps "r,c" to a piece letter. */
function game(pieces, turn = 'black') {
    const s = G.newGame();
    s.board = empty();
    for (const [key, p] of Object.entries(pieces)) {
        const [r, c] = key.split(',').map(Number);
        s.board[r][c] = p;
    }
    s.turn = turn;
    return s;
}

/** Genes that always cast (no patience, every probability 1); thresholds can be set. */
function eager(overrides = {}) {
    const genes = JSON.parse(JSON.stringify(Bot.LEGACY_GENES));
    genes.meta.patience = 0;
    for (const g of Object.values(genes)) for (const k of Object.keys(g)) if (/Prob|prob/.test(k)) g[k] = 1;
    for (const [spell, values] of Object.entries(overrides)) Object.assign(genes[spell], values);
    return genes;
}

const half = () => 0.5; // never "aggressive", sorts keep their order, random picks take the middle
const cast = (s, cards, genes = eager(), me = 'black', random = half) => Bot.heuristicSpell(s, me, cards, genes, random);

test('no card, or patience: nothing is cast', () => {
    const s = G.newGame();
    s.turn = 'black';
    assert.equal(cast(s, []), null);
    const patient = eager();
    patient.meta.patience = 1;
    assert.equal(cast(s, [1], patient), null);
    // ...unless desperate (down more than 300 in material) or late in the game (few pieces).
    const behind = G.newGame();
    behind.board[0][3] = null;
    assert.deepEqual(cast(behind, [1], patient), { cardId: 1, spellId: 1, targets: [] });
    assert.deepEqual(cast(game({ '0,4': 'k', '7,4': 'K' }), [1], patient), { cardId: 1, spellId: 1, targets: [] });
});

test('flag spells are cast without targets', () => {
    const s = game({ '0,4': 'k', '7,4': 'K' });
    for (const id of [1, 2, 5, 12, 19, 20]) assert.deepEqual(cast(s, [id]), { cardId: id, spellId: id, targets: [] }, `card ${id}`);
    const never = eager({ ghost: { defensiveProb: 0 } });
    assert.equal(cast(s, [5], never), null);
});

test('Mirror replays the last card played, and is kept when there is none', () => {
    const s = game({ '0,4': 'k', '7,4': 'K' });
    assert.equal(cast(s, [13]), null);
    s.lastPlayedCardId = 20;
    assert.deepEqual(cast(s, [13]), { cardId: 13, spellId: 20, targets: [] });
});

test('Freeze and Sniper aim at the most valuable enemy worth the threshold', () => {
    const s = game({ '0,4': 'k', '7,4': 'K', '3,3': 'Q', '5,5': 'R', '2,2': 'b' });
    assert.deepEqual(cast(s, [15], eager({ freeze: { minVal: 900 } })).targets, [{ r: 3, c: 3 }]);
    assert.equal(cast(s, [15], eager({ freeze: { minVal: 901 } })), null);
    // Sniper: the bishop on 2,2 sees the queen on its diagonal.
    assert.deepEqual(cast(s, [7], eager({ sniper: { minVal: 900 } })).targets, [{ r: 2, c: 2 }, { r: 3, c: 3 }]);
    // Blocked line of sight: no shot.
    s.board[3][3] = null;
    s.board[4][4] = 'Q';
    s.board[3][3] = 'P';
    assert.equal(cast(s, [7], eager({ sniper: { minVal: 900 } })), null);
    // No bishop: no shot.
    const nob = game({ '0,4': 'k', '7,4': 'K', '3,3': 'Q' });
    assert.equal(cast(nob, [7], eager({ sniper: { minVal: 900 } })), null);
});

test('Shield protects our most valuable piece; Sacrifice turns a pawn into our cheapest officer', () => {
    const s = game({ '0,4': 'k', '7,4': 'K', '1,0': 'p', '2,5': 'p', '0,0': 'r', '0,7': 'q' });
    assert.deepEqual(cast(s, [11]).targets, [{ r: 0, c: 4 }]);
    // Sacrifice: the rook (cheapest non-pawn), and the first pawn of the last row with one.
    assert.deepEqual(cast(s, [14], eager({ sacrifice: { minVal: 500 } })).targets, [{ r: 0, c: 0 }, { r: 2, c: 5 }]);
    assert.equal(cast(s, [14], eager({ sacrifice: { minVal: 501 } })), null);
});

test('Wall and Trap go on an empty square of their rows; Tornado in the middle', () => {
    const s = game({ '0,4': 'k', '7,4': 'K' });
    const wall = cast(s, [8]).targets[0];
    assert.ok(wall.r >= 3 && wall.r <= 5 && !s.board[wall.r][wall.c]);
    const white = cast(game({ '0,4': 'k', '7,4': 'K' }, 'white'), [8], eager(), 'white').targets[0];
    assert.ok(white.r >= 2 && white.r <= 4, 'white walls mirror black ones');
    const trap = cast(s, [16]).targets[0];
    assert.ok(trap.r >= 2 && trap.r <= 6);
    const t = cast(s, [10]).targets[0];
    assert.ok(t.r >= 2 && t.r <= 5 && t.c >= 2 && t.c <= 5);
});

test('Sidestep, Swap and Teleport pick our own pieces and free squares', () => {
    const s = game({ '0,4': 'k', '7,4': 'K', '0,0': 'r', '1,1': 'n' });
    // The rook on 0,0 fits first, then the knight, first piece of a later row, takes over.
    assert.deepEqual(cast(s, [4]).targets, [{ r: 1, c: 1 }, { r: 0, c: 1 }]);
    assert.deepEqual(cast(game({ '0,4': 'k', '7,4': 'K', '0,0': 'r' }), [4]).targets, [{ r: 0, c: 0 }, { r: 1, c: 0 }]);
    assert.deepEqual(cast(s, [6]).targets, [{ r: 0, c: 0 }, { r: 1, c: 1 }]);
    assert.equal(cast(game({ '0,4': 'k', '7,4': 'K', '0,0': 'r' }), [6]), null); // one piece only
    assert.deepEqual(cast(s, [17]).targets, [{ r: 1, c: 1 }, { r: 0, c: 1 }]);
});

test('Revive needs a pawn of ours captured, and a free square on our pawn rank', () => {
    const s = game({ '0,4': 'k', '7,4': 'K' });
    assert.equal(cast(s, [9]), null);
    s.capturedByWhite.push('p');
    assert.deepEqual(cast(s, [9]).targets, [{ r: 1, c: 0 }]);
    const w = game({ '0,4': 'k', '7,4': 'K' }, 'white');
    w.capturedByBlack.push('P');
    assert.deepEqual(cast(w, [9], eager(), 'white').targets, [{ r: 6, c: 0 }]);
});

test('Domi Reversi takes the most valuable enemy that would not be captured back', () => {
    // Once ours, each white rook could be taken by the other; the bishop on 5,7 could not.
    const s = game({ '0,4': 'k', '7,4': 'K', '4,0': 'R', '7,0': 'R', '5,7': 'B' });
    assert.deepEqual(cast(s, [3], eager({ domiReversi: { minValLate: 300 } })).targets, [{ r: 5, c: 7 }]);
    assert.equal(cast(s, [3], eager({ domiReversi: { minValLate: 331 } })), null);
    assert.equal(s.board[5][7], 'B', 'the board is left as it was');
});

test('Kamikaze blows up where it wins the most material', () => {
    const s = game({ '0,4': 'k', '7,4': 'K', '4,4': 'n', '3,3': 'Q', '3,4': 'R', '6,6': 'p', '5,5': 'B' });
    assert.deepEqual(cast(s, [18], eager({ kamikaze: { minValDiff: 500 } })).targets, [{ r: 4, c: 4 }]);
    assert.equal(cast(s, [18], eager({ kamikaze: { minValDiff: 2000 } })), null);
});

test('cards are tried in random order; one that does not apply is skipped', () => {
    const s = game({ '0,4': 'k', '7,4': 'K' });
    // Revive does not apply (no captured pawn), so the next card is cast.
    assert.equal(cast(s, [9, 20]).cardId, 20);
});
