// @ts-check
const { test, expect } = require('@playwright/test');
const { answerDialog, blockExternalRequests, signedInContext, trackPageErrors } = require('./helpers');

// A page reloaded in the middle of an online game takes its seat back with the seat token
// it kept for this tab (assets/js/seat.js, server/socket-utils.js seatKeeper), while the
// seat is held (3 s in the tests), and shows the game as the server keeps it.

const KINGS = { 1: [{ r: 11, c: 4, type: 'k' }], 2: [{ r: 0, c: 3, type: 'k' }] };

/** A raw connection to `game` in `page`, every event it gets in window.seen. */
const rawSocket = (page, game) => page.evaluate((g) => {
  window.s = io(`/${g}`, { forceNew: true });
  window.seen = [];
  window.s.onAny((event) => window.seen.push(event));
}, game);
const seen = (page) => page.evaluate(() => window.seen);
const cd = (page, field) => page.evaluate((f) => chessdown.state[f], field);

/** The Chessdown page creates a room; a raw connection joins and drafts its king. */
async function chessdownRoom(page, opponent) {
  await page.goto('/chessdown/');
  await page.locator('#btn-create-room').dispatchEvent('pointerdown');
  await expect(page.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/);
  const code = /** @type {string} */ (await page.locator('#waiting-room-code').textContent());
  await opponent.goto('/chessdown/');
  await rawSocket(opponent, 'chessdown');
  await opponent.evaluate(([c, pieces]) => {
    window.s.once('gameStarted', () => window.s.emit('draftComplete', { roomCode: c, player: 2, color: 'red', pieces }));
    window.s.emit('joinRoom', c);
  }, [code, KINGS[2]]);
  await expect.poll(() => cd(page, 'gameState')).toBe('draft1');
  return code;
}

/** The Ches'spell page creates a room as Guest 1, a raw connection joins: the game starts. */
async function chesspellGame(contexts, page, opponent) {
  const profiles = [{ id: 'guest1', name: 'Guest 1', avatar: '', stats: { played: 0, wins: 0 }, deck: [8, 12, 5] }];
  await contexts[0].addInitScript((p) => localStorage.setItem('spellChessProfiles', JSON.stringify(p)), profiles);
  await page.goto('/chesspell/');
  await page.getByRole('button', { name: 'Online Multiplayer' }).click();
  await page.locator('#online-p1-select').selectOption('guest1');
  await page.locator('#btn-create-room').click();
  await expect(page.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/);
  const code = /** @type {string} */ (await page.locator('#waiting-room-code').textContent());
  await opponent.goto('/chesspell/');
  await rawSocket(opponent, 'chesspell');
  await opponent.evaluate((c) => window.s.emit('joinRoom', {
    roomCode: c, deck: [1, 15, 14], profile: { id: 'x', name: 'Rival', avatar: '', stats: {} },
  }), code);
  await expect(page.locator('#game-board')).toHaveClass(/active/);
  return code;
}
const storedSeat = (page, game) => page.evaluate((g) => sessionStorage.getItem(`pawnet.seat.${g}`), game);

async function pages(browser) {
  const [a, b] = [await signedInContext(browser), await signedInContext(browser)];
  const contexts = [a.context, b.context];
  return { contexts, page: await contexts[0].newPage(), opponent: await contexts[1].newPage(), opponentName: b.name };
}

test.describe('Coming back after a reload', () => {
  test('Chessdown: the waiting room comes back with its code, and the opponent can still join', async ({ browser }) => {
    const { contexts, page, opponent } = await pages(browser);
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');
    await page.locator('#btn-create-room').dispatchEvent('pointerdown');
    await expect(page.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/);
    const code = await page.locator('#waiting-room-code').textContent();

    await page.reload();
    await expect(page.locator('#waiting-screen')).toBeVisible();
    await expect(page.locator('#waiting-room-code')).toHaveText(code ?? '');
    await opponent.goto('/chessdown/');
    await rawSocket(opponent, 'chessdown');
    await opponent.evaluate((c) => window.s.emit('joinRoom', c), code);
    await expect.poll(() => cd(page, 'gameState')).toBe('draft1');
    expect(errors).toEqual([]);
    for (const c of contexts) await c.close();
  });

  test("Chessdown: during the draft, the draft starts again and the opponent's army stays hidden", async ({ browser }) => {
    const { contexts, page, opponent } = await pages(browser);
    const errors = trackPageErrors(page);
    const code = await chessdownRoom(page, opponent); // The opponent has drafted already

    await page.reload();
    await expect.poll(() => cd(page, 'gameState')).toBe('draft1');
    await expect(page.locator('#draft-header')).toBeVisible();
    expect(await cd(page, 'currentRoomCode')).toBe(code);
    const board = await cd(page, 'board');
    expect(board.flat().filter(Boolean)).toEqual([]);
    await expect.poll(() => seen(opponent)).toContain('opponentReconnected');

    // The new connection drafts, and the game starts for both.
    await page.evaluate(async ([c, pieces]) => {
      const { socket } = await import('/chessdown/js/state.js');
      socket.emit('draftComplete', { roomCode: c, player: 1, color: 'blue', pieces });
    }, [code, KINGS[1]]);
    await expect.poll(() => cd(page, 'gameState')).toBe('gameplay');
    expect(errors).toEqual([]);
    for (const c of contexts) await c.close();
  });

  test('Chessdown: in the middle of the game, the board, the turn and the clock come back', async ({ browser }) => {
    const { contexts, page, opponent } = await pages(browser);
    const errors = trackPageErrors(page);
    const code = await chessdownRoom(page, opponent);
    await page.evaluate(async ([c, pieces]) => {
      const { socket } = await import('/chessdown/js/state.js');
      socket.emit('draftComplete', { roomCode: c, player: 1, color: 'blue', pieces });
    }, [code, KINGS[1]]);
    await expect.poll(() => cd(page, 'gameState')).toBe('gameplay');
    await expect(page.locator('#side-status')).toBeVisible(); // After the coin flip
    const starter = await cd(page, 'currentPlayer');

    await page.reload();
    await expect.poll(() => cd(page, 'gameState')).toBe('gameplay');
    await expect(page.locator('#side-status')).toBeVisible();
    await expect(page.locator('#coin-flip-screen')).toBeHidden();
    expect(await cd(page, 'currentPlayer')).toBe(starter);
    expect(await cd(page, 'myPlayerNumber')).toBe(1);
    const board = await cd(page, 'board');
    expect(board[11][4]).toMatchObject({ type: 'k', player: 1 });
    expect(board[0][3]).toMatchObject({ type: 'k', player: 2 });
    await expect(page.locator('#timer-text-overlay')).toHaveText(/^00:(0\d|10)$/);
    await expect.poll(() => seen(opponent)).toContain('opponentReconnected');

    // The server knows the new connection: a move goes through.
    if (starter === 1) {
      await page.evaluate(async (c) => {
        const { socket } = await import('/chessdown/js/state.js');
        socket.emit('makeMove', { roomCode: c, from: { r: 11, c: 4 }, to: { r: 11, c: 5 } });
      }, code);
      await expect.poll(() => cd(page, 'currentPlayer')).toBe(2);
    } else {
      await opponent.evaluate((c) => window.s.emit('makeMove', { roomCode: c, from: { r: 0, c: 3 }, to: { r: 0, c: 2 } }), code);
      await expect.poll(() => cd(page, 'currentPlayer')).toBe(1);
      expect((await cd(page, 'board'))[0][2]).toMatchObject({ type: 'k', player: 2 });
    }
    expect(errors).toEqual([]);
    for (const c of contexts) await c.close();
  });

  test("Ches'spell: in the middle of the game, the board and the hands come back", async ({ browser }) => {
    const { contexts, page, opponent, opponentName } = await pages(browser);
    const profiles = [{ id: 'guest1', name: 'Guest 1', avatar: '', stats: { played: 0, wins: 0 }, deck: [8, 12, 5] }];
    await contexts[0].addInitScript((p) => localStorage.setItem('spellChessProfiles', JSON.stringify(p)), profiles);
    const errors = trackPageErrors(page);
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Online Multiplayer' }).click();
    await page.locator('#online-p1-select').selectOption('guest1');
    await page.locator('#btn-create-room').click();
    await expect(page.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/);
    const code = await page.locator('#waiting-room-code').textContent();
    await opponent.goto('/chesspell/');
    await rawSocket(opponent, 'chesspell');
    await opponent.evaluate((c) => window.s.emit('joinRoom', {
      roomCode: c, deck: [1, 15, 14], profile: { id: 'x', name: 'Rival', avatar: '', stats: {} },
    }), code);
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    // White (this page) plays e2-e4.
    await page.evaluate(async (c) => {
      const { socket } = await import('/chesspell/js/state.js');
      socket.emit('makeMove', { roomCode: c, from: { r: 6, c: 4 }, to: { r: 4, c: 4 } });
    }, code);
    await expect.poll(() => page.evaluate(() => chesspell.engine.turn)).toBe('black');

    await page.reload();
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    const view = await page.evaluate(() => ({
      turn: chesspell.engine.turn, pawn: chesspell.engine.board[4][4], color: chesspell.session.myPlayerColor,
      p2: chesspell.match.p2Profile.name,
    }));
    expect(view).toEqual({ turn: 'black', pawn: 'P', color: 'white', p2: opponentName });
    await expect(page.locator('#player1-cards .in-game-card')).toHaveCount(3);
    await expect(page.locator('#player2-cards .in-game-card')).toHaveCount(3);
    await expect.poll(() => seen(opponent)).toContain('opponentReconnected');

    // Black answers: the reloaded page gets it.
    await opponent.evaluate((c) => window.s.emit('makeMove', { roomCode: c, from: { r: 1, c: 4 }, to: { r: 3, c: 4 } }), code);
    await expect.poll(() => page.evaluate(() => chesspell.engine.turn)).toBe('white');
    expect(errors).toEqual([]);
    for (const c of contexts) await c.close();
  });

  test('a seat that is gone: the page says so once, and forgets it', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/chessdown/');
    await page.evaluate(() => sessionStorage.setItem('pawnet.seat.chessdown', JSON.stringify({ roomCode: 'ABCDEF', token: 'A'.repeat(22) })));
    await page.reload();
    await answerDialog(page, 'Your game could not be resumed.');
    expect(await page.evaluate(() => sessionStorage.getItem('pawnet.seat.chessdown'))).toBeNull();
    await page.reload();
    await expect(page.locator('#main-menu')).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('leaving the game on purpose: a reload does not ask for the seat', async ({ browser }) => {
    const { contexts, page, opponent } = await pages(browser);
    await chessdownRoom(page, opponent);
    await page.locator('#btn-main-menu').dispatchEvent('pointerdown');
    expect(await page.evaluate(() => sessionStorage.getItem('pawnet.seat.chessdown'))).toBeNull();
    for (const c of contexts) await c.close();
  });

  test("Ches'spell: Quit Game asks, the opponent wins at once, and a reload does not come back", async ({ browser }) => {
    const { contexts, page, opponent } = await pages(browser);
    const errors = trackPageErrors(page);
    await chesspellGame(contexts, page, opponent);
    expect(await storedSeat(page, 'chesspell')).not.toBeNull();

    await page.getByRole('button', { name: 'Quit Game' }).click();
    await answerDialog(page, 'Quit this game? Your opponent wins.', 'Keep playing');
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    await page.getByRole('button', { name: 'Quit Game' }).click();
    await answerDialog(page, 'Quit this game? Your opponent wins.', 'Quit');
    await expect(page.locator('#main-menu')).toHaveClass(/active/);
    await expect.poll(() => seen(opponent)).toContain('opponentLeft');
    expect(await storedSeat(page, 'chesspell')).toBeNull();

    await page.reload();
    await expect(page.locator('#main-menu')).toHaveClass(/active/);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(errors).toEqual([]);
    for (const c of contexts) await c.close();
  });

  test("Ches'spell: once the game is over, a reload starts from the menu, without a false message", async ({ browser }) => {
    const { contexts, page, opponent } = await pages(browser);
    const errors = trackPageErrors(page);
    const code = await chesspellGame(contexts, page, opponent);
    await page.evaluate(async (c) => {
      const { socket } = await import('/chesspell/js/state.js');
      socket.emit('offerDraw', { roomCode: c });
    }, code);
    await expect.poll(() => seen(opponent)).toContain('drawOffered');
    await opponent.evaluate((c) => window.s.emit('answerDraw', { roomCode: c, accept: true }), code);
    await expect(page.locator('#game-over-modal')).toBeVisible();
    expect(await storedSeat(page, 'chesspell')).toBeNull();

    await page.reload();
    await expect(page.locator('#main-menu')).toHaveClass(/active/);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    expect(errors).toEqual([]);
    for (const c of contexts) await c.close();
  });

  test('a resume answered after the page started something else is left, not shown', async ({ browser }) => {
    const { contexts, page, opponent } = await pages(browser);
    const code = await chessdownRoom(page, opponent);
    // The old page still holds the seat: the reloaded one gets 'busy' and tries again, meanwhile
    // its player starts a game against the bot.
    const other = await contexts[0].newPage();
    await other.goto('/chessdown/');
    const seat = await storedSeat(page, 'chessdown');
    await other.evaluate((s) => sessionStorage.setItem('pawnet.seat.chessdown', s), seat);
    await other.reload();
    await other.evaluate(() => { chessdown.state.gameState = 'gameplay'; chessdown.state.isBotMatch = true; });
    await page.close(); // The seat is free now: the next try gets it back, too late
    // Given back on the server, then left at once: the opponent wins.
    await expect.poll(() => seen(opponent), { timeout: 10_000 }).toContain('opponentLeft');
    expect(await seen(opponent)).toContain('opponentReconnected');
    expect(await other.evaluate(() => chessdown.state.currentRoomCode)).toBeNull();
    expect(code).toMatch(/^[A-Z]{6}$/);
    for (const c of contexts) await c.close();
  });
});
