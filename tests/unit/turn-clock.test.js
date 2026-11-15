// Unit tests for the server clock: the time left told to a page that comes back.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TurnClock } = require('../../server/turn-clock');

/** Run `fn` with Date.now() returning `now`. */
function at(now, fn) {
    const real = Date.now;
    Date.now = () => now;
    try { return fn(); } finally { Date.now = real; }
}

test('per turn: the player to move has what is left of the turn, the other a full turn', () => {
    const clock = new TurnClock({ mode: 'turn', ms: 10_000 }, () => {});
    at(1_000, () => clock.start(1));
    assert.deepEqual(at(4_000, () => clock.left([1, 2])), { 1: 7_000, 2: 10_000 });
    assert.deepEqual(at(20_000, () => clock.left([1, 2])), { 1: 0, 2: 10_000 }, 'never below zero');
    at(4_000, () => clock.stop());
    assert.deepEqual(clock.left([1, 2]), { 1: 10_000, 2: 10_000 });
});

test('overall: each player has their own total, minus the running turn', () => {
    const clock = new TurnClock({ mode: 'overall', ms: 60_000 }, () => {});
    at(1_000, () => clock.start('white'));
    at(16_000, () => clock.start('black')); // White spent 15 s
    assert.deepEqual(at(26_000, () => clock.left(['white', 'black'])), { white: 45_000, black: 50_000 });
    clock.stop();
});

test('a turn that starts after a delay (coin flip) has not started yet', () => {
    const clock = new TurnClock({ mode: 'turn', ms: 10_000 }, () => {});
    at(0, () => clock.start(2, 3_000));
    assert.deepEqual(at(1_000, () => clock.left([1, 2])), { 1: 10_000, 2: 10_000 });
    clock.stop();
});
