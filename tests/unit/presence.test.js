// @ts-check
// Presence (server/presence.js), with a stand-in Socket.io namespace: a database failure
// while a player connects must not stop the server, and a page that closes meanwhile must
// still leave the players online.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { registerPresence } = require('../../server/presence');

/** A namespace that only records the connection handler and what is emitted. */
function fakeIo() {
    const emitted = [];
    let onConnection = null;
    const ns = {
        use() {},
        on(event, fn) { if (event === 'connection') onConnection = fn; },
        to: (room) => ({ emit: (event, data) => emitted.push({ room, event, data }) }),
    };
    return { io: /** @type {any} */ ({ of: () => ns }), emitted, connect: (socket) => onConnection(socket) };
}

let nextId = 0;
function fakeSocket(user, page = 'site') {
    const socket = Object.assign(new EventEmitter(), {
        id: `s${++nextId}`,
        connected: true,
        data: { user },
        handshake: { auth: { page }, headers: {}, address: '127.0.0.1' },
        sent: [],
        join() {},
        disconnected: null,
        disconnect(close) { socket.disconnected = { close: Boolean(close) }; },
    });
    const emitLocal = socket.emit.bind(socket);
    socket.emit = (event, ...args) => { socket.sent.push({ event, data: args[0] }); return emitLocal(event, ...args); };
    return socket;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('a database failure while a player connects is logged, not thrown', async (t) => {
    const errors = [];
    t.mock.method(console, 'error', (message) => errors.push(message));
    const failing = { friendIds: async () => { throw new Error('connection terminated'); } };
    const { io, connect } = fakeIo();
    const presence = registerPresence(io, { sessions: null, friends: /** @type {any} */ (failing), rooms: {} });

    const socket = fakeSocket({ id: '7', username: 'alice' });
    assert.doesNotThrow(() => connect(socket));
    await tick();
    assert.ok(errors.some((m) => /connection terminated/.test(m)));
    assert.equal(presence.isOnline(7), true);

    socket.emit('disconnect');
    await tick();
    assert.equal(presence.isOnline(7), false, 'gone once the page closes');
});

test('a page that closes while the database answers is not left online', async () => {
    let release;
    const slow = { friendIds: () => new Promise((resolve) => { release = () => resolve([]); }) };
    const { io, connect } = fakeIo();
    const presence = registerPresence(io, { sessions: null, friends: /** @type {any} */ (slow), rooms: {} });

    const socket = fakeSocket({ id: 8, username: 'bob' });
    connect(socket);
    socket.connected = false;
    socket.emit('disconnect'); // Before the first query answers
    release();
    await tick();
    assert.equal(presence.isOnline(8), false);
});

test('friends are told where a player is once the database answers, not before', async () => {
    let release;
    const store = {
        friendIds: (id) => (Number(id) === 9 ? new Promise((resolve) => { release = () => resolve([10]); }) : Promise.resolve([9])),
        userById: async (id) => ({ id, username: id === 9 ? 'carol' : 'dan' }),
    };
    const { io, emitted, connect } = fakeIo();
    registerPresence(io, { sessions: null, friends: /** @type {any} */ (store), rooms: {} });
    connect(fakeSocket({ id: 10, username: 'dan' }));
    await tick();

    const carol = fakeSocket({ id: 9, username: 'carol' }, 'chesspell');
    connect(carol);
    carol.emit('disconnect'); // Leaves before her friends list arrives
    release();
    await tick();
    const told = emitted.filter((e) => e.event === 'friendPresence' && e.data.username === 'carol');
    assert.ok(told.length > 0);
    assert.equal(told.at(-1).data.where, null, 'the last word is that she left');
});

test('a guest is turned away without closing the shared game connection', () => {
    const { io, connect } = fakeIo();
    registerPresence(io, { sessions: null, friends: /** @type {any} */ ({}), rooms: {} });
    const guest = fakeSocket(null);
    connect(guest);
    assert.deepEqual(guest.disconnected, { close: false });
});
