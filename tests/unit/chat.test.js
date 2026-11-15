// Chat between the two players of an online game (server/chat.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gameChat, cleanMessage, MAX_LENGTH, RATE_MAX, RECENT, MAX_REPORTS } = require('../../server/chat');

/** A connection: `send` plays what the page sends; `got` keeps what the server answers it. */
function fakeSocket(id, user) {
    const handlers = {};
    const got = [];
    return {
        id, got, data: { user }, handshake: { headers: {} },
        on(event, fn) { handlers[event] = fn; },
        emit(event, data) { got.push([event, data]); },
        disconnect() {},
        async send(event, data) { // safeOn does not return the handler's promise: let it finish
            handlers[event](data);
            await new Promise((resolve) => setImmediate(resolve));
        },
    };
}

/** Two players in room ROOMAB; `accounts` null for a guest; `blocks` as "blockerId>blockedId". */
function table({ accounts = [{ id: 1, username: 'alice' }, { id: 2, username: 'bob' }], blocks = [], saveFails = false } = {}) {
    const sent = [];
    const nsp = { to: (id) => ({ emit: (event, data) => sent.push([id, event, data]) }) };
    const room = { id: 'ROOMAB', players: { 1: 'a', 2: 'b' }, accounts: { 1: accounts[0], 2: accounts[1] } };
    const friends = {
        blocked: async (x, y) => blocks.includes(`${x}>${y}`),
        block: async (x, y) => { blocks.push(`${x}>${y}`); },
    };
    const saved = [];
    const reports = { save: async (r) => { if (saveFails) throw new Error('down'); saved.push(r); } };
    const changed = [];
    const chat = gameChat(nsp, { ROOMAB: room }, friends, { game: 'chessdown', reports, onBlock: (ids) => changed.push(ids) });
    const a = fakeSocket('a', accounts[0]);
    const b = fakeSocket('b', accounts[1]);
    chat.connect(a);
    chat.connect(b);
    const to = (id, event) => sent.filter(([who, e]) => who === id && e === event).map(([, , d]) => d);
    return { sent, room, a, b, to, saved, changed, blocks };
}

test('chat: a message goes to both players, as text, with the sender name set by the server', async () => {
    const { a, to } = table();
    await a.send('chatJoin', { roomCode: 'ROOMAB', muted: false });
    assert.deepEqual(to('a', 'chatState').at(-1), { available: true, reason: null, opponentMuted: false });
    await a.send('chatMessage', { roomCode: 'ROOMAB', text: '  good‮ luck\n\n<b>!</b>  ', name: 'admin' });
    const message = { id: 1, from: 1, name: 'alice', text: 'good luck <b>!</b>' };
    assert.deepEqual(to('b', 'chatMessage'), [message]);
    assert.deepEqual(to('a', 'chatMessage'), [message]);
});

test('chat: empty, too long, not text, or from outside the room: nothing is relayed', async () => {
    const { a, sent } = table();
    for (const text of ['', '   ', 'x'.repeat(MAX_LENGTH + 1), 42, null]) {
        await a.send('chatMessage', { roomCode: 'ROOMAB', text });
    }
    await a.send('chatMessage', { roomCode: 'NOROOM', text: 'hi' });
    const stranger = fakeSocket('c', { id: 3, username: 'carol' });
    gameChat({ to: () => ({ emit: () => sent.push('!') }) }, {}, null).connect(stranger);
    assert.deepEqual(sent, []);
    assert.equal(cleanMessage('é'.repeat(MAX_LENGTH)), 'é'.repeat(MAX_LENGTH), 'counted in characters');
});

test('chat: only between two accounts', async () => {
    const guest = table({ accounts: [{ id: 1, username: 'alice' }, null] });
    await guest.a.send('chatJoin', { roomCode: 'ROOMAB' });
    assert.deepEqual(guest.to('a', 'chatState').at(-1), { available: false, reason: 'opponent-guest', opponentMuted: false });
    assert.deepEqual(guest.to('b', 'chatState').at(-1), { available: false, reason: 'you-guest', opponentMuted: false });
    await guest.a.send('chatMessage', { roomCode: 'ROOMAB', text: 'hi' });
    assert.deepEqual(guest.to('b', 'chatMessage'), []);
});

test('chat: none when either player blocked the other, and the blocked player is not told why', async () => {
    const { a, b, to } = table({ blocks: ['2>1'] });
    await a.send('chatJoin', { roomCode: 'ROOMAB' });
    assert.deepEqual(to('a', 'chatState').at(-1), { available: false, reason: 'unavailable', opponentMuted: false });
    assert.deepEqual(to('b', 'chatState').at(-1), { available: false, reason: 'you-blocked', opponentMuted: false });
    await a.send('chatMessage', { roomCode: 'ROOMAB', text: 'hi' });
    await b.send('chatMessage', { roomCode: 'ROOMAB', text: 'hi' });
    assert.deepEqual([...to('a', 'chatMessage'), ...to('b', 'chatMessage')], []);
});

test('chat: a player who turns it off gets nothing, and the opponent is told', async () => {
    const { a, b, to } = table();
    await b.send('chatMuted', { roomCode: 'ROOMAB', muted: true });
    assert.equal(to('a', 'chatState').at(-1).opponentMuted, true);
    await a.send('chatMessage', { roomCode: 'ROOMAB', text: 'hi' });
    assert.deepEqual(to('b', 'chatMessage'), []);
    assert.deepEqual(a.got, [['chatNotice', { reason: 'muted' }]]);
    await b.send('chatMessage', { roomCode: 'ROOMAB', text: 'hi' }); // Off for them too
    assert.deepEqual(to('a', 'chatMessage'), []);
    await b.send('chatMuted', { roomCode: 'ROOMAB', muted: false });
    assert.equal(to('a', 'chatState').at(-1).opponentMuted, false);
    await a.send('chatMessage', { roomCode: 'ROOMAB', text: 'hi' });
    assert.equal(to('b', 'chatMessage').length, 1);
});

test('chat: too many messages in a row are refused', async () => {
    const { a, to } = table();
    for (let i = 0; i < RATE_MAX + 2; i++) await a.send('chatMessage', { roomCode: 'ROOMAB', text: `m${i}` });
    assert.equal(to('b', 'chatMessage').length, RATE_MAX);
    assert.deepEqual(a.got, [['chatNotice', { reason: 'rate' }], ['chatNotice', { reason: 'rate' }]]);
});

test('chat: a player signed out since the game started cannot write', async () => {
    const { a, to } = table();
    a.data.user = null;
    await a.send('chatMessage', { roomCode: 'ROOMAB', text: 'hi' });
    assert.deepEqual(to('b', 'chatMessage'), []);
});

test('report: the message is copied from the server, once, only an opponent message', async () => {
    const { a, b, saved, to } = table();
    await b.send('chatMessage', { roomCode: 'ROOMAB', text: 'you are bad' });
    await a.send('chatMessage', { roomCode: 'ROOMAB', text: 'mine' });
    const [theirs, mine] = to('a', 'chatMessage');
    await a.send('chatReport', { roomCode: 'ROOMAB', messageId: mine.id, text: 'forged' }); // Own message: no
    await a.send('chatReport', { roomCode: 'ROOMAB', messageId: 999 });
    await a.send('chatReport', { roomCode: 'NOROOM', messageId: theirs.id });
    assert.deepEqual(saved, []);
    await a.send('chatReport', { roomCode: 'ROOMAB', messageId: theirs.id, text: 'forged' });
    await a.send('chatReport', { roomCode: 'ROOMAB', messageId: theirs.id }); // Twice: once
    assert.deepEqual(saved, [{ reporterId: 1, reportedId: 2, reportedName: 'bob', game: 'chessdown', message: 'you are bad' }]);
    assert.deepEqual(a.got.filter(([e]) => e === 'chatNotice'), [['chatNotice', { reason: 'reported', messageId: theirs.id }]]);
    assert.deepEqual(b.got, [], 'the reported player is not told');
});

test('report: old messages cannot be reported, a guest cannot report, a failure is said', async () => {
    const { a, b, room, saved, to } = table();
    for (let i = 0; i <= RECENT; i++) {
        await b.send('chatMessage', { roomCode: 'ROOMAB', text: `m${i}` });
        b.data.chatTimes = []; // Not limited in rate for this test
    }
    const first = to('a', 'chatMessage')[0];
    await a.send('chatReport', { roomCode: 'ROOMAB', messageId: first.id });
    assert.deepEqual(saved, [], 'only the last messages are kept');

    a.data.user = null; // Signed out
    await a.send('chatReport', { roomCode: 'ROOMAB', messageId: to('a', 'chatMessage').at(-1).id });
    assert.deepEqual(saved, []);

    const failing = table({ saveFails: true });
    await failing.b.send('chatMessage', { roomCode: 'ROOMAB', text: 'hey' });
    const id = failing.to('a', 'chatMessage')[0].id;
    await failing.a.send('chatReport', { roomCode: 'ROOMAB', messageId: id });
    assert.deepEqual(failing.a.got.at(-1), ['chatNotice', { reason: 'report-failed', messageId: id }]);
});

test('report: at most a few per game', async () => {
    const { a, b, saved, to } = table();
    for (let i = 0; i <= MAX_REPORTS; i++) {
        await b.send('chatMessage', { roomCode: 'ROOMAB', text: `m${i}` });
        b.data.chatTimes = [];
    }
    for (const m of to('a', 'chatMessage')) await a.send('chatReport', { roomCode: 'ROOMAB', messageId: m.id });
    assert.equal(saved.length, MAX_REPORTS);
    assert.equal(a.got.at(-1)[1].reason, 'report-limit');
});

test('block from the game: the chat stops for both, the blocked player is not told why', async () => {
    const { a, b, blocks, changed, to } = table();
    await a.send('chatJoin', { roomCode: 'ROOMAB', muted: false });
    await a.send('chatBlock', { roomCode: 'ROOMAB' });
    assert.deepEqual(blocks, ['1>2']);
    assert.deepEqual(changed, [[1, 2]]);
    assert.deepEqual(a.got.at(-1), ['chatNotice', { reason: 'blocked' }]);
    assert.deepEqual(to('a', 'chatState').at(-1), { available: false, reason: 'you-blocked', opponentMuted: false });
    assert.deepEqual(to('b', 'chatState').at(-1), { available: false, reason: 'unavailable', opponentMuted: false });
    await b.send('chatMessage', { roomCode: 'ROOMAB', text: 'hi' });
    assert.deepEqual(to('a', 'chatMessage'), []);
});

test('block from the game: only between two accounts', async () => {
    const { a, blocks } = table({ accounts: [{ id: 1, username: 'alice' }, null] });
    await a.send('chatBlock', { roomCode: 'ROOMAB' });
    assert.deepEqual(blocks, []);
});
