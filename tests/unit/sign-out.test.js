// @ts-check
// After a sign-out, open connections stop acting for the account (server/sign-out.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { forgetSignedOut } = require('../../server/sign-out');

const socket = (id, user, session) => ({ id, data: { user, session }, closed: false, disconnect() { this.closed = true; } });

function setUp() {
    const alice = { id: 1, username: 'alice' };
    const bob = { id: 2, username: 'bob' };
    const s = {
        aliceGame: socket('g1', alice, 'laptop'),
        alicePhoneGame: socket('g2', alice, 'phone'),
        bobGame: socket('g3', bob, 'bob'),
        alicePresence: socket('p1', alice, 'laptop'),
        alicePhonePresence: socket('p2', alice, 'phone'),
        bobPresence: socket('p3', bob, 'bob'),
    };
    const namespaces = {
        '/chesspell': [s.aliceGame, s.bobGame],
        '/chessdown': [s.alicePhoneGame],
        '/presence': [s.alicePresence, s.alicePhonePresence, s.bobPresence],
    };
    const io = /** @type {any} */ ({ of: (name) => ({ sockets: new Map(namespaces[name].map((x) => [x.id, x])) }) });
    const rooms = {
        chesspell: { ROOMAA: { players: { 1: 'g1', 2: 'g3' }, accounts: { 1: alice, 2: bob } } },
        chessdown: { ROOMBB: { players: { 1: 'g2', 2: null }, accounts: { 1: alice, 2: null } } },
    };
    return { io, rooms, s, alice, bob };
}

test('signing out one session: only its connections, the game goes on as a guest', () => {
    const { io, rooms, s, bob } = setUp();
    forgetSignedOut(io, rooms, { session: 'laptop' });
    assert.equal(s.aliceGame.data.user, null);
    assert.deepEqual(rooms.chesspell.ROOMAA.accounts, { 1: null, 2: bob }, 'no longer counted for alice');
    assert.equal(s.alicePresence.closed, true);
    assert.equal(s.alicePhonePresence.closed, false, 'her phone stays signed in');
    assert.equal(s.alicePhoneGame.data.user.id, 1);
    assert.equal(rooms.chessdown.ROOMBB.accounts[1].id, 1);
    assert.equal(s.bobPresence.closed, false);
});

test('signing out everywhere (or deleting the account): every connection of the account', () => {
    const { io, rooms, s, bob } = setUp();
    forgetSignedOut(io, rooms, { userId: 1 });
    assert.equal(s.aliceGame.data.user, null);
    assert.equal(s.alicePhoneGame.data.user, null);
    assert.deepEqual(rooms.chesspell.ROOMAA.accounts, { 1: null, 2: bob });
    assert.equal(rooms.chessdown.ROOMBB.accounts[1], null);
    assert.equal(s.alicePresence.closed && s.alicePhonePresence.closed, true);
    assert.equal(s.bobPresence.closed, false);
    assert.equal(s.bobGame.data.user, bob);
});
