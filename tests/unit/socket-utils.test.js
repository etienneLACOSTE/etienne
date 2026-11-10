// Unit tests for the server's socket helpers: rate limit and room cap.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    safeOn, makeRoomFor, roomOrigin, clientIp, limitConnections, idleRooms, playerOf,
    MAX_ROOMS, MAX_ROOMS_PER_IP, MAX_CONNECTIONS_PER_IP, IDLE_ROOM_MS, BURST,
} = require('../../server/socket-utils');

/** A stand-in for a socket.io socket: records handlers, leaves and disconnects. */
function fakeSocket(id = 'me', address = '10.0.0.1', headers = {}) {
    const handlers = {};
    return {
        id, data: {}, left: [], disconnected: false, handshake: { address, headers },
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

test('one address cannot hold more than a few rooms', () => {
    const rooms = {};
    for (let i = 0; i < MAX_ROOMS_PER_IP; i++) {
        const host = fakeSocket(`host${i}`, '10.0.0.9');
        assert.equal(makeRoomFor(rooms, host), true);
        rooms[`R${i}`] = { players: { 1: host.id, 2: 'guest' }, ...roomOrigin(host) };
    }
    assert.equal(makeRoomFor(rooms, fakeSocket('one-more', '10.0.0.9')), false);
    assert.equal(makeRoomFor(rooms, fakeSocket('neighbour', '10.0.0.10')), true);
});

test("the address comes from the host's header only when CLIENT_IP_HEADER names it", () => {
    const socket = fakeSocket('me', '10.1.1.1', { 'x-forwarded-for': '6.6.6.6', 'cf-connecting-ip': '203.0.113.7' });
    assert.equal(clientIp(socket), '10.1.1.1'); // Headers ignored by default
    process.env.CLIENT_IP_HEADER = 'CF-Connecting-IP';
    try {
        assert.equal(clientIp(socket), '203.0.113.7');
        assert.equal(clientIp(fakeSocket('me', '10.1.1.1')), '10.1.1.1'); // Header missing: the connection
    } finally {
        delete process.env.CLIENT_IP_HEADER;
    }
});

test('too many connections from one address are refused, and freed on disconnect', () => {
    let middleware;
    limitConnections({ use(fn) { middleware = fn; } });
    const connect = (socket) => { let error = null; middleware(socket, (e) => { error = e || null; }); return error; };
    const sockets = Array.from({ length: MAX_CONNECTIONS_PER_IP }, (_, i) => fakeSocket(`s${i}`, '10.0.0.7'));
    sockets.forEach((socket) => assert.equal(connect(socket), null));
    assert.ok(connect(fakeSocket('extra', '10.0.0.7')) instanceof Error);
    assert.equal(connect(fakeSocket('elsewhere', '10.0.0.8')), null);
    sockets[0].emit('disconnect');
    assert.equal(connect(fakeSocket('again', '10.0.0.7')), null);
});

test('a connection whose link closes before it is accepted is freed once', () => {
    let middleware;
    limitConnections({ use(fn) { middleware = fn; } });
    const { EventEmitter } = require('node:events');
    const connect = (socket) => { let error = null; middleware(socket, (e) => { error = e || null; }); return error; };
    // The link closes while a later check waits: Socket.io never sends 'disconnect' then.
    for (let i = 0; i < MAX_CONNECTIONS_PER_IP * 2; i++) {
        const socket = Object.assign(fakeSocket(`gone${i}`, '10.0.0.9'), { conn: new EventEmitter() });
        assert.equal(connect(socket), null, `connection ${i} accepted`);
        socket.conn.emit('close');
    }
    // Both events for one socket count once: the other sockets' places are kept.
    const sockets = Array.from({ length: MAX_CONNECTIONS_PER_IP }, (_, i) => Object.assign(fakeSocket(`s${i}`, '10.0.0.10'), { conn: new EventEmitter() }));
    sockets.forEach((socket) => assert.equal(connect(socket), null));
    sockets[0].emit('disconnect');
    sockets[0].conn.emit('close');
    assert.equal(connect(fakeSocket('one', '10.0.0.10')), null);
    assert.ok(connect(fakeSocket('two', '10.0.0.10')) instanceof Error);
});

test('idle rooms: closed after 15 minutes, unless a game is being played', () => {
    const now = Date.now();
    const old = now - IDLE_ROOM_MS - 1;
    const rooms = {
        WAITING: { gameState: 'waiting', lastActivity: old },
        OVER: { gameState: 'over', lastActivity: old },
        PLAYING: { gameState: 'playing', lastActivity: old }, // The clock and the idle turns handle it
        RECENT: { gameState: 'waiting', lastActivity: now - 1000 },
    };
    assert.deepEqual(idleRooms(rooms, now), ['WAITING', 'OVER']);
});

test("a player's message counts as activity in the room, an outsider's does not", () => {
    const room = { players: { 1: 'a', 2: 'b' }, lastActivity: 0 };
    playerOf(room, fakeSocket('stranger'));
    assert.equal(room.lastActivity, 0);
    assert.equal(playerOf(room, fakeSocket('b')), 2);
    assert.ok(room.lastActivity > 0);
});
