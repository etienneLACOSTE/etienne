// The career's puzzles (games/chessdown/career-quests.js PUZZLES): the other side plays
// between player 1's moves. Each puzzle is won by force (whatever the other side answers)
// in its number of moves, and not in fewer (games/chessdown/bot-search.js puzzleFewest).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../games/chessdown/engine.js');
const Bot = require('../../games/chessdown/bot-search.js');
const Quests = require('../../games/chessdown/career-quests.js');

function stateOf(p) {
    const board = Engine.createBoard();
    for (const [r, c, type, level] of p.mine) board[r][c] = { type, player: 1, hasMoved: true, level };
    board[p.king[0]][p.king[1]] = { type: 'k', player: 2, hasMoved: true };
    for (const [r, c] of p.stones) board[r][c] = { type: 'p', player: 2, hasMoved: true, level: 3 };
    return { board, lastMove: null };
}

for (const [id, p] of Object.entries(Quests.PUZZLES)) {
    test(`puzzle ${id}: won by force in ${p.moves} moves, not fewer`, () => {
        assert.equal(Bot.puzzleFewest(stateOf(p), p.moves), p.moves);
        // The straight road is blocked: a pawn stands in the hero's column, ahead of it
        const [hr, hc] = p.mine[1];
        assert.ok(p.stones.some(([r, c]) => c === hc && r < hr), 'a pawn on the straight road');
    });
}

test('a puzzle played out: the solution against the defence wins within its moves', () => {
    for (const [id, p] of Object.entries(Quests.PUZZLES)) {
        const state = stateOf(p);
        let won = false;
        for (let left = p.moves; left > 0 && !won; left--) {
            const m = Bot.puzzleSolution(state, left);
            assert.ok(m, `${id}: a winning move with ${left} left`);
            const target = state.board[m.toR][m.toC];
            Engine.applyMove(state, m);
            if (target && target.type === 'k') { won = true; break; }
            assert.ok(!Engine.hasPieceInEndzone(state.board, 2), `${id}: no touchdown for the defence`);
            const answer = Bot.puzzleDefense(state, left - 1);
            if (answer) Engine.applyMove(state, answer);
            if (Engine.hasPieceInEndzone(state.board, 1)) won = true; // The touchdown held
        }
        assert.ok(won, id);
    }
});

test('the defence: takes the king when it can; null with no move', () => {
    const board = Engine.createBoard();
    board[11][6] = { type: 'k', player: 1, hasMoved: true };
    board[10][5] = { type: 'k', player: 2, hasMoved: true };
    assert.deepEqual(Bot.puzzleDefense({ board, lastMove: null }, 2), { fromR: 10, fromC: 5, toR: 11, toC: 6 });
    const empty = Engine.createBoard();
    empty[11][6] = { type: 'k', player: 1, hasMoved: true };
    assert.equal(Bot.puzzleDefense({ board: empty, lastMove: null }, 2), null);
});

test('every puzzle quest has its puzzle, and its experience goes to the piece that played', () => {
    for (const q of Quests.QUESTS.filter((x) => x.goal.type === 'puzzle')) {
        assert.ok(Quests.PUZZLES[q.goal.id], q.id);
        assert.deepEqual(q.reward.xp, { to: 'engaged', amount: Quests.QUEST_XP });
    }
});
