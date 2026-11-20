// Chessdown matches (games/chessdown/series.js): best of 3 or a single game.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Series = require('../../games/chessdown/series.js');

const play = (format, winners) => winners.reduce((s, w) => Series.recordGame(s, w), Series.newSeries(format));

test('best of 3: first to 2 won games; the loser of a game starts the next one', () => {
    let s = Series.newSeries('bo3');
    assert.equal(Series.starter(s), 0, 'the coin decides the first game');
    s = Series.recordGame(s, 1);
    assert.deepEqual({ wins: s.wins, games: s.games, over: s.over }, { wins: { 1: 1, 2: 0 }, games: 1, over: false });
    assert.equal(Series.starter(s), 2);
    s = Series.recordGame(s, 2);
    assert.equal(Series.starter(s), 1);
    s = Series.recordGame(s, 2);
    assert.deepEqual({ over: s.over, winner: s.winner, wins: s.wins }, { over: true, winner: 2, wins: { 1: 1, 2: 2 } });
    assert.equal(Series.recordGame(s, 1), s, 'nothing counts once over');
    assert.deepEqual(play('bo3', [1, 1]).winner, 1);
});

test('best of 3: a drawn game counts for nobody, and the coin decides who starts next', () => {
    const s = play('bo3', [1, 0]);
    assert.deepEqual({ wins: s.wins, games: s.games, over: s.over }, { wins: { 1: 1, 2: 0 }, games: 2, over: false });
    assert.equal(Series.starter(s), 0);
});

test('best of 3: after 5 games the series ends, won by the one ahead or drawn', () => {
    assert.deepEqual(play('bo3', [0, 0, 0, 0, 0]).winner, 0);
    assert.equal(play('bo3', [0, 0, 0, 0, 0]).over, true);
    const ahead = play('bo3', [0, 1, 0, 0, 0]);
    assert.deepEqual({ over: ahead.over, winner: ahead.winner }, { over: true, winner: 1 });
    assert.equal(play('bo3', [0, 0, 0, 0]).over, false);
});

test('single game: over after one game, the coin always decides', () => {
    const s = play('single', [2]);
    assert.deepEqual({ over: s.over, winner: s.winner }, { over: true, winner: 2 });
    assert.equal(play('single', [0]).winner, 0);
    assert.equal(Series.starter(play('single', [1])), 0);
    assert.equal(Series.newSeries('anything').format, 'bo3');
});

test('timer: 30 s turns for a best of 3, the chosen timer for a single game', () => {
    const chosen = { mode: 'overall', seconds: 300 };
    assert.deepEqual(Series.timerFor(Series.newSeries('bo3'), chosen), { mode: 'turn', seconds: 30 });
    assert.equal(Series.timerFor(Series.newSeries('single'), chosen), chosen);
});
