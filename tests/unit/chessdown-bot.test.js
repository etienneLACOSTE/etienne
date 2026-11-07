// Unit tests for the Chessdown bot (games/chessdown/bot-search.js) and its trainer.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../games/chessdown/engine.js');
const Bot = require('../../games/chessdown/bot-search.js');
const { playGame, seededRandom, parseArgs } = require('../../tools/chessdown/train.js');

const { ROWS, MAX_POINTS, PIECE_VALUES } = Engine;

test('drafts are legal for both sides, every difficulty and archetype, and spend the budget', () => {
    const random = seededRandom(7);
    for (const player of [1, 2]) {
        const rows = player === 2 ? [0, 1, 2] : [ROWS - 3, ROWS - 2, ROWS - 1];
        for (const difficulty of ['novice', 'apprentice', 'expert', 'master']) {
            for (const archetype of ['normal', 'ecuries', 'citadelle', 'chapiteau', 'chair', 'sorcieres']) {
                for (let i = 0; i < 20; i++) {
                    const { pieces, pointsLeft } = Bot.draftArmy(Bot.DEFAULT_PROFILE, player, { difficulty, archetype, random });
                    const cost = pieces.reduce((sum, p) => sum + PIECE_VALUES[p.type], 0);
                    assert.equal(pieces.filter((p) => p.type === 'k').length, 1);
                    assert.ok(cost <= MAX_POINTS);
                    assert.ok(pointsLeft < 1, 'the whole budget is spent');
                    // Every piece bought is placed, unless the 24 squares are full (the
                    // "chair" archetype can buy more pawns than there are free squares).
                    if (pieces.length < 24) assert.equal(cost + pointsLeft, MAX_POINTS);
                    assert.ok(pieces.every((p) => rows.includes(p.r)), 'inside the deployment rows');
                    assert.equal(new Set(pieces.map((p) => `${p.r},${p.c}`)).size, pieces.length);
                }
            }
        }
    }
});

test('the old trainer bug is gone: armies hold more than a king', () => {
    const { pieces } = Bot.draftArmy(Bot.DEFAULT_PROFILE, 1, { random: seededRandom(1) });
    assert.ok(pieces.length > 5);
});

test('evaluate is the same score seen from either side', () => {
    const board = Engine.createBoard();
    board[11][4] = { type: 'k', player: 1 };
    board[0][4] = { type: 'k', player: 2 };
    board[9][0] = { type: 'r', player: 1 };
    assert.equal(Bot.evaluate(board, Bot.DEFAULT_PROFILE, 1), -Bot.evaluate(board, Bot.DEFAULT_PROFILE, 2));
    assert.ok(Bot.evaluate(board, Bot.DEFAULT_PROFILE, 1) > 0); // An extra rook
});

test('bestMove takes a hanging king, for either side', () => {
    for (const me of [1, 2]) {
        const state = { board: Engine.createBoard(), lastMove: null };
        state.board[11][4] = { type: 'k', player: 1 };
        state.board[0][4] = { type: 'k', player: 2 };
        state.board[me === 1 ? 6 : 5][4] = { type: 'r', player: me }; // A rook facing the enemy king
        const move = Bot.bestMove(state, me, 2, Bot.DEFAULT_PROFILE, () => 0);
        assert.deepEqual([move.toR, move.toC], me === 1 ? [0, 4] : [11, 4]);
    }
});

test('a training game ends with a result, and the same seed replays it', () => {
    const a = playGame(Bot.DEFAULT_PROFILE, Bot.DEFAULT_PROFILE, 2, seededRandom(3));
    const b = playGame(Bot.DEFAULT_PROFILE, Bot.DEFAULT_PROFILE, 2, seededRandom(3));
    assert.ok([0, 1, 2].includes(a));
    assert.equal(a, b);
});

test('trainer options', () => {
    const opts = parseArgs(['--generations', '5', '--depth', '2']);
    assert.equal(opts.generations, 5);
    assert.equal(opts.depth, 2);
    assert.throws(() => parseArgs(['--speed', '9']));
});
