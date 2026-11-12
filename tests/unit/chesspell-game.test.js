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

test('Sniper (7) refuses a wall: it is not a piece', () => {
    const s = game({ '7,2': 'B', '5,4': 'W', '0,4': 'k' });
    G.activateSpell(s, 7);
    G.clickSquare(s, 7, 2);
    assert.equal(G.clickSquare(s, 5, 4).status, 'invalid');
    assert.equal(s.board[5][4], 'W');
    assert.deepEqual(s.capturedByWhite, []);
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

test('Domi Reversi (3) refuses a wall: it has no owner to give it back to', () => {
    const s = game({ '3,3': 'W', '7,4': 'K', '0,4': 'k' }, 'black');
    G.activateSpell(s, 3);
    assert.equal(G.clickSquare(s, 3, 3).status, 'invalid');
    assert.equal(s.board[3][3], 'W');
    assert.equal(s.domiReversiPiece, null);
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

test("snapshot: plain data, and both players see every trap", () => {
    const s = G.newGame();
    s.traps.push({ r: 4, c: 4, owner: 'white' }, { r: 3, c: 3, owner: 'black' });
    const copy = G.snapshot(s);
    assert.deepEqual(copy.traps, [{ r: 4, c: 4, owner: 'white' }, { r: 3, c: 3, owner: 'black' }]);
    copy.board[0][0] = null;
    assert.equal(s.board[0][0], 'r'); // a copy, not the live state
});

// move(): every branch of the referee's move, so that a mistake in it fails a test
// (found by mutation testing, /crap).

test('a king jumping two columns with Leap Frog does not castle', () => {
    // The king jumps from (1,2) to (0,0): it must land there, the rook next to it stays.
    const s = game({ '1,2': 'k', '0,1': 'r', '7,4': 'K' }, 'black');
    s.leapFrogActive = true;
    assert.equal(G.move(s, 1, 2, 0, 0), 'endTurn');
    assert.equal(s.board[0][0], 'k');
    assert.equal(s.board[0][1], 'r');
});

test('move keeps an independent copy of the position for undo, at most 5', () => {
    const s = game({ '6,0': 'P', '5,5': 'N', '7,4': 'K', '0,4': 'k' });
    s.shieldedPieces.push({ r: 6, c: 0 });
    s.traps.push({ r: 2, c: 2, owner: 'black' });
    s.frozenPieces.push({ r: 0, c: 4 });
    s.doubleTroubleState = { player: 'white', movesLeft: 1 };
    s.domiReversiPiece = { r: 5, c: 5, originalColor: 'black' };
    s.capturedByWhite.push('p');
    s.capturedByBlack.push('P');
    G.move(s, 6, 0, 5, 0);
    const saved = s.history.at(-1);
    assert.equal(saved.board[6][0], 'P');
    assert.equal(saved.board[5][0], null);
    assert.equal(saved.turn, 'white');
    assert.deepEqual(saved.capturedByWhite, ['p']);
    assert.deepEqual(saved.capturedByBlack, ['P']);
    assert.deepEqual(saved.shieldedPieces, [{ r: 6, c: 0 }]);
    assert.deepEqual(saved.traps, [{ r: 2, c: 2, owner: 'black' }]);
    assert.deepEqual(saved.frozenPieces, [{ r: 0, c: 4 }]);
    assert.deepEqual(saved.doubleTroubleState, { player: 'white', movesLeft: 1 });
    assert.deepEqual(saved.domiReversiPiece, { r: 5, c: 5, originalColor: 'black' });
    // Copies, not the live objects.
    s.capturedByWhite.push('n');
    s.capturedByBlack.push('N');
    s.shieldedPieces[0].r = 0;
    s.traps[0].r = 0;
    s.frozenPieces[0].r = 1;
    s.doubleTroubleState.movesLeft = 0;
    s.domiReversiPiece.r = 0;
    assert.deepEqual(saved.capturedByWhite, ['p']);
    assert.deepEqual(saved.capturedByBlack, ['P']);
    assert.equal(saved.shieldedPieces[0].r, 6);
    assert.equal(saved.traps[0].r, 2);
    assert.equal(saved.frozenPieces[0].r, 0);
    assert.equal(saved.doubleTroubleState.movesLeft, 1);
    assert.equal(saved.domiReversiPiece.r, 5);

    const t = game({ '7,0': 'R', '7,4': 'K', '0,4': 'k' });
    for (let i = 0; i < 7; i++) G.move(t, 7, i % 2, 7, (i + 1) % 2);
    assert.equal(t.history.length, 5);
    assert.deepEqual(t.history[0].doubleTroubleState, G.newGame().doubleTroubleState);
    assert.notEqual(t.history[0].doubleTroubleState, t.doubleTroubleState);
    assert.equal(t.history[0].domiReversiPiece, null);
});

test('move: capturing the piece taken by Domi Reversi gives it back instead', () => {
    for (const [owner, piece, back] of [['black', 'N', 'n'], ['white', 'n', 'N']]) {
        const s = game({ '3,3': piece, '5,3': 'Q', '7,4': 'K', '0,4': 'k' });
        s.domiReversiPiece = { r: 3, c: 3, originalColor: owner };
        assert.equal(G.move(s, 5, 3, 3, 3), 'reverted');
        assert.equal(s.board[3][3], back);
        assert.equal(s.board[5][3], 'Q'); // the attacker did not move
        assert.equal(s.domiReversiPiece, null);
        assert.deepEqual(s.capturedByWhite, []);
    }
});

test('move: the piece taken by Domi Reversi is followed when it moves', () => {
    const s = game({ '3,3': 'N', '7,4': 'K', '0,4': 'k' });
    s.domiReversiPiece = { r: 3, c: 3, originalColor: 'black' };
    assert.equal(G.move(s, 3, 3, 5, 4), 'endTurn');
    assert.deepEqual(s.domiReversiPiece, { r: 5, c: 4, originalColor: 'black' });
    const t = game({ '3,3': 'N', '6,0': 'P', '7,4': 'K', '0,4': 'k' });
    t.domiReversiPiece = { r: 3, c: 3, originalColor: 'black' };
    G.move(t, 6, 0, 5, 0); // another piece: the record stays put
    assert.deepEqual(t.domiReversiPiece, { r: 3, c: 3, originalColor: 'black' });
});

test('move: Promotion turns the capturing piece into the captured type, in its own colour', () => {
    const s = game({ '4,4': 'P', '3,3': 'q', '7,4': 'K', '0,4': 'k' });
    s.promotionActive = true;
    G.move(s, 4, 4, 3, 3);
    assert.equal(s.board[3][3], 'Q');
    assert.equal(s.board[4][4], null);
    const b = game({ '3,3': 'p', '4,4': 'R', '7,4': 'K', '0,4': 'k' }, 'black');
    b.promotionActive = true;
    G.move(b, 3, 3, 4, 4);
    assert.equal(b.board[4][4], 'r');
    const quiet = game({ '4,4': 'P', '7,4': 'K', '0,4': 'k' });
    quiet.promotionActive = true;
    G.move(quiet, 4, 4, 3, 4); // no capture: no change
    assert.equal(quiet.board[3][4], 'P');
    const off = game({ '4,4': 'P', '3,3': 'q', '7,4': 'K', '0,4': 'k' });
    G.move(off, 4, 4, 3, 3); // spell not cast
    assert.equal(off.board[3][3], 'P');
});

test('move: castling brings the rook next to the king, on both sides', () => {
    const s = game({ '7,4': 'K', '7,7': 'R', '7,0': 'R', '0,4': 'k' });
    G.move(s, 7, 4, 7, 6);
    assert.equal(s.board[7][5], 'R');
    assert.equal(s.board[7][7], null);
    assert.equal(s.board[7][0], 'R');
    const q = game({ '0,4': 'k', '0,0': 'r', '0,7': 'r', '7,4': 'K' }, 'black');
    G.move(q, 0, 4, 0, 2);
    assert.equal(q.board[0][3], 'r');
    assert.equal(q.board[0][0], null);
    assert.equal(q.board[0][7], 'r');
    const step = game({ '7,4': 'K', '7,7': 'R', '0,4': 'k' });
    G.move(step, 7, 4, 7, 5); // one square: no castling
    assert.equal(step.board[7][7], 'R');
    const rook = game({ '7,3': 'R', '7,0': 'R', '7,6': 'K', '0,4': 'k' });
    G.move(rook, 7, 3, 7, 1); // a rook moving two squares is not a castle
    assert.equal(rook.board[7][0], 'R');
    assert.equal(rook.board[7][2], null);
});

test('move: the king and each corner rook lose their castling right when they move', () => {
    const cases = [
        ['K', 7, 4, 6, 4, 'whiteKing'], ['k', 0, 4, 1, 4, 'blackKing'],
        ['R', 7, 0, 6, 0, 'whiteRookA'], ['R', 7, 7, 6, 7, 'whiteRookH'],
        ['r', 0, 0, 1, 0, 'blackRookA'], ['r', 0, 7, 1, 7, 'blackRookH'],
    ];
    for (const [piece, r1, c1, r2, c2, flag] of cases) {
        const s = game({ [`${r1},${c1}`]: piece });
        G.move(s, r1, c1, r2, c2);
        const moved = Object.entries(s.hasMoved).filter(([, v]) => v).map(([k]) => k);
        assert.deepEqual(moved, [flag], `${piece} from ${r1},${c1}`);
    }
    // A rook away from its corner, or a rook of the other colour on it, changes nothing.
    for (const [piece, r1, c1] of [['R', 7, 3], ['R', 6, 0], ['R', 0, 0], ['r', 7, 7], ['r', 1, 7], ['Q', 7, 0]]) {
        const s = game({ [`${r1},${c1}`]: piece });
        G.move(s, r1, c1, 4, 4);
        assert.deepEqual(Object.values(s.hasMoved).filter(Boolean), [], `${piece} from ${r1},${c1}`);
    }
});

test('move: an enemy trap destroys the piece (not a king); an own trap does nothing', () => {
    const s = game({ '6,4': 'P', '7,4': 'K', '0,4': 'k' });
    s.traps.push({ r: 4, c: 0, owner: 'black' }, { r: 4, c: 4, owner: 'black' });
    assert.equal(G.move(s, 6, 4, 4, 4), 'endTurn');
    assert.equal(s.board[4][4], null);
    assert.deepEqual(s.capturedByBlack, ['P']);
    assert.deepEqual(s.traps, [{ r: 4, c: 0, owner: 'black' }]);

    const king = game({ '7,4': 'K', '0,4': 'k' });
    king.traps.push({ r: 6, c: 4, owner: 'black' });
    G.move(king, 7, 4, 6, 4);
    assert.equal(king.board[6][4], 'K');
    assert.deepEqual(king.traps, []); // the trap is spent anyway
    assert.equal(king.winner, null);

    const own = game({ '6,4': 'P', '7,4': 'K', '0,4': 'k' });
    own.traps.push({ r: 4, c: 4, owner: 'white' });
    G.move(own, 6, 4, 4, 4);
    assert.equal(own.board[4][4], 'P');
    assert.equal(own.traps.length, 1);
});

test('move: a frozen piece that moves is no longer frozen; others stay frozen', () => {
    const s = game({ '6,4': 'P', '7,4': 'K', '0,4': 'k' });
    s.frozenPieces.push({ r: 6, c: 4 }, { r: 6, c: 0 }, { r: 0, c: 4 });
    G.move(s, 6, 4, 5, 4);
    assert.deepEqual(s.frozenPieces, [{ r: 6, c: 0 }, { r: 0, c: 4 }]);
});

test('move: Assassin only offers adjacent enemies, never kings, walls, own pieces or diagonals', () => {
    // Around 3,4: a knight (victim), the enemy king, a wall, and a bishop on the diagonal.
    const t = game({ '4,4': 'P', '3,3': 'n', '2,4': 'k', '3,5': 'W', '4,5': 'R', '7,4': 'K', '2,5': 'b' });
    t.assassinActive = true;
    assert.equal(G.move(t, 4, 4, 3, 4), 'assassin_kill');
    assert.deepEqual(t.assassinTargets, [{ r: 3, c: 3 }]);
    assert.equal(t.targetingState, 'select_assassin_kill');

    const none = game({ '6,4': 'P', '6,3': 'N', '4,0': 'b', '7,4': 'K', '0,4': 'k' });
    none.assassinActive = true;
    assert.equal(G.move(none, 6, 4, 5, 4), 'endTurn');
    assert.equal(none.assassinActive, false);
    assert.deepEqual(none.assassinTargets ?? [], []);

    const edge = game({ '1,0': 'P', '0,1': 'n', '7,4': 'K', '0,4': 'k' });
    edge.assassinActive = true;
    assert.equal(G.move(edge, 1, 0, 0, 0), 'assassin_kill'); // corner: off-board neighbours skipped
    assert.deepEqual(edge.assassinTargets, [{ r: 0, c: 1 }]);
});

test('move: Assassin looks in all four directions, and a wall is never a victim', () => {
    // A black rook lands on 4,4 (move() trusts the caller on legality).
    const s = game({ '4,0': 'r', '3,4': 'N', '5,4': 'P', '4,3': 'B', '4,5': 'W', '0,0': 'k', '7,7': 'K' }, 'black');
    s.assassinActive = true;
    assert.equal(G.move(s, 4, 0, 4, 4), 'assassin_kill');
    assert.deepEqual(s.assassinTargets, [{ r: 3, c: 4 }, { r: 5, c: 4 }, { r: 4, c: 3 }]);
});

test('move: a trap elsewhere on the same row or column is not set off', () => {
    const s = game({ '6,4': 'P', '7,4': 'K', '0,4': 'k' });
    s.traps.push({ r: 2, c: 4, owner: 'black' }, { r: 4, c: 1, owner: 'black' });
    G.move(s, 6, 4, 4, 4);
    assert.equal(s.board[4][4], 'P');
    assert.equal(s.traps.length, 2);
});

test('move: another piece on the row or column of the Domi Reversi piece leaves the record alone', () => {
    const s = game({ '3,3': 'N', '3,0': 'R', '6,3': 'P', '7,4': 'K', '0,4': 'k' });
    s.domiReversiPiece = { r: 3, c: 3, originalColor: 'black' };
    G.move(s, 3, 0, 4, 0);
    G.move(s, 6, 3, 5, 3);
    assert.deepEqual(s.domiReversiPiece, { r: 3, c: 3, originalColor: 'black' });
});

test('move: a Domi Reversi piece destroyed by a spell is forgotten (no crash on its square)', () => {
    const s = game({ '3,3': null, '5,3': 'Q', '7,4': 'K', '0,4': 'k' });
    s.domiReversiPiece = { r: 3, c: 3, originalColor: 'black', caster: 'white', activeTurn: false };
    assert.equal(G.move(s, 5, 3, 3, 3), 'endTurn');
    assert.equal(s.board[3][3], 'Q');
    assert.equal(s.domiReversiPiece, null);
});

test('a draw agreed by both players ends the game without a winner, once', () => {
    const state = G.newGame();
    G.activateSpell(state, 8); // Wall: waiting for a target
    G.agreeDraw(state);
    assert.equal(state.winner, 'Draw');
    assert.equal(state.targetingState, null);
    assert.equal(G.isLegalMove(state, 6, 4, 4, 4), false, 'no more moves');
    const won = G.newGame();
    won.winner = 'White';
    G.agreeDraw(won);
    assert.equal(won.winner, 'White', 'a finished game stays finished');
});
