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
      expect(code).toMatch(/^[A-Z]{4}$/);
    });
  }
});
