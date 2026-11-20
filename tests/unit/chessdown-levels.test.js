// Piece levels in the Chessdown engine (docs/games/chessdown-levels.md).
// 1. Classic mode unchanged: on boards without levels (level 3), the engine gives exactly
//    what the engine before levels gave (tests/unit/fixtures/chessdown-engine-classic.js).
// 2. Each piece at each level, and the edge cases of the doc.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../games/chessdown/engine.js');
const classic = require('./fixtures/chessdown-engine-classic.js');

const { ROWS, COLS } = engine;

/** A small seeded random generator, so that a failure can be replayed. */
function random(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A random army for each side in its 4 home rows, one king each. */
function randomBoard(rand) {
    const board = engine.createBoard();
    const types = ['p', 'p', 'p', 'n', 'b', 'r', 'q'];
    for (const player of [1, 2]) {
        const rows = player === 1 ? [8, 9, 10, 11] : [0, 1, 2, 3];
        const squares = [];
        for (const r of rows) for (let c = 0; c < COLS; c++) squares.push([r, c]);
        squares.sort(() => rand() - 0.5);
        const [kr, kc] = squares.pop();
        board[kr][kc] = { type: 'k', player, hasMoved: false };
        const count = 6 + Math.floor(rand() * 10);
        for (let i = 0; i < count; i++) {
            const [r, c] = squares.pop();
            board[r][c] = { type: types[Math.floor(rand() * types.length)], player, hasMoved: false };
        }
    }
    return board;
}

const moveKey = (m) => `${m.r},${m.c},${Boolean(m.isEnPassant)}`;

test('classic mode unchanged: level-3 boards give the moves, results and keys of the engine before levels', () => {
    let positions = 0;
    for (let game = 0; game < 1000; game++) {
        const rand = random(1000 + game);
        const board = randomBoard(rand);
        const a = { board: JSON.parse(JSON.stringify(board)), lastMove: null };
        const b = { board: JSON.parse(JSON.stringify(board)), lastMove: null };
        let player = 1;
        for (let ply = 0; ply < 60; ply++) {
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const now = engine.getValidMoves(a, r, c).map(moveKey);
                    const before = classic.getValidMoves(b, r, c).map(moveKey);
                    assert.deepEqual(now, before, `game ${game}, ply ${ply}, square ${r},${c}`);
                }
            }
            assert.equal(engine.serializeBoard(a.board, player), classic.serializeBoard(b.board, player));
            positions++;
            const moves = engine.generateAllMoves(a, player);
            assert.deepEqual(moves, classic.generateAllMoves(b, player));
            if (!moves.length) break;
            const move = moves[Math.floor(rand() * moves.length)];
            const undoA = engine.applyMove(a, move);
            const undoB = classic.applyMove(b, move);
            assert.equal(JSON.stringify(a.board), JSON.stringify(b.board));
            assert.equal(JSON.stringify(a.lastMove), JSON.stringify(b.lastMove));
            assert.equal(JSON.stringify(undoA.targetPiece), JSON.stringify(undoB.targetPiece));
            // Undo then redo on the new engine leaves the same board.
            const snapshot = JSON.stringify(a.board);
            engine.undoMove(a, move, undoA);
            engine.applyMove(a, move);
            assert.equal(JSON.stringify(a.board), snapshot);
            if (move.toR === 0 || move.toR === ROWS - 1 || undoA.targetPiece?.type === 'k') break;
            player = player === 1 ? 2 : 1;
        }
    }
    assert.ok(positions > 5000, `${positions} positions compared`);
});

/** A state with pieces [r, c, type, player, level?, hasMoved?] and an optional last move. */
function stateWith(pieces, lastMove = null) {
    const board = engine.createBoard();
    for (const [r, c, type, player, level, hasMoved = false] of pieces) {
        board[r][c] = { type, player, hasMoved, ...(level ? { level } : {}) };
    }
    return { board, lastMove };
}
const targets = (state, r, c) => engine.getValidMoves(state, r, c).map((m) => `${m.r},${m.c}`).sort();
const sorted = (list) => [...list].sort();

test('levels: missing or invalid means 3, the king is always 5; costs by level', () => {
    assert.equal(engine.levelOf({ type: 'r' }), 3);
    assert.equal(engine.levelOf({ type: 'r', level: 7 }), 3);
    assert.equal(engine.levelOf({ type: 'r', level: 1 }), 1);
    assert.equal(engine.levelOf({ type: 'k', level: 1 }), 5);
    assert.deepEqual(engine.LEVELS.map((l) => engine.pieceCost('p', l)), [1, 1, 1, 2, 2]);
    assert.deepEqual(engine.LEVELS.map((l) => engine.pieceCost('n', l)), [2, 2, 3, 4, 4]);
    assert.deepEqual(engine.LEVELS.map((l) => engine.pieceCost('b', l)), [2, 2, 3, 4, 4]);
    assert.deepEqual(engine.LEVELS.map((l) => engine.pieceCost('r', l)), [3, 4, 5, 6, 6]);
    assert.deepEqual(engine.LEVELS.map((l) => engine.pieceCost('q', l)), [7, 8, 9, 10, 11]);
    assert.equal(engine.pieceCost('k', 1), 0);
    assert.equal(engine.pieceCost('r'), 5);
    for (const type of ['p', 'n', 'b', 'r', 'q', 'k']) assert.equal(engine.pieceCost(type), engine.PIECE_VALUES[type]);
});

// --- Pawn (player 1 moves up: row - 1) ---

test('pawn level 1: one square forward, never a capture, never two', () => {
    const s = stateWith([[8, 3, 'p', 1, 1], [7, 2, 'n', 2], [7, 4, 'n', 2]]);
    assert.deepEqual(targets(s, 8, 3), ['7,3']);
});

test('pawn level 2: captures diagonally, but no double step and no en passant', () => {
    const s = stateWith([[8, 3, 'p', 1, 2], [7, 4, 'n', 2]]);
    assert.deepEqual(targets(s, 8, 3), sorted(['7,3', '7,4']));
    const enemy = { type: 'p', player: 2, hasMoved: true };
    const ep = stateWith([[6, 3, 'p', 1, 2, true]], { piece: enemy, fromR: 4, fromC: 4, toR: 6, toC: 4, isDoubleStep: true });
    ep.board[6][4] = enemy;
    assert.equal(engine.getValidMoves(ep, 6, 3).some((m) => m.isEnPassant), false);
});

test('pawn level 4: 1, 2 or 3 squares on its first move, path clear; then one', () => {
    assert.deepEqual(targets(stateWith([[10, 3, 'p', 1, 4]]), 10, 3), sorted(['9,3', '8,3', '7,3']));
    assert.deepEqual(targets(stateWith([[10, 3, 'p', 1, 4], [8, 3, 'n', 2]]), 10, 3), ['9,3']);
    assert.deepEqual(targets(stateWith([[10, 3, 'p', 1, 4, true]]), 10, 3), ['9,3']);
});

test('pawn level 4: after a 3-square move it can be taken en passant on either square it went over', () => {
    // Player 2's level-4 pawn goes 1,4 -> 4,4 (over 2,4 and 3,4).
    const runner = { type: 'p', player: 2, hasMoved: false, level: 4 };
    const s = stateWith([[4, 3, 'p', 1, 3, true], [3, 5, 'p', 1, 3, true], [4, 6, 'p', 1, 1, true]]);
    s.board[1][4] = runner;
    engine.applyMove(s, { fromR: 1, fromC: 4, toR: 4, toC: 4 });
    assert.deepEqual(s.lastMove.passedRows, [2, 3]);
    // Beside where it stopped: takes on the square just behind it (3,4).
    assert.deepEqual(engine.getValidMoves(s, 4, 3).filter((m) => m.isEnPassant), [{ r: 3, c: 4, isEnPassant: true }]);
    // Beside the square it went over first: takes on 2,4, as if it had stopped on 3,4.
    assert.deepEqual(engine.getValidMoves(s, 3, 5).filter((m) => m.isEnPassant), [{ r: 2, c: 4, isEnPassant: true }]);
    const move = { fromR: 3, fromC: 5, toR: 2, toC: 4 };
    const before = JSON.stringify(s.board);
    const undo = engine.applyMove(s, move);
    assert.equal(s.board[4][4], null, 'the runner is taken where it stopped');
    assert.equal(s.board[2][4].player, 1);
    engine.undoMove(s, move, undo);
    assert.equal(JSON.stringify(s.board), before);
});

test('pawn level 5: becomes the piece it takes, at level 3; not after taking a pawn; undo restores it', () => {
    const s = stateWith([[8, 3, 'p', 1, 5, true], [7, 4, 'r', 2, 1]]);
    const move = { fromR: 8, fromC: 3, toR: 7, toC: 4 };
    const undo = engine.applyMove(s, move);
    assert.deepEqual(s.board[7][4], { type: 'r', player: 1, hasMoved: true, level: 3, transformed: true });
    assert.equal(s.lastMove.piece.type, 'r');
    engine.undoMove(s, move, undo);
    assert.deepEqual(s.board[8][3], { type: 'p', player: 1, hasMoved: true, level: 5 });
    assert.equal(s.board[7][4].type, 'r');

    const pawnTaken = stateWith([[8, 3, 'p', 1, 5, true], [7, 4, 'p', 2]]);
    engine.applyMove(pawnTaken, move);
    assert.deepEqual(pawnTaken.board[7][4], { type: 'p', player: 1, hasMoved: true, level: 5 });

    const kingTaken = stateWith([[8, 3, 'p', 1, 5, true], [7, 4, 'k', 2]]);
    engine.applyMove(kingTaken, move);
    assert.equal(kingTaken.board[7][4].type, 'p');
});

// --- Knight: 2 squares one way, then 1 to the side ---

test('knight level 1: the whole L must be clear (the 2 straight squares), the landing may be a capture', () => {
    const open = stateWith([[8, 3, 'n', 1, 1]]);
    assert.equal(targets(open, 8, 3).length, 8);
    // A piece on 7,3 blocks both jumps that go 2 up first (6,2 and 6,4).
    const blocked = stateWith([[8, 3, 'n', 1, 1], [7, 3, 'p', 1], [6, 4, 'r', 2]]);
    const t = targets(blocked, 8, 3);
    assert.ok(!t.includes('6,2') && !t.includes('6,4'));
    assert.ok(t.includes('7,1') && t.includes('9,5'));
    // Clear path: the enemy rook on the landing square can be taken.
    assert.ok(targets(stateWith([[8, 3, 'n', 1, 1], [6, 4, 'r', 2]]), 8, 3).includes('6,4'));
    // A piece on the second straight square blocks too (6,3 for the 2-up jumps).
    assert.ok(!targets(stateWith([[8, 3, 'n', 1, 1], [6, 3, 'p', 1]]), 8, 3).includes('6,4'));
});

test('knight level 2: one straight square must be clear, then a diagonal', () => {
    assert.ok(targets(stateWith([[8, 3, 'n', 1, 2], [6, 3, 'p', 1]]), 8, 3).includes('6,4'), 'the second square may be taken');
    assert.ok(!targets(stateWith([[8, 3, 'n', 1, 2], [7, 3, 'p', 1]]), 8, 3).includes('6,4'), 'the first one may not');
    // Sideways L (1 up, 2 right): the first square to the right must be clear.
    assert.ok(!targets(stateWith([[8, 3, 'n', 1, 2], [8, 4, 'p', 1]]), 8, 3).includes('7,5'));
});

test('knight level 3 jumps over everything; level 4 adds a straight 3-square jump, level 5 a diagonal 2-square one, never capturing', () => {
    const crowd = [[7, 3, 'p', 1], [6, 3, 'p', 1], [8, 4, 'p', 1], [8, 2, 'p', 1], [9, 3, 'p', 1]];
    assert.equal(targets(stateWith([[8, 3, 'n', 1, 3], ...crowd]), 8, 3).length, 8);
    const four = targets(stateWith([[8, 3, 'n', 1, 4], ...crowd, [5, 3, 'r', 2]]), 8, 3);
    assert.ok(four.includes('8,6') && four.includes('8,0') && four.includes('11,3'));
    assert.ok(!four.includes('5,3'), 'no capture with the straight jump');
    const five = targets(stateWith([[8, 3, 'n', 1, 5], [7, 4, 'p', 1], [6, 1, 'r', 2]]), 8, 3);
    assert.ok(five.includes('6,5') && five.includes('10,1') && five.includes('10,5') && five.includes('8,6'));
    assert.ok(!five.includes('6,1'), 'no capture with the diagonal jump');
});

// --- Rook ---

test('rook: 3 squares at level 1, 6 at level 2, no limit at level 3', () => {
    const reach = (level) => targets(stateWith([[11, 0, 'r', 1, level]]), 11, 0).filter((t) => t.endsWith(',0')).length;
    assert.equal(reach(1), 3);
    assert.equal(reach(2), 6);
    assert.equal(reach(3), 11);
});

test('rook level 4 hops over one of its own pieces onto an empty square; level 5 may capture there', () => {
    const own = [[11, 0, 'r', 1, 4], [8, 0, 'p', 1], [7, 0, 'n', 2]];
    assert.ok(!targets(stateWith(own), 11, 0).includes('7,0'), 'level 4 does not capture behind it');
    assert.ok(targets(stateWith([[11, 0, 'r', 1, 4], [8, 0, 'p', 1]]), 11, 0).includes('7,0'));
    assert.ok(targets(stateWith([[11, 0, 'r', 1, 5], [8, 0, 'p', 1], [7, 0, 'n', 2]]), 11, 0).includes('7,0'));
    assert.ok(!targets(stateWith([[11, 0, 'r', 1, 5], [8, 0, 'p', 1], [7, 0, 'n', 1]]), 11, 0).includes('7,0'), 'never onto its own piece');
    // Never over an opponent's piece.
    assert.ok(!targets(stateWith([[11, 0, 'r', 1, 5], [8, 0, 'p', 2]]), 11, 0).includes('7,0'));
    // Only just behind it.
    assert.ok(!targets(stateWith([[11, 0, 'r', 1, 4], [8, 0, 'p', 1]]), 11, 0).includes('6,0'));
});

// --- Bishop ---

test('bishop: 2 squares at level 1, 4 at level 2; level 4 hops over its own piece, level 5 adds one straight step, never capturing', () => {
    const diag = (level) => targets(stateWith([[11, 0, 'b', 1, level]]), 11, 0).length;
    assert.equal(diag(1), 2);
    assert.equal(diag(2), 4);
    assert.equal(diag(3), 7);
    assert.ok(targets(stateWith([[11, 0, 'b', 1, 4], [10, 1, 'p', 1]]), 11, 0).includes('9,2'));
    assert.ok(!targets(stateWith([[11, 0, 'b', 1, 4], [10, 1, 'p', 1], [9, 2, 'n', 2]]), 11, 0).includes('9,2'));
    const five = targets(stateWith([[8, 3, 'b', 1, 5], [7, 3, 'n', 2], [9, 3, 'p', 1]]), 8, 3);
    assert.ok(five.includes('8,2') && five.includes('8,4'));
    assert.ok(!five.includes('7,3') && !five.includes('9,3'), 'the straight step never captures');
    assert.ok(!targets(stateWith([[8, 3, 'b', 1, 4]]), 8, 3).includes('8,4'), 'no straight step at level 4');
});

// --- Queen ---

test('queen: 4 squares at level 1, 6 at level 2; level 4 adds the knight jump without capture', () => {
    const column = (level) => targets(stateWith([[11, 3, 'q', 1, level]]), 11, 3).filter((t) => t.endsWith(',3')).length;
    assert.equal(column(1), 4);
    assert.equal(column(2), 6);
    assert.equal(column(3), 11);
    const four = targets(stateWith([[8, 3, 'q', 1, 4], [7, 3, 'p', 1], [6, 4, 'n', 2], [6, 2, 'p', 1]]), 8, 3);
    assert.ok(four.includes('7,1') && four.includes('10,4'));
    assert.ok(!four.includes('6,4'), 'the knight jump does not capture');
});

test('queen level 5: next to her king (4 squares) when she sees him, like a ray of light', () => {
    // King on 10,1; queen on 4,6: far, at an odd angle.
    const sees = stateWith([[4, 6, 'q', 1, 5], [10, 1, 'k', 1]]);
    const t = targets(sees, 4, 6);
    for (const sq of ['9,1', '11,1', '10,0', '10,2']) assert.ok(t.includes(sq), sq);
    const level4 = targets(stateWith([[4, 6, 'q', 1, 4], [10, 1, 'k', 1]]), 4, 6);
    assert.ok(!level4.includes('11,1'), 'not at level 4');
    // A piece on the ray hides the king: the teleport is gone.
    const hidden = stateWith([[4, 6, 'q', 1, 5], [10, 1, 'k', 1], [7, 3, 'p', 2]]);
    assert.equal(engine.lineOfSight(hidden.board, 4, 6, 10, 1), false);
    assert.ok(!targets(hidden, 4, 6).includes('11,1'));
    // Never onto an occupied square, even an opponent's.
    const busy = stateWith([[4, 6, 'q', 1, 5], [10, 1, 'k', 1], [11, 1, 'n', 2]]);
    assert.ok(!targets(busy, 4, 6).includes('11,1'));
});

test('line of sight: exact, a corner touched blocks nothing, pieces off the ray do not count', () => {
    const board = engine.createBoard();
    // The doc's example, 3 right and 2 up: from (r 4, c 0) to (r 2, c 3), the ray
    // crosses (4,1) (3,1) (3,2) (2,2) and no other square.
    for (const [r, c] of [[4, 1], [3, 1], [3, 2], [2, 2]]) {
        board[r][c] = { type: 'p', player: 2 };
        assert.equal(engine.lineOfSight(board, 4, 0, 2, 3), false, `${r},${c} hides`);
        board[r][c] = null;
    }
    for (const [r, c] of [[4, 2], [4, 3], [3, 0], [3, 3], [2, 0], [2, 1]]) {
        board[r][c] = { type: 'p', player: 2 };
        assert.equal(engine.lineOfSight(board, 4, 0, 2, 3), true, `${r},${c} does not hide`);
        board[r][c] = null;
    }
    // An exact diagonal only passes through corners: the squares beside it do not hide.
    board[4][1] = { type: 'p', player: 2 };
    board[3][0] = { type: 'p', player: 2 };
    assert.equal(engine.lineOfSight(board, 4, 0, 2, 2), true);
    board[3][1] = { type: 'p', player: 2 };
    assert.equal(engine.lineOfSight(board, 4, 0, 2, 2), false, 'the diagonal square itself does');
    // Symmetric.
    assert.equal(engine.lineOfSight(board, 2, 2, 4, 0), false);
});

test('king: level 5 whatever it says, normal moves', () => {
    assert.equal(targets(stateWith([[8, 3, 'k', 1, 1]]), 8, 3).length, 8);
});

test('repetition keys: the level counts, classic keys stay the same', () => {
    const plain = stateWith([[8, 3, 'r', 1]]);
    const three = stateWith([[8, 3, 'r', 1, 3]]);
    const one = stateWith([[8, 3, 'r', 1, 1]]);
    assert.equal(engine.serializeBoard(plain.board, 1), engine.serializeBoard(three.board, 1));
    assert.notEqual(engine.serializeBoard(plain.board, 1), engine.serializeBoard(one.board, 1));
    assert.equal(engine.serializeBoard(plain.board, 1), classic.serializeBoard(plain.board, 1));
});

test('bot: searches legal moves with levels, and weighs a piece by its level', () => {
    const Bot = require('../../games/chessdown/bot-search.js');
    const s = stateWith([[11, 3, 'k', 1], [0, 3, 'k', 2], [9, 0, 'r', 1, 1], [2, 7, 'r', 2, 5], [3, 2, 'n', 2, 1], [1, 5, 'q', 2, 5]]);
    const move = Bot.bestMove(s, 2, 2, Bot.DEFAULT_PROFILE, random(7));
    assert.ok(move, 'a move is found');
    assert.ok(engine.getValidMoves(s, move.fromR, move.fromC).some((m) => m.r === move.toR && m.c === move.toC), 'and it is legal');
    const weak = stateWith([[11, 3, 'k', 1], [0, 3, 'k', 2], [5, 0, 'r', 1, 1]]);
    const strong = stateWith([[11, 3, 'k', 1], [0, 3, 'k', 2], [5, 0, 'r', 1, 5]]);
    assert.ok(Bot.evaluate(strong.board, Bot.DEFAULT_PROFILE, 1) > Bot.evaluate(weak.board, Bot.DEFAULT_PROFILE, 1));
});
