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

// The search bot: spells tried on copies of the game, then the replies searched.

const noCards = { white: [], black: [] };
const P = (depth = 2, extra = {}) => ({ ...Bot.DEFAULT_PROFILE, depth, ...extra });
const fixed = () => 0.5;

test('search: takes a hanging queen, and takes the king when it can', () => {
    const s = game({ '0,4': 'k', '7,4': 'K', '4,4': 'Q', '1,4': 'r', '6,0': 'P' });
    const plan = Bot.chooseTurn(s, 'black', noCards, P(), fixed);
    assert.deepEqual(plan.move, { from: { r: 1, c: 4 }, to: { r: 4, c: 4 } });
    const k = game({ '0,4': 'k', '7,4': 'K', '7,0': 'r', '0,0': 'Q' });
    const win = Bot.chooseTurn(k, 'black', noCards, P(), fixed);
    assert.deepEqual(win.move.to, { r: 7, c: 4 });
    assert.ok(win.value >= Bot.WIN);
});

test('search: casts Sniper only when it wins material no move can', () => {
    // The queen is on the bishop's diagonal but defended: taking it with the bishop loses
    // the bishop; sniping it costs nothing on the board.
    const s = game({ '0,4': 'k', '7,4': 'K', '4,4': 'Q', '2,2': 'b', '5,5': 'P', '6,0': 'P' });
    const plan = Bot.chooseTurn(s, 'black', { white: [], black: [7] }, P(), fixed);
    assert.deepEqual(plan.spell, { cardId: 7, targets: [{ r: 2, c: 2 }, { r: 4, c: 4 }] });
    // A pawn is not worth the card (Sniper is valued 250).
    const pawn = game({ '0,4': 'k', '7,4': 'K', '4,4': 'P', '2,2': 'b', '5,5': 'P', '6,0': 'P' });
    assert.equal(Bot.chooseTurn(pawn, 'black', { white: [], black: [7] }, P(), fixed).spell, null);
});

test('search: a quiet position keeps its cards', () => {
    const s = G.newGame();
    s.turn = 'white';
    const plan = Bot.chooseTurn(s, 'white', { white: [8, 16, 4], black: [] }, P(), fixed);
    assert.equal(plan.spell, null);
    assert.ok(plan.move);
});

test('search: Assassin, once active, picks the most valuable victim', () => {
    // The pawn steps between the queen and the knight, then takes the queen.
    const t = game({ '0,4': 'k', '7,4': 'K', '4,1': 'q', '4,3': 'n', '6,2': 'P' }, 'white');
    t.assassinActive = true;
    const best = Bot.bestMove(t, 'white', noCards, P(1), fixed);
    assert.deepEqual(best.move, { from: { r: 6, c: 2 }, to: { r: 4, c: 2 } });
    assert.deepEqual(best.kill, { r: 4, c: 1 });
});

test('search: the game given is left untouched', () => {
    const s = game({ '0,4': 'k', '7,4': 'K', '4,4': 'Q', '2,2': 'b', '5,5': 'P', '6,0': 'P' });
    const before = JSON.stringify(s);
    Bot.chooseTurn(s, 'black', { white: [18], black: [7, 3, 10] }, P(), Math.random);
    assert.equal(JSON.stringify(s), before);
});

test('search: the time limit is kept, and a move is still returned', () => {
    const s = G.newGame();
    const started = Date.now();
    const plan = Bot.chooseTurn(s, 'white', { white: [6, 4, 17], black: [3, 7, 18] }, P(8), fixed, 100);
    assert.ok(Date.now() - started < 1000);
    assert.ok(plan.move || plan.spell);
});

test('evaluate: the start is even; cards in hand and pieces taken over by Domi Reversi count', () => {
    const s = G.newGame();
    assert.equal(Bot.evaluate(s, 'white', Bot.DEFAULT_PROFILE), 0);
    assert.equal(Bot.evaluate(s, 'black', Bot.DEFAULT_PROFILE), 0);
    const withCards = Bot.evaluate(s, 'white', Bot.DEFAULT_PROFILE, { white: [7], black: [] });
    assert.equal(withCards, Bot.DEFAULT_PROFILE.cardValues[7]);
    // A black rook taken over (now white) still counts for black.
    const d = game({ '0,4': 'k', '7,4': 'K', '4,4': 'R' });
    const plain = Bot.evaluate(d, 'black', Bot.DEFAULT_PROFILE);
    d.domiReversiPiece = { r: 4, c: 4, originalColor: 'black', caster: 'white', activeTurn: false };
    assert.ok(Bot.evaluate(d, 'black', Bot.DEFAULT_PROFILE) > plain + 900);
});

test('spellOptions: every legal target of each card, through the real rules', () => {
    const s = game({ '0,4': 'k', '7,4': 'K', '4,4': 'Q', '2,2': 'b' });
    const options = Bot.spellOptions(s, 'black', [7, 15, 20], fixed);
    const by = (id) => options.filter((o) => o.cardId === id);
    assert.equal(by(7).length, 1); // the bishop on the queen
    assert.equal(by(15).length, 1); // freeze the queen (not the king)
    assert.equal(by(20).length, 1); // Promotion: no target
    assert.equal(by(20)[0].game.turn, 'black'); // a flag spell keeps the turn
    assert.equal(by(7)[0].game.turn, 'white'); // Sniper ends it
});
