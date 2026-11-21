// Special match rules of the career quests (games/chessdown/engine.js: matchRules,
// draftRows, checkArmy; bot-search.js: draftArmy's banned types). Without rules the engine
// is unchanged (tests/unit/chessdown-levels.test.js compares it with the classic engine).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../games/chessdown/engine.js');
const Bot = require('../../games/chessdown/bot-search.js');

const piece = (type, player, extra = {}) => ({ type, player, hasMoved: true, ...extra });
function stateWith(pieces, rules) {
    const board = Engine.createBoard();
    for (const [r, c, p] of pieces) board[r][c] = p;
    return { board, lastMove: null, ...(rules ? { rules } : {}) };
}
const squares = (moves) => moves.map((m) => `${m.r},${m.c}`).sort();

test('no retreat: the player\'s pieces go forward or sideways only; the other side is free', () => {
    const rules = Engine.matchRules({ noRetreat: [1] });
    const s = stateWith([[6, 3, piece('r', 1)], [5, 6, piece('r', 2)]], rules);
    const mine = Engine.getValidMoves(s, 6, 3);
    assert.ok(mine.length > 0);
    assert.ok(mine.every((m) => m.r <= 6), 'player 1 goes up the board, never down');
    assert.ok(mine.some((m) => m.r === 6) && mine.some((m) => m.r < 6));
    const theirs = Engine.getValidMoves(s, 5, 6);
    assert.ok(theirs.some((m) => m.r < 5), 'player 2 may still go back');
    // A knight's backward jumps are gone too
    const k = stateWith([[6, 3, piece('n', 1)]], rules);
    assert.deepEqual(squares(Engine.getValidMoves(k, 6, 3)), ['4,2', '4,4', '5,1', '5,5'].sort());
});

test('no capture during the first moves: counted by applyMove, given back by undoMove', () => {
    const rules = Engine.matchRules({ noCaptureMoves: { 1: 2 } });
    const s = stateWith([[8, 3, piece('p', 1)], [7, 4, piece('p', 2)], [10, 0, piece('r', 1)], [1, 0, piece('r', 2)]], rules);
    const pawn = () => squares(Engine.getValidMoves(s, 8, 3));
    assert.deepEqual(pawn(), ['7,3'], 'no capture yet');
    assert.ok(Engine.getValidMoves(s, 7, 4).some((m) => m.r === 8 && m.c === 3), 'the other side may capture');
    const first = { fromR: 10, fromC: 0, toR: 10, toC: 1 };
    const undoFirst = Engine.applyMove(s, first);
    Engine.applyMove(s, { fromR: 1, fromC: 0, toR: 1, toC: 1 });
    assert.deepEqual(rules.moves, { 1: 1, 2: 1 });
    assert.deepEqual(pawn(), ['7,3']);
    const second = { fromR: 10, fromC: 1, toR: 10, toC: 0 };
    const undo = Engine.applyMove(s, second);
    assert.deepEqual(pawn(), ['7,3', '7,4'], 'two moves made: captures allowed');
    Engine.undoMove(s, second, undo);
    assert.equal(rules.moves[1], 1);
    assert.deepEqual(pawn(), ['7,3']);
    assert.ok(undoFirst);
});

test('no capture also forbids en passant', () => {
    const rules = Engine.matchRules({ noCaptureMoves: { 1: 5 } });
    const s = stateWith([[5, 3, piece('p', 1)], [3, 4, piece('p', 2, { hasMoved: false })]], rules);
    Engine.applyMove(s, { fromR: 3, fromC: 4, toR: 5, toC: 4 }); // Double step beside the pawn
    assert.deepEqual(squares(Engine.getValidMoves(s, 5, 3)), ['4,3']);
    const free = stateWith([[5, 3, piece('p', 1)], [3, 4, piece('p', 2, { hasMoved: false })]]);
    Engine.applyMove(free, { fromR: 3, fromC: 4, toR: 5, toC: 4 });
    assert.ok(Engine.getValidMoves(free, 5, 3).some((m) => m.isEnPassant), 'en passant without the rule');
});

test('without rules, moves are the same as before', () => {
    const pieces = [[6, 3, piece('q', 1)], [2, 3, piece('k', 2)], [9, 4, piece('k', 1)], [6, 6, piece('p', 2)]];
    const plain = stateWith(pieces);
    const empty = stateWith(pieces.map(([r, c, p]) => [r, c, { ...p }]), Engine.matchRules({}));
    assert.deepEqual(Engine.generateAllMoves(empty, 1), Engine.generateAllMoves(plain, 1));
    assert.deepEqual(Engine.generateAllMoves(empty, 2), Engine.generateAllMoves(plain, 2));
});

test('the bot follows the rules: never a retreat, never an early capture', () => {
    for (let seed = 1; seed <= 20; seed++) {
        let x = seed;
        const random = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
        const { pieces } = Bot.draftArmy(Bot.DEFAULT_PROFILE, 2, { random });
        const mine = Bot.draftArmy(Bot.DEFAULT_PROFILE, 1, { random }).pieces;
        const board = Engine.createBoard();
        for (const p of pieces) board[p.r][p.c] = piece(p.type, 2, { hasMoved: false });
        for (const p of mine) board[p.r - 4][p.c] = piece(p.type, 1, { hasMoved: true }); // Pushed forward: contact
        const s = { board, lastMove: null, rules: Engine.matchRules({ noRetreat: [2], noCaptureMoves: { 2: 3 } }) };
        const move = Bot.bestMove(s, 2, 2, Bot.DEFAULT_PROFILE, random);
        if (!move) continue;
        assert.ok(move.toR >= move.fromR, `seed ${seed}: player 2 moves down the board`);
        assert.equal(s.board[move.toR][move.toC], null, `seed ${seed}: no capture`);
        assert.deepEqual(s.rules.moves, { 1: 0, 2: 0 }, 'the search left the counts as they were');
    }
});

test('draft rows: the back three, or the three nearest the middle', () => {
    assert.deepEqual(Engine.draftRows(1), [9, 11]);
    assert.deepEqual(Engine.draftRows(2), [0, 2]);
    assert.deepEqual(Engine.draftRows(1, true), [6, 8]);
    assert.deepEqual(Engine.draftRows(2, true), [3, 5]);
});

test('an army is checked against the quest: squad, banned types, size, rows, players, budget', () => {
    const army = [{ r: 11, c: 3, type: 'k' }, { r: 10, c: 3, type: 'p' }, { r: 10, c: 4, type: 'p' }, { r: 9, c: 0, type: 'r' }];
    assert.deepEqual(Engine.checkArmy(army, 1), []);
    assert.deepEqual(Engine.checkArmy(army, 1, { squad: ['k', 'p', 'p', 'p'] }), ['squad']);
    assert.deepEqual(Engine.checkArmy(army.slice(0, 3), 1, { squad: ['k', 'p', 'p', 'p'] }), [], 'fewer than the squad is fine');
    assert.deepEqual(Engine.checkArmy(army, 1, { banned: ['r'] }), ['banned']);
    assert.deepEqual(Engine.checkArmy(army, 1, { maxPieces: 3 }), ['maxPieces']);
    assert.deepEqual(Engine.checkArmy(army, 1, { invertedRows: true }), ['square']);
    assert.deepEqual(Engine.checkArmy(army, 1, { budget: 6 }), ['budget']);
    assert.deepEqual(Engine.checkArmy([{ r: 11, c: 3, type: 'k', level: 5 }, { r: 10, c: 3, type: 'r', level: 1 }], 1, { budget: 3 }), [], 'levels cost what they cost; the king is free');
    assert.deepEqual(Engine.checkArmy([{ r: 11, c: 3, type: 'p' }, { r: 11, c: 3, type: 'p' }], 1), ['twice', 'king']);
    const club = [{ r: 11, c: 3, type: 'k', clubId: 1 }, { r: 10, c: 3, type: 'p', clubId: 9 }];
    assert.deepEqual(Engine.checkArmy(club, 1, { allowedIds: [1, 2, 3] }), ['players']);
});

test('the bot drafts without the banned pieces, even when its style relies on them', () => {
    for (let seed = 1; seed <= 10; seed++) {
        let x = seed;
        const random = () => { x = (x * 16807) % 2147483647; return x / 2147483647; };
        const { pieces } = Bot.draftArmy(Bot.DEFAULT_PROFILE, 2, { random, archetype: 'sorcieres', banned: ['q', 'r'] });
        assert.ok(pieces.every((p) => p.type !== 'q' && p.type !== 'r'));
        assert.equal(pieces.filter((p) => p.type === 'k').length, 1);
        assert.deepEqual(Engine.checkArmy(pieces, 2, { banned: ['q', 'r'] }), []);
    }
});

test('noKingCapture: the player may not take the king; the other side still may', () => {
    const board = Engine.createBoard();
    board[5][3] = { type: 'r', player: 1, hasMoved: true };
    board[1][3] = { type: 'k', player: 2, hasMoved: true };
    board[1][0] = { type: 'r', player: 2, hasMoved: true };
    board[11][0] = { type: 'k', player: 1, hasMoved: true };
    const state = { board, lastMove: null, rules: Engine.matchRules({ noKingCapture: [1] }) };
    assert.ok(!Engine.getValidMoves(state, 5, 3).some((m) => m.r === 1 && m.c === 3), 'the king is out of reach');
    assert.ok(Engine.getValidMoves(state, 5, 3).some((m) => m.r === 2 && m.c === 3), 'the square before it is not');
    assert.ok(Engine.getValidMoves(state, 1, 0).some((m) => m.r === 11 && m.c === 0), 'player 2 may take the king');
});
