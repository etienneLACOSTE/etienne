// @ts-check
const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../games/chessdown/engine.js');

/** Build a state from a list of `[r, c, type, player, hasMoved?]`. */
function stateWith(pieces, lastMove = null) {
  const board = engine.createBoard();
  for (const [r, c, type, player, hasMoved = false] of pieces) {
    board[r][c] = { type, player, hasMoved };
  }
  return { board, lastMove };
}

/** Destinations as sorted "r,c" strings, for order-independent comparison. */
function targets(state, r, c) {
  return engine.getValidMoves(state, r, c).map((m) => `${m.r},${m.c}`).sort();
}

test('board is 12 rows by 8 columns', () => {
  const board = engine.createBoard();
  assert.equal(board.length, 12);
  assert.ok(board.every((row) => row.length === 8 && row.every((sq) => sq === null)));
});

test('draft values and budget', () => {
  assert.equal(engine.MAX_POINTS, 39);
  assert.deepEqual(engine.PIECE_VALUES, { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 });
});

test('empty square has no moves', () => {
  assert.deepEqual(engine.getValidMoves(stateWith([]), 5, 5), []);
});

test('pawn: one or two steps forward before moving, one after', () => {
  assert.deepEqual(targets(stateWith([[9, 3, 'p', 1]]), 9, 3), ['7,3', '8,3']);
  assert.deepEqual(targets(stateWith([[9, 3, 'p', 1, true]]), 9, 3), ['8,3']);
  // Player 2 moves down the board.
  assert.deepEqual(targets(stateWith([[2, 3, 'p', 2]]), 2, 3), ['3,3', '4,3']);
});

test('pawn: blocked forward, captures only enemies diagonally', () => {
  const s = stateWith([[9, 3, 'p', 1], [8, 3, 'n', 2], [8, 2, 'r', 2], [8, 4, 'b', 1]]);
  assert.deepEqual(targets(s, 9, 3), ['8,2']);
});

test('pawn: a blocked first step also prevents the double step', () => {
  assert.deepEqual(targets(stateWith([[9, 3, 'p', 1], [8, 3, 'p', 1]]), 9, 3), []);
});

test('knight jumps over pieces and stays on the board', () => {
  const s = stateWith([[11, 0, 'n', 1], [10, 0, 'p', 1], [10, 1, 'p', 1]]);
  assert.deepEqual(targets(s, 11, 0), ['10,2', '9,1']);
});

test('rook slides until blocked, capturing the first enemy', () => {
  const s = stateWith([[5, 0, 'r', 1], [2, 0, 'p', 2], [7, 0, 'p', 1], [5, 3, 'k', 2]]);
  assert.deepEqual(targets(s, 5, 0), ['2,0', '3,0', '4,0', '5,1', '5,2', '5,3', '6,0']);
});

test('bishop and queen slide diagonally', () => {
  const bishop = targets(stateWith([[0, 0, 'b', 2]]), 0, 0);
  assert.equal(bishop.length, 7);
  assert.ok(bishop.includes('7,7'));
  const queen = targets(stateWith([[5, 3, 'q', 1]]), 5, 3);
  assert.equal(queen.length, 7 + 11 + 14); // row + column + four diagonal rays (4+3+4+3)
});

test('king may step into danger: there is no check', () => {
  const s = stateWith([[11, 4, 'k', 1], [0, 3, 'r', 2]]);
  assert.ok(targets(s, 11, 4).includes('10,3')); // attacked by the rook on column 3
});

test('en passant after an adjacent double step, and only then', () => {
  const pawn2 = { type: 'p', player: 2, hasMoved: true };
  const withDouble = stateWith([[6, 3, 'p', 1, true]], { piece: pawn2, toR: 6, toC: 4, isDoubleStep: true });
  withDouble.board[6][4] = pawn2;
  assert.deepEqual(engine.getValidMoves(withDouble, 6, 3).find((m) => m.isEnPassant), { r: 5, c: 4, isEnPassant: true });

  const withSingle = stateWith([[6, 3, 'p', 1, true]], { piece: pawn2, toR: 6, toC: 4, isDoubleStep: false });
  withSingle.board[6][4] = pawn2;
  assert.equal(engine.getValidMoves(withSingle, 6, 3).some((m) => m.isEnPassant), false);
});

test('applyMove captures en passant and undoMove restores everything', () => {
  const pawn2 = { type: 'p', player: 2, hasMoved: true };
  const lastMove = { piece: pawn2, fromR: 4, fromC: 4, toR: 6, toC: 4, isDoubleStep: true };
  const s = stateWith([[6, 3, 'p', 1, true]], lastMove);
  s.board[6][4] = pawn2;
  const before = JSON.stringify(s.board);

  const move = { fromR: 6, fromC: 3, toR: 5, toC: 4 };
  const undo = engine.applyMove(s, move);
  assert.equal(s.board[6][4], null, 'captured pawn removed');
  assert.equal(s.board[5][4].player, 1);
  assert.equal(undo.isEnPassant, true);
  assert.deepEqual(s.lastMove, { piece: s.board[5][4], fromR: 6, fromC: 3, toR: 5, toC: 4, isDoubleStep: false });

  engine.undoMove(s, move, undo);
  assert.equal(JSON.stringify(s.board), before);
  assert.equal(s.lastMove, lastMove);
});

test('applyMove marks the piece as moved, records double steps and captures', () => {
  const s = stateWith([[9, 3, 'p', 1], [3, 3, 'q', 2]]);
  const undo = engine.applyMove(s, { fromR: 9, fromC: 3, toR: 7, toC: 3 });
  assert.equal(s.board[7][3].hasMoved, true);
  assert.equal(s.lastMove.isDoubleStep, true);
  assert.equal(undo.targetPiece, null);

  const capture = engine.applyMove(s, { fromR: 3, fromC: 3, toR: 7, toC: 3 });
  assert.equal(capture.targetPiece.type, 'p');
  assert.equal(s.board[7][3].type, 'q');
});

test('generateAllMoves lists every move of one player only', () => {
  const s = stateWith([[11, 4, 'k', 1], [9, 0, 'r', 1], [0, 3, 'k', 2]]);
  const moves = engine.generateAllMoves(s, 1);
  assert.equal(moves.length, 5 + 11 + 7); // king, rook along the file (9 up, 2 down), rook along the row
  assert.ok(moves.every((m) => s.board[m.fromR][m.fromC].player === 1));
});

test('touchdown: a piece in the opponent endzone row', () => {
  assert.equal(engine.endzoneRow(1), 0);
  assert.equal(engine.endzoneRow(2), 11);
  const s = stateWith([[0, 5, 'n', 1], [5, 5, 'p', 2]]);
  assert.equal(engine.hasPieceInEndzone(s.board, 1), true);
  assert.equal(engine.hasPieceInEndzone(s.board, 2), false);
  // A player's own back rank is not their endzone.
  assert.equal(engine.hasPieceInEndzone(stateWith([[11, 0, 'k', 1]]).board, 1), false);
});

test('serializeBoard encodes pieces and the side to move', () => {
  const s = stateWith([[0, 0, 'k', 2], [11, 7, 'q', 1]]);
  const key = engine.serializeBoard(s.board, 1);
  assert.equal(key.length, 12 * 8 + 2 + 1); // one char per empty square, two per piece, then the side to move
  assert.ok(key.startsWith('2k.'));
  assert.ok(key.endsWith('1q1'));
  assert.notEqual(key, engine.serializeBoard(s.board, 2));
});
