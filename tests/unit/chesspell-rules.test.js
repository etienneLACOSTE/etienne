// @ts-check
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../../games/chesspell/rules.js');

/** A rules state with no spell active; `board` is built from `{ 'r,c': piece }`. */
function stateWith(pieces, overrides = {}) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (const [key, piece] of Object.entries(pieces)) {
    const [r, c] = key.split(',').map(Number);
    board[r][c] = piece;
  }
  return {
    board, turn: 'white', frozenPieces: [], shieldedPieces: [], hasMoved: undefined,
    ghostActive: false, leapFrogActive: false, assassinActive: false, cannibalismActive: false,
    doubleTroubleState: { active: false }, domiReversiPiece: null,
    ...overrides,
  };
}

const targets = (state, r, c) => rules.getValidMoves(state, r, c).map((m) => `${m.r},${m.c}`).sort();

test('colours: uppercase is white, walls and empty squares have none', () => {
  assert.equal(rules.getColor('Q'), 'white');
  assert.equal(rules.getColor('q'), 'black');
  assert.equal(rules.getColor('W'), null);
  assert.equal(rules.getColor(null), null);
});

test('initial position: 20 opening moves for white', () => {
  const s = stateWith({}, { board: rules.initialBoard(), hasMoved: {} });
  let count = 0;
  for (let c = 0; c < 8; c++) count += rules.getValidMoves(s, 6, c).length + rules.getValidMoves(s, 7, c).length;
  assert.equal(count, 20);
});

test('pawn: double step only from the start row, never captures forward', () => {
  assert.deepEqual(targets(stateWith({ '6,4': 'P' }), 6, 4), ['4,4', '5,4']);
  assert.deepEqual(targets(stateWith({ '5,4': 'P' }), 5, 4), ['4,4']);
  assert.deepEqual(targets(stateWith({ '6,4': 'P', '5,4': 'p', '5,3': 'n' }), 6, 4), ['5,3']);
  assert.deepEqual(targets(stateWith({ '1,0': 'p' }), 1, 0), ['2,0', '3,0']);
});

test('walls block sliding pieces and cannot be captured', () => {
  assert.deepEqual(targets(stateWith({ '7,0': 'R', '5,0': 'W' }), 7, 0), ['6,0', '7,1', '7,2', '7,3', '7,4', '7,5', '7,6', '7,7']);
});

test('no check: a king may move next to an attacker', () => {
  assert.ok(targets(stateWith({ '7,4': 'K', '0,3': 'r' }), 7, 4).includes('6,3'));
});

test('castling both sides while king and rooks have not moved', () => {
  const s = stateWith({ '7,4': 'K', '7,0': 'R', '7,7': 'R' }, { hasMoved: {} });
  const castles = rules.getValidMoves(s, 7, 4).filter((m) => m.castle).map((m) => m.castle);
  assert.deepEqual(castles.sort(), ['kingside', 'queenside']);
  s.hasMoved = { whiteRookH: true };
  assert.deepEqual(rules.getValidMoves(s, 7, 4).filter((m) => m.castle).map((m) => m.castle), ['queenside']);
});

test('Freeze: a frozen piece cannot move', () => {
  assert.deepEqual(rules.getValidMoves(stateWith({ '7,1': 'N' }, { frozenPieces: [{ r: 7, c: 1 }] }), 7, 1), []);
});

test('Shield: a shielded piece cannot be captured, except by a king', () => {
  const shield = { shieldedPieces: [{ r: 4, c: 0 }] };
  assert.ok(!targets(stateWith({ '7,0': 'R', '4,0': 'p' }, shield), 7, 0).includes('4,0'));
  assert.ok(targets(stateWith({ '5,0': 'K', '4,0': 'p' }, shield), 5, 0).includes('4,0'));
});

test('Ghost: slides through the first piece and stops at the second (capturing it if enemy)', () => {
  const s = stateWith({ '7,0': 'R', '5,0': 'P', '3,0': 'p', '1,0': 'p' }, { ghostActive: true });
  assert.deepEqual(targets(s, 7, 0).filter((t) => t.endsWith(',0')), ['3,0', '4,0', '6,0']);
});

test('Ghost, Leap Frog, Assassin and Double Trouble forbid capturing the king', () => {
  for (const flag of ['ghostActive', 'leapFrogActive', 'assassinActive']) {
    const s = stateWith({ '7,0': 'R', '0,0': 'k' }, { [flag]: true });
    assert.ok(!targets(s, 7, 0).includes('0,0'), flag);
  }
  const dt = stateWith({ '7,0': 'R', '0,0': 'k' }, { doubleTroubleState: { active: true } });
  assert.ok(!targets(dt, 7, 0).includes('0,0'));
  assert.ok(targets(stateWith({ '7,0': 'R', '0,0': 'k' }), 7, 0).includes('0,0'));
});

test('Leap Frog: pieces of the side to move also jump like knights', () => {
  const s = stateWith({ '4,4': 'P' }, { leapFrogActive: true });
  assert.equal(targets(s, 4, 4).length, 8 + 1);
  s.turn = 'black';
  assert.deepEqual(targets(s, 4, 4), ['3,4']);
});

test('Cannibalism: may capture own pieces but never the own king', () => {
  const s = stateWith({ '7,0': 'R', '6,0': 'P', '7,1': 'K' }, { cannibalismActive: true });
  assert.deepEqual(targets(s, 7, 0), ['6,0']);
});

test('Domi Reversi: the converted piece cannot capture a king', () => {
  const s = stateWith({ '7,0': 'R', '0,0': 'k' }, { domiReversiPiece: { r: 7, c: 0 } });
  assert.ok(!targets(s, 7, 0).includes('0,0'));
});

test('promotePawns turns last-rank pawns into queens', () => {
  const board = stateWith({ '0,2': 'P', '7,5': 'p', '3,3': 'P' }).board;
  rules.promotePawns(board);
  assert.equal(board[0][2], 'Q');
  assert.equal(board[7][5], 'q');
  assert.equal(board[3][3], 'P');
});

test('toFEN encodes the position and side to move, walls as empty', () => {
  assert.equal(rules.toFEN(rules.initialBoard(), 'white'), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
  const board = stateWith({ '4,4': 'P', '3,3': 'W' }).board;
  assert.equal(rules.toFEN(board, 'black'), '8/8/8/8/4P3/8/8/8 b - - 0 1');
});
