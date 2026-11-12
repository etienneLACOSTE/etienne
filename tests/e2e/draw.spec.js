// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { answerDialog, blockExternalRequests, trackPageErrors } = require('./helpers');

// Draw by agreement: online (the server keeps the offers, server/socket-utils.js
// drawOffers) and on the same screen (a dialog for the other player).

const ORIGIN = 'http://127.0.0.1:3100';
const KINGS = { 1: [{ r: 11, c: 4, type: 'k' }], 2: [{ r: 0, c: 3, type: 'k' }] };

async function signedInContext(browser) {
  const context = await browser.newContext();
  await blockExternalRequests(context);
  const name = `d${Date.now() % 1e7}${Math.floor(Math.random() * 1000)}`;
  const res = await context.request.post('/api/auth/signup', {
    headers: { origin: ORIGIN },
    data: { username: name, email: `${name}@example.com`, password: 'correct horse battery' },
  });
  expect(res.ok()).toBe(true);
  return { context, name };
}

/** A raw connection to /chessdown in `page`, every event it gets in window.seen. */
const rawSocket = (page) => page.evaluate(() => {
  window.s = io('/chessdown', { forceNew: true });
  window.seen = [];
  window.s.onAny((event, data) => window.seen.push([event, data]));
});
const seen = (page) => page.evaluate(() => window.seen.map(([e]) => e));

/** The Chessdown page creates a room, a raw connection joins, both send a kings-only draft. */
async function chessdownOnline(page, opponent) {
  await page.goto('/chessdown/');
  await page.locator('#btn-create-room').dispatchEvent('pointerdown');
  await expect(page.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/);
  const code = await page.locator('#waiting-room-code').textContent();
  await opponent.goto('/chessdown/');
  await rawSocket(opponent);
  await opponent.evaluate(([c, pieces]) => {
    window.s.once('gameStarted', () => window.s.emit('draftComplete', { roomCode: c, player: 2, color: 'red', pieces }));
    window.s.emit('joinRoom', c);
  }, [code, KINGS[2]]);
  await expect.poll(() => page.evaluate(() => chessdown.state.gameState)).toBe('draft1');
  await page.evaluate(async ([c, pieces]) => {
    const { socket } = await import('/chessdown/js/state.js');
    socket.emit('draftComplete', { roomCode: c, player: 1, color: 'blue', pieces });
  }, [code, KINGS[1]]);
  await expect.poll(() => page.evaluate(() => chessdown.state.gameState)).toBe('gameplay');
  return code;
}

test.describe('Draw by agreement', () => {
  test('Chessdown online: an offer declined, then one accepted; the draw counts for both', async ({ browser }) => {
    const a = await signedInContext(browser);
    const b = await signedInContext(browser);
    const page = await a.context.newPage();
    const opponent = await b.context.newPage();
    const errors = trackPageErrors(page);
    const code = await chessdownOnline(page, opponent);
    const offer = page.getByRole('button', { name: 'Offer draw' });
    await expect(offer).toBeVisible();

    // The opponent offers: a bar with Accept and Decline, which does not take the focus.
    await opponent.evaluate((c) => window.s.emit('offerDraw', { roomCode: c }), code);
    const bar = page.getByRole('group', { name: 'Draw offer' });
    await expect(bar.getByRole('status')).toHaveText('Your opponent offers a draw.');
    await expect(offer).toBeDisabled(); // One offer at a time
    const { violations } = await new AxeBuilder({ page }).include('.draw-offer').include('header')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    await bar.getByRole('button', { name: 'Decline' }).click();
    await expect(bar).toHaveCount(0);
    await expect.poll(() => opponent.evaluate(() => window.seen.filter(([e]) => e === 'drawOfferEnded'))).toEqual([['drawOfferEnded', { reason: 'declined' }]]);

    // This page offers: the opponent accepts.
    await expect(offer).toBeEnabled();
    await offer.click();
    await expect(page.getByRole('button', { name: 'Draw offered' })).toBeDisabled();
    await expect(bar.getByRole('status')).toHaveText('Draw offered. Waiting for your opponent…');
    await expect.poll(() => seen(opponent)).toContain('drawOffered');
    await opponent.evaluate((c) => window.s.emit('answerDraw', { roomCode: c, accept: true }), code);
    await expect(page.locator('#victory-title')).toHaveText('DRAW');
    await expect(page.locator('#victory-reason')).toHaveText('by agreement');
    await expect(bar).toHaveCount(0);
    await expect(offer).toBeHidden();

    const recent = async (ctx) => (await (await ctx.request.get('/api/account/stats')).json()).recent[0];
    for (const [ctx, other] of [[a.context, b.name], [b.context, a.name]]) {
      await expect.poll(() => recent(ctx)).toMatchObject({ result: 'draw', reason: 'agreement', opponent: other });
    }
    expect(errors).toEqual([]);
    await a.context.close();
    await b.context.close();
  });

  test('Chessdown online: a move by the other player ends the offer; once per turn played', async ({ browser }) => {
    const ctx = await browser.newContext();
    const other = await browser.newContext();
    for (const c of [ctx, other]) await blockExternalRequests(c);
    const page = await ctx.newPage();
    const opponent = await other.newPage();
    const code = await chessdownOnline(page, opponent);
    const offer = page.getByRole('button', { name: /^(Offer draw|Draw offered)$/ });
    await offer.click();
    await expect.poll(() => seen(opponent)).toContain('drawOffered');

    // The opponent plays instead of answering: the offer ends, and a new one is allowed.
    const starter = await page.evaluate(() => chessdown.state.currentPlayer);
    const moves = { 1: [{ r: 11, c: 4 }, { r: 11, c: 5 }], 2: [{ r: 0, c: 3 }, { r: 0, c: 2 }] };
    const play = async (player) => {
      if (player === 2) {
        await opponent.evaluate(([c, [f, t]]) => window.s.emit('makeMove', { roomCode: c, from: f, to: t }), [code, moves[2]]);
      } else {
        await page.evaluate(async ([c, [f, t]]) => (await import('/chessdown/js/state.js')).socket.emit('makeMove', { roomCode: c, from: f, to: t }), [code, moves[1]]);
      }
      await expect.poll(() => page.evaluate(() => chessdown.state.currentPlayer)).toBe(player === 1 ? 2 : 1);
    };
    if (starter === 1) await play(1); // The page plays first: the offer stands
    await expect(offer).toHaveText('Draw offered');
    await play(2);
    await expect.poll(() => seen(opponent)).toContain('moveMade');
    await expect.poll(() => seen(opponent)).toContain('drawOfferEnded');
    await expect(offer).toHaveText('Offer draw');
    await expect(offer).toBeEnabled();
    await ctx.close();
    await other.close();
  });

  test('Chessdown on the same screen: the other player accepts in a dialog', async ({ page }) => {
    await blockExternalRequests(page);
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');
    const pointer = (selector) => page.locator(selector).dispatchEvent('pointerdown');
    await pointer('#btn-start-local');
    for (let i = 0; i < 2; i++) {
      if (i) await pointer('#btn-ready');
      await pointer('.shop-item[data-type="k"]');
      await pointer('#chessboard .square[data-vr="5"][data-vc="4"]');
      await pointer('#btn-validate-draft');
    }
    const offer = page.getByRole('button', { name: 'Offer draw' });
    await expect(offer).toBeVisible({ timeout: 15_000 });
    const mover = await page.evaluate(() => chessdown.state.currentPlayer);
    await offer.click();
    const question = `Player ${mover} offers a draw. Player ${mover === 1 ? 2 : 1}, do you accept?`;
    await answerDialog(page, question, 'Decline');
    await expect(page.locator('#victory-screen')).toBeHidden();
    await offer.click();
    await answerDialog(page, question, 'Accept');
    await expect(page.locator('#victory-title')).toHaveText('DRAW');
    await expect(page.locator('#victory-reason')).toHaveText('by agreement');
    expect(errors).toEqual([]);
  });

  test('Chessdown against the bot: no draw offer', async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/chessdown/');
    await page.locator('#btn-start-bot').dispatchEvent('pointerdown');
    await page.locator('#btn-confirm-campaign').dispatchEvent('pointerdown');
    await expect.poll(() => page.evaluate(() => chessdown.state.gameState)).toBe('draft1');
    await expect(page.locator('#btn-offer-draw')).toBeHidden();
  });

  test("Ches'spell online: an offer accepted on the other page ends the game as a draw", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const profiles = [
      { id: 'guest1', name: 'Guest 1', avatar: '', stats: { played: 0, wins: 0 }, deck: [8, 12, 5] },
      { id: 'guest2', name: 'Guest 2', avatar: '', stats: { played: 0, wins: 0 }, deck: [1, 15, 14] },
    ];
    for (const ctx of [ctx1, ctx2]) {
      await blockExternalRequests(ctx);
      await ctx.addInitScript((p) => localStorage.setItem('spellChessProfiles', JSON.stringify(p)), profiles);
    }
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    const errors = [p1, p2].map(trackPageErrors);
    for (const page of [p1, p2]) {
      await page.goto('/chesspell/');
      await page.getByRole('button', { name: 'Online Multiplayer' }).click();
    }
    await p2.locator('#online-p1-select').selectOption('guest2');
    await p1.locator('#btn-create-room').click();
    const codeEl = p1.locator('#waiting-room-code');
    await expect(codeEl).toHaveText(/^[A-Z]{6}$/);
    await p2.locator('#room-code-input').fill((await codeEl.textContent()) ?? '');
    await p2.locator('#btn-join-room').click();
    await expect(p2.locator('#game-board')).toHaveClass(/active/);

    await p1.getByRole('button', { name: 'Offer draw' }).click();
    const bar = p2.getByRole('group', { name: 'Draw offer' });
    await expect(bar.getByRole('status')).toHaveText('Your opponent offers a draw.');
    await bar.getByRole('button', { name: 'Accept' }).click();
    for (const page of [p1, p2]) {
      const end = page.getByRole('dialog', { name: 'Draw' });
      await expect(end).toBeVisible();
      await expect(end).toContainText('Both players agreed to a draw.');
      await expect(page.getByRole('button', { name: /draw/i })).toBeHidden();
      expect(await page.evaluate(() => chesspell.engine.winner)).toBe('Draw');
    }
    expect(errors.flat()).toEqual([]);
    await ctx1.close();
    await ctx2.close();
  });

  test("Ches'spell on the same screen: offer, decline, then accept", async ({ page }) => {
    await blockExternalRequests(page);
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Draft Mode' }).click();
    for (const id of [8, 1, 2, 12, 5, 15]) {
      await page.locator(`#draft-grid .spell-card[data-id="${id}"]`).click();
      await page.locator('#modal-confirm').click();
    }
    await expect(page.locator('#game-board')).toHaveClass(/active/);
    const offer = page.getByRole('button', { name: 'Offer draw' });
    await offer.click();
    await answerDialog(page, 'White offers a draw. Black, do you accept?', 'Decline');
    await expect(page.locator('#game-over-modal')).toBeHidden();
    await offer.click();
    await answerDialog(page, 'White offers a draw. Black, do you accept?', 'Accept');
    const end = page.getByRole('dialog', { name: 'Draw' });
    await expect(end).toBeVisible();
    await expect(end.getByRole('button', { name: 'Rematch' })).toBeVisible();
    await expect(offer).toBeHidden();
  });
});
