// Unit tests for games/chesspell/game.js: turns, moves and every spell.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const G = require('../../games/chesspell/game.js');

const empty = () => Array.from({ length: 8 }, () => Array(8).fill(null));

/** A game on a custom board: `pieces` maps "r,c" to a piece letter. */
function game(pieces, turn = 'white') {
    const s = G.newGame();
    s.board = empty();
    for (const [key, p] of Object.entries(pieces)) {
        const [r, c] = key.split(',').map(Number);
        s.board[r][c] = p;
    }
    s.turn = turn;
    return s;
}

/** Cast a spell and click its targets; ends the turn when the spell says so. */
function cast(s, cardId, ...targets) {
    const first = G.activateSpell(s, cardId);
    let result = first;
    for (const [r, c] of targets) result = G.clickSquare(s, r, c, () => 0);
    if (result.status === 'done') {
        if (result.endTurn) G.endTurn(s);
        G.completeSpell(s);
    }
    return { first, result };
}

test('a new game: white to move, standard position, nothing used', () => {
    const s = G.newGame();
    assert.equal(s.turn, 'white');
    assert.equal(s.board[7][4], 'K');
    assert.deepEqual(s.usedCards, { white: [], black: [] });
    assert.equal(s.winner, null);
});

test('isLegalMove: only the player to move, only legal moves, never during targeting', () => {
    const s = G.newGame();
    assert.equal(G.isLegalMove(s, 6, 4, 4, 4), true); // e4
    assert.equal(G.isLegalMove(s, 6, 4, 3, 4), false); // e5 in one move
    assert.equal(G.isLegalMove(s, 1, 4, 3, 4), false); // black, not their turn
    assert.equal(G.isLegalMove(s, 4, 4, 3, 4), false); // empty square
    assert.equal(G.isLegalMove(s, 6, 4, 4, 9), false); // off the board
    G.activateSpell(s, 8);
    assert.equal(G.isLegalMove(s, 6, 4, 4, 4), false);
});

test('a capture records the piece; capturing the king names the winner', () => {
    const s = game({ '4,4': 'Q', '1,4': 'p', '0,4': 'k' });
    assert.equal(G.move(s, 4, 4, 1, 4), 'endTurn');
    assert.deepEqual(s.capturedByWhite, ['p']);
    G.endTurn(s);
    s.turn = 'white';
    G.move(s, 1, 4, 0, 4);
    assert.equal(s.winner, 'White');
});

test('Wall (8) puts a wall on an empty square and ends the turn; the card is used', () => {
    const s = G.newGame();
    const { first } = cast(s, 8, [4, 0]);
    assert.equal(first.status, 'targeting');
    assert.equal(s.board[4][0], 'W');
    assert.equal(s.turn, 'black');
    assert.deepEqual(s.usedCards.white, [8]);
});

test('Freeze (15) is a free action and refuses the king', () => {
    const s = game({ '7,4': 'K', '0,4': 'k', '1,1': 'p' });
    G.activateSpell(s, 15);
    assert.equal(G.clickSquare(s, 0, 4).status, 'invalid');
    assert.equal(G.clickSquare(s, 1, 1).status, 'done');
    assert.deepEqual(s.frozenPieces, [{ r: 1, c: 1, duration: 2 }]);
    assert.equal(s.turn, 'white');
});

test('Teleport (17) sends a piece to an empty square of its back rank', () => {
    const s = game({ '4,4': 'N', '7,4': 'K' });
    cast(s, 17, [4, 4], [7, 0]);
    assert.equal(s.board[7][0], 'N');
    assert.equal(s.board[4][4], null);
});

test('Sacrifice (14) turns a pawn into the sacrificed piece', () => {
    const s = game({ '7,3': 'Q', '6,0': 'P' });
    cast(s, 14, [7, 3], [6, 0]);
    assert.equal(s.board[6][0], 'Q');
    assert.equal(s.board[7][3], null);
    assert.deepEqual(s.capturedByBlack, ['Q']);
});

test('Tornado (10) shuffles the 3x3 area with the given random source', () => {
    const s = game({ '3,3': 'P', '3,4': 'n', '4,4': 'B' });
    G.activateSpell(s, 10);
    G.clickSquare(s, 3, 4, () => 0);
    assert.deepEqual([s.board[3][3], s.board[3][4], s.board[4][4]], ['n', 'B', 'P']);
});

test('Swap (6) exchanges two own non-king pieces', () => {
    const s = game({ '7,0': 'R', '7,1': 'N', '7,4': 'K' });
    G.activateSpell(s, 6);
    assert.equal(G.clickSquare(s, 7, 4).status, 'invalid');
    G.clickSquare(s, 7, 0);
    assert.equal(G.clickSquare(s, 7, 0).status, 'invalid');
    G.clickSquare(s, 7, 1);
    assert.deepEqual([s.board[7][0], s.board[7][1]], ['N', 'R']);
});

test('Sidestep (4) moves a piece to an adjacent empty square only', () => {
    const s = game({ '4,4': 'R' });
    G.activateSpell(s, 4);
    G.clickSquare(s, 4, 4);
    assert.equal(G.clickSquare(s, 2, 4).status, 'invalid');
    assert.equal(G.clickSquare(s, 3, 5).status, 'done');
    assert.equal(s.board[3][5], 'R');
});

test('Sniper (7): a bishop destroys an enemy on its diagonal, line of sight required', () => {
    const s = game({ '7,2': 'B', '4,5': 'n', '5,4': 'p', '0,4': 'k' });
    G.activateSpell(s, 7);
    G.clickSquare(s, 7, 2);
    assert.equal(G.clickSquare(s, 0, 4).status, 'invalid'); // the king
    G.clickSquare(s, 5, 4); // adjacent diagonal, nothing in between
    assert.equal(s.board[5][4], null);
    assert.equal(s.board[7][2], 'B');
});

test('Shield (11) protects a piece and keeps the turn', () => {
    const s = game({ '4,4': 'R' });
    cast(s, 11, [4, 4]);
    assert.deepEqual(s.shieldedPieces, [{ r: 4, c: 4, duration: 2 }]);
    assert.equal(s.turn, 'white');
});

test("Trap (16) destroys the first enemy piece to land there", () => {
    const s = game({ '1,4': 'p', '7,4': 'K', '0,0': 'k' });
    cast(s, 16, [3, 4]);
    assert.equal(s.turn, 'black');
    G.move(s, 1, 4, 3, 4);
    assert.equal(s.board[3][4], null);
    assert.deepEqual(s.traps, []);
});

test('Revive (9) needs a captured pawn and brings it back on the pawn rank', () => {
    const s = game({ '7,4': 'K' });
    assert.equal(G.activateSpell(s, 9).status, 'refused');
    s.capturedByBlack.push('P');
    G.activateSpell(s, 9);
    assert.equal(G.clickSquare(s, 5, 0).status, 'invalid');
    G.clickSquare(s, 6, 0);
    assert.equal(s.board[6][0], 'P');
    assert.deepEqual(s.capturedByBlack, []);
});

test('Domi Reversi (3) takes an enemy piece for a turn', () => {
    const s = game({ '3,3': 'n', '7,4': 'K', '0,4': 'k' });
    cast(s, 3, [3, 3]);
    assert.equal(s.board[3][3], 'N');
    assert.equal(s.turn, 'black');
});

test('Kamikaze (18) destroys the piece and everything around it except kings', () => {
    const s = game({ '4,4': 'R', '3,3': 'p', '5,5': 'K', '4,5': 'n' });
    cast(s, 18, [4, 4]);
    assert.equal(s.board[4][4], null);
    assert.equal(s.board[3][3], null);
    assert.equal(s.board[4][5], null);
    assert.equal(s.board[5][5], 'K');
});

test('Assassin (19): after the move, an adjacent enemy is picked and destroyed', () => {
    const s = game({ '6,0': 'P', '4,1': 'n', '0,4': 'k' });
    assert.equal(G.activateSpell(s, 19).status, 'instant');
    assert.equal(G.move(s, 6, 0, 4, 0), 'assassin_kill');
    assert.equal(G.isLegalMove(s, 4, 0, 3, 0), false); // must pick the victim first
    assert.equal(G.clickSquare(s, 0, 4).status, 'invalid');
    assert.equal(G.clickSquare(s, 4, 1).status, 'done');
    assert.equal(s.board[4][1], null);
});

test('Double Trouble (2): the caster plays twice, then the opponent too', () => {
    const s = G.newGame();
    cast(s, 2);
    G.move(s, 6, 0, 5, 0); G.endTurn(s);
    assert.equal(s.turn, 'white');
    G.move(s, 6, 1, 5, 1); G.endTurn(s);
    assert.equal(s.turn, 'black');
    G.move(s, 1, 0, 2, 0); G.endTurn(s);
    assert.equal(s.turn, 'black');
    G.move(s, 1, 1, 2, 1); G.endTurn(s);
    assert.equal(s.turn, 'white');
});

test('Mirror (13) replays the last card played, and needs one', () => {
    const s = G.newGame();
    assert.equal(G.activateSpell(s, 13).status, 'refused');
    assert.deepEqual(s.usedCards.white, []);
    cast(s, 8, [4, 0]); // white: Wall
    const { first } = cast(s, 13, [3, 7]); // black mirrors it
    assert.equal(first.status, 'targeting');
    assert.equal(s.board[3][7], 'W');
    assert.deepEqual(s.usedCards.black, [13]);
});

test('flag spells (Cannibalism, Ghost, Leap Frog, Promotion) act at once and use the card', () => {
    for (const [id, flag] of [[1, 'cannibalismActive'], [5, 'ghostActive'], [12, 'leapFrogActive'], [20, 'promotionActive']]) {
        const s = G.newGame();
        assert.equal(G.activateSpell(s, id).status, 'instant');
        assert.equal(s[flag], true);
        assert.deepEqual(s.usedCards.white, [id]);
    }
});

test("snapshot: plain data, and each player only sees their own traps", () => {
    const s = G.newGame();
    s.traps.push({ r: 4, c: 4, owner: 'white' }, { r: 3, c: 3, owner: 'black' });
    const forWhite = G.snapshot(s, 'white');
    assert.deepEqual(forWhite.traps, [{ r: 4, c: 4, owner: 'white' }]);
    assert.deepEqual(G.snapshot(s, 'black').traps, [{ r: 3, c: 3, owner: 'black' }]);
    forWhite.board[0][0] = null;
    assert.equal(s.board[0][0], 'r'); // a copy, not the live state
});
