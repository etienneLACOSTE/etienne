// Unit tests for the server's socket helpers: rate limit and room cap.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { safeOn, makeRoomFor, MAX_ROOMS, BURST } = require('../../server/socket-utils');

/** A stand-in for a socket.io socket: records handlers, leaves and disconnects. */
function fakeSocket(id = 'me') {
    const handlers = {};
    return {
        id, data: {}, left: [], disconnected: false,
        on(event, fn) { handlers[event] = fn; },
        emit(event, ...args) { handlers[event](...args); },
        leave(code) { this.left.push(code); },
        disconnect() { this.disconnected = true; },
    };
}

test('messages beyond the burst are dropped, then the socket is cut off', () => {
    const socket = fakeSocket();
    let handled = 0;
    safeOn(socket, 'ping', () => handled++);
    for (let i = 0; i < BURST + 10; i++) socket.emit('ping');
    assert.equal(handled, BURST);
    assert.equal(socket.disconnected, false);
    for (let i = 0; i < 300; i++) socket.emit('ping');
    assert.equal(socket.disconnected, true);
});

test('disconnect is always handled, even over the limit', () => {
    const socket = fakeSocket();
    let cleaned = false;
    safeOn(socket, 'ping', () => {});
    safeOn(socket, 'disconnect', () => { cleaned = true; });
    for (let i = 0; i < BURST + 5; i++) socket.emit('ping');
    socket.emit('disconnect');
    assert.equal(cleaned, true);
});

test("a new room closes the player's waiting room", () => {
    const socket = fakeSocket('host');
    const rooms = {
        AAAAAA: { players: { 1: 'host', 2: null } },
        BBBBBB: { players: { 1: 'host', 2: 'guest' } }, // Already playing: kept
        CCCCCC: { players: { 1: 'other', 2: null } },
    };
    assert.equal(makeRoomFor(rooms, socket), true);
    assert.deepEqual(Object.keys(rooms), ['BBBBBB', 'CCCCCC']);
    assert.deepEqual(socket.left, ['AAAAAA']);
});

test('no new room once the cap is reached', () => {
    const rooms = {};
    for (let i = 0; i < MAX_ROOMS; i++) rooms[`R${i}`] = { players: { 1: `p${i}`, 2: `q${i}` } };
    assert.equal(makeRoomFor(rooms, fakeSocket()), false);
    delete rooms.R0;
    assert.equal(makeRoomFor(rooms, fakeSocket()), true);
});
