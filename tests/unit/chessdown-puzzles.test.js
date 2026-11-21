// The career's puzzles (games/chessdown/career-quests.js PUZZLES): each one can be solved in
// its number of moves (its solution is played move by move on the engine) and not in fewer
// (a breadth-first search over player 1's moves; the other side never moves).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../games/chessdown/engine.js');
const Quests = require('../../games/chessdown/career-quests.js');

function boardOf(p) {
    const board = Engine.createBoard();
    for (const [r, c, type, level] of p.mine) board[r][c] = { type, player: 1, hasMoved: true, level };
    board[p.king[0]][p.king[1]] = { type: 'k', player: 2, hasMoved: true };
    for (const [r, c] of p.stones) board[r][c] = { type: 'p', player: 2, hasMoved: true, level: 3 };
    return board;
}
const copy = (board) => board.map((row) => row.map((x) => (x ? { ...x } : null)));
const key = (board) => board.map((row) => row.map((x) => (x ? x.player + x.type : '.')).join('')).join('/');
/** A move that solves: onto the end zone, or onto the king. */
const solves = (board, m) => m.toR === 0 || Boolean(board[m.toR][m.toC] && board[m.toR][m.toC].type === 'k');

/** The fewest moves that solve the puzzle (searching up to `limit`), or Infinity. */
function fewestMoves(p, limit) {
    let frontier = [boardOf(p)];
    const seen = new Set([key(frontier[0])]);
    for (let depth = 1; depth <= limit; depth++) {
        const next = [];
        for (const board of frontier) {
            for (const m of Engine.generateAllMoves({ board, lastMove: null }, 1)) {
                if (solves(board, m)) return depth;
                const b = copy(board);
                Engine.applyMove({ board: b, lastMove: null }, m);
                const k = key(b);
                if (!seen.has(k)) { seen.add(k); next.push(b); }
            }
        }
        frontier = next;
    }
    return Infinity;
}

for (const [id, p] of Object.entries(Quests.PUZZLES)) {
    test(`puzzle ${id}: solved in ${p.moves} moves, not fewer`, () => {
        // Its solution, move by move, on the engine
        const board = boardOf(p);
        const moves = p.solution.split(' ').map((m) => m.slice(1).split('>').map((sq) => sq.split(',').map(Number)));
        assert.equal(moves.length, p.moves);
        moves.forEach(([[fr, fc], [tr, tc]], i) => {
            const legal = Engine.getValidMoves({ board, lastMove: null }, fr, fc);
            assert.ok(legal.some((m) => m.r === tr && m.c === tc), `move ${i + 1} is legal`);
            const last = i === moves.length - 1;
            assert.equal(solves(board, { toR: tr, toC: tc }), last, last ? 'the last move solves it' : 'not solved before the end');
            Engine.applyMove({ board, lastMove: null }, { fromR: fr, fromC: fc, toR: tr, toC: tc });
        });
        assert.equal(fewestMoves(p, p.moves), p.moves, 'no shorter solution');
        // The straight road is blocked: a stone stands in the hero's column, ahead of it
        const [hr, hc] = p.mine[1];
        assert.ok(p.stones.some(([r, c]) => c === hc && r < hr), 'a stone on the straight road');
    });
}

test('every puzzle quest has its puzzle', () => {
    for (const q of Quests.QUESTS.filter((x) => x.goal.type === 'puzzle')) {
        assert.ok(Quests.PUZZLES[q.goal.id], q.id);
        assert.equal(Quests.PUZZLES[q.goal.id].mine[1][2], q.reward.xp.to, `${q.id}: the experience goes to the puzzle's piece`);
    }
});
