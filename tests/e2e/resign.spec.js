// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, chooseFormat, signedInContext, trackPageErrors } = require('./helpers');

// Resign (js/resign.js): during a game, the header's button; in a best of 3, this game or
// the whole match. Online, the server gives the game to the other side.

const square = (page, vr, vc) => page.locator(`#chessboard .square[data-vr="${vr}"][data-vc="${vc}"]`);
async function place(page, type, vr, vc) {
  await page.locator(`.shop-item[data-type="${type}"]`).click();
  await square(page, vr, vc).click();
  await expect(square(page, vr, vc)).toHaveClass(/has-piece/);
}

test.describe('Resign', () => {
  test.beforeEach(async ({ context }) => {
    await blockExternalRequests(context);
  });

  test('against the bot: this game, then the whole match', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');
    const resign = page.getByRole('button', { name: 'Resign' });
    await expect(resign).toBeHidden(); // Not in the menu
    await page.locator('#btn-start-bot').dispatchEvent('pointerdown');
    await page.locator('#btn-confirm-campaign').dispatchEvent('pointerdown');
    await place(page, 'k', 5, 4);
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(resign).toBeVisible({ timeout: 15_000 });

    // A question: keep playing changes nothing
    await resign.click();
    const question = page.getByRole('alertdialog', { name: 'Resign this game, or the whole match?' });
    await question.getByRole('button', { name: 'Keep playing' }).click();
    expect(await page.evaluate(() => chessdown.state.gameState)).toBe('gameplay');

    await resign.click();
    await question.getByRole('button', { name: 'This game' }).click();
    await expect(page.locator('#victory-reason')).toHaveText('You resigned.');
    await expect(page.locator('#victory-series')).toHaveText('Series after game 1: 0–1.');
    await expect(page.locator('#btn-restart')).toHaveText('Next game');
    await expect(resign).toBeHidden();

    await page.locator('#btn-restart').dispatchEvent('pointerdown');
    await expect(page.locator('#victory-screen')).toBeHidden();
    await place(page, 'k', 5, 4);
    await page.locator('#btn-validate-draft').dispatchEvent('pointerdown');
    await expect(resign).toBeVisible({ timeout: 15_000 });
    await resign.click();
    await question.getByRole('button', { name: 'The whole match' }).click();
    await expect(page.locator('#victory-screen')).toBeVisible();
    await expect(page.locator('#victory-reason')).toHaveText('You resigned.');
    await expect.poll(() => page.evaluate(() => [chessdown.state.series.over, chessdown.state.series.winner])).toEqual([true, 2]);
    await expect(page.locator('#btn-restart')).toHaveText('New match');
    expect(errors).toEqual([]);
  });

  test('a single game: a yes or no; on the same screen, the player to move resigns', async ({ page }) => {
    await page.goto('/chessdown/');
    await page.locator('#btn-start-local').click();
    await chooseFormat(page, 'single');
    await place(page, 'k', 5, 4);
    await page.locator('#btn-validate-draft').click();
    await page.locator('#btn-ready').click();
    await place(page, 'k', 5, 4);
    await page.locator('#btn-validate-draft').click();
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
    const mover = await page.evaluate(() => chessdown.state.currentPlayer);
    await page.getByRole('button', { name: 'Resign' }).click();
    await page.getByRole('alertdialog', { name: 'Resign the game?' }).getByRole('button', { name: 'Resign' }).click();
    await expect(page.locator('#victory-reason')).toHaveText(`Player ${mover} resigned.`);
  });

  test('online: a game resigned goes to the other side, the series goes on', async ({ browser }) => {
    const ctx1 = (await signedInContext(browser)).context;
    const ctx2 = (await signedInContext(browser)).context;
    const [p1, p2] = [await ctx1.newPage(), await ctx2.newPage()];
    await p1.goto('/chessdown/');
    await p2.goto('/chessdown/');
    await p1.locator('#btn-create-room').click();
    await chooseFormat(p1, 'bo3');
    await expect(p1.locator('#waiting-room-code')).toHaveText(/^[A-Z]{6}$/);
    await p2.locator('#room-code-input').fill((await p1.locator('#waiting-room-code').textContent()) ?? '');
    await p2.locator('#btn-join-room').click();
    for (const page of [p1, p2]) {
      await place(page, 'k', 5, 4);
      await page.locator('#btn-validate-draft').click();
    }
    await expect(p1.getByRole('button', { name: 'Resign' })).toBeVisible({ timeout: 15_000 });
    await p1.getByRole('button', { name: 'Resign' }).click();
    await p1.getByRole('alertdialog', { name: 'Resign this game, or the whole match?' }).getByRole('button', { name: 'This game' }).click();
    await expect(p1.locator('#victory-reason')).toHaveText('You resigned.');
    await expect(p2.locator('#victory-reason')).toContainText('resigned.');
    await expect(p2.locator('#victory-title')).toHaveText('Victory!');
    await expect(p2.locator('#victory-series')).toHaveText('Series after game 1: 1–0.'); // Their side first
    await ctx1.close();
    await ctx2.close();
  });
});

test('during the draft against the bot: resign the match before it starts', async ({ page }) => {
  await blockExternalRequests(page);
  await page.goto('/chessdown/');
  await page.locator('#btn-start-bot').dispatchEvent('pointerdown');
  await page.locator('#btn-confirm-campaign').dispatchEvent('pointerdown');
  const resign = page.getByRole('button', { name: 'Resign' });
  await expect(resign).toBeVisible(); // In the draft already
  await resign.click();
  await page.getByRole('alertdialog', { name: 'Resign the match before it starts?' }).getByRole('button', { name: 'Resign' }).click();
  await expect(page.locator('#victory-screen')).toBeVisible();
  await expect(page.locator('#victory-reason')).toHaveText('You resigned.');
  await expect(page.locator('#draft-footer')).toBeHidden();
  await expect.poll(() => page.evaluate(() => [chessdown.state.series.over, chessdown.state.series.winner])).toEqual([true, 2]);
});
