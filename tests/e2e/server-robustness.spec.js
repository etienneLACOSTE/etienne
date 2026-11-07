// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests } = require('./helpers');

// Malformed Socket.io messages must be ignored, never crash the shared server.
// The socket.io client is taken from a game page, so no extra dependency is needed.

const MALFORMED = {
  '/chessdown': [
    ['joinRoom', null],
    ['joinRoom', { roomCode: 'ABCD' }],
    ['makeMove', null],
    ['makeMove', { roomCode: '__proto__', from: { r: 0, c: 0 }, to: { r: 0, c: 0 } }],
    ['makeMove', { roomCode: '$ROOM', from: { r: 99, c: 0 }, to: { r: 0, c: 0 } }],
    ['makeMove', { roomCode: '$ROOM', from: null, to: { r: 0, c: 0 } }],
    ['draftComplete', null],
    ['draftComplete', { roomCode: '$ROOM', player: 1 }],
    ['draftComplete', { roomCode: '$ROOM', player: 1, pieces: [{ r: 99, c: 0, type: 'k' }] }],
    ['draftComplete', { roomCode: '$ROOM', player: 1, pieces: [null] }],
    ['colorSelected', null],
    ['colorSelected', { roomCode: '__proto__', player: 1, color: 'red' }],
    ['playAgainRequest', null],
    ['leaveRoom', null],
  ],
  '/chesspell': [
    ['createRoom', null],
    ['joinRoom', null],
    ['makeMove', null],
    ['makeMove', { roomCode: '__proto__' }],
    ['spellActivated', null],
    ['spellSquareClicked', null],
    ['leaveRoom', null],
  ],
};

test.describe('Server robustness', () => {
  test('oversized messages are refused and do not affect the server', async ({ page, request }) => {
    await blockExternalRequests(page);
    await page.goto('/chessdown/');
    const disconnected = await page.evaluate(async () => {
      const s = io('/chesspell', { forceNew: true, reconnection: false });
      await new Promise((resolve) => s.on('connect', resolve));
      const closed = new Promise((resolve) => s.on('disconnect', () => resolve(true)));
      s.emit('createRoom', { deck: [8, 12, 5], profile: { name: 'x', avatar: 'a'.repeat(400_000) } });
      return Promise.race([closed, new Promise((resolve) => setTimeout(() => resolve(false), 3000))]);
    });
    expect(disconnected).toBe(true);
    expect((await request.get('/')).ok()).toBe(true);
  });

  for (const [namespace, messages] of Object.entries(MALFORMED)) {
    test(`${namespace}: malformed messages do not crash the server`, async ({ page, request }) => {
      await blockExternalRequests(page);
      await page.goto('/chessdown/'); // Any page that loads /socket.io/socket.io.js

      await page.evaluate(async ({ ns, msgs }) => {
        const attacker = io(ns, { forceNew: true });
        await new Promise((resolve) => attacker.on('connect', resolve));
        // Some payloads target a real room so they reach the deeper handler code.
        const roomCode = await new Promise((resolve) => {
          attacker.once('roomCreated', resolve);
          attacker.emit('createRoom', { deck: [8, 12, 5], profile: null });
        });
        const victim = io(ns, { forceNew: true });
        await new Promise((resolve) => victim.on('connect', resolve));
        victim.emit('joinRoom', ns === '/chessdown' ? roomCode : { roomCode, deck: [1, 15, 14], profile: null });
        await new Promise((resolve) => setTimeout(resolve, 200));

        for (const [event, payload] of msgs) {
          const data = JSON.parse(JSON.stringify(payload ?? null).replaceAll('$ROOM', roomCode));
          attacker.emit(event, data);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        attacker.disconnect();
        victim.disconnect();
      }, { ns: namespace, msgs: messages });

      // The server still answers HTTP...
      expect((await request.get('/')).ok()).toBe(true);
      // ...and still serves a normal room creation.
      const code = await page.evaluate(async (ns) => {
        const s = io(ns, { forceNew: true });
        const created = await new Promise((resolve) => {
          s.once('roomCreated', resolve);
          s.emit('createRoom', { deck: [8, 12, 5], profile: null });
        });
        s.disconnect();
        return created;
      }, namespace);
      expect(code).toMatch(/^[A-Z]{6}$/);
    });
  }

  test('a message flood is cut off, other players are not affected', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/chessdown/');
    const result = await page.evaluate(async () => {
      const connect = () => new Promise((resolve) => { const s = io('/chessdown', { forceNew: true }); s.on('connect', () => resolve(s)); });
      const flooder = await connect();
      const cut = new Promise((resolve) => flooder.on('disconnect', () => resolve(true)));
      for (let i = 0; i < 500; i++) flooder.emit('colorSelected', { roomCode: 'NOROOM', player: 1, color: 'red' });
      const wasCut = await Promise.race([cut, new Promise((r) => setTimeout(() => r(false), 3000))]);
      const player = await connect();
      const code = await new Promise((r) => { player.once('roomCreated', r); player.emit('createRoom'); });
      return { wasCut, code };
    });
    expect(result.wasCut).toBe(true);
    expect(result.code).toMatch(/^[A-Z]{6}$/);
  });

  test('a player has one waiting room at a time', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/chessdown/');
    const result = await page.evaluate(async () => {
      const connect = () => new Promise((resolve) => { const s = io('/chessdown', { forceNew: true }); s.on('connect', () => resolve(s)); });
      const create = (s) => new Promise((r) => { s.once('roomCreated', r); s.emit('createRoom'); });
      const host = await connect();
      const first = await create(host);
      await create(host);
      const guest = await connect();
      const error = new Promise((r) => guest.once('errorMsg', r));
      guest.emit('joinRoom', first);
      return error;
    });
    expect(result).toBe('Room not found.');
  });
});
