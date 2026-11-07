// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests } = require('./helpers');

// Player names come from other players (online) or from the user (local profiles):
// they must be shown as text, never interpreted as HTML.

const EVIL_NAME = '<b id=pwn>x</b>'; // 15 chars: survives the server's length limit

/** @param {import('@playwright/test').BrowserContext} ctx */
async function seed(ctx, name, deck) {
  await blockExternalRequests(ctx);
  await ctx.addInitScript(([n, d]) => {
    localStorage.setItem('spellChessProfiles', JSON.stringify([
      { id: 'me', name: n, avatar: '', stats: { played: 0, wins: 0 }, deck: d },
    ]));
  }, [name, deck]);
}

test.describe('XSS', () => {
  test("ches'spell: an opponent's name is displayed as text", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    await seed(ctx1, EVIL_NAME, [8, 12, 5]);
    await seed(ctx2, 'Victim', [1, 15, 14]);
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();
    for (const page of [p1, p2]) {
      await page.goto('/chesspell/');
      await page.getByRole('button', { name: 'Online Multiplayer' }).click();
    }
    await p1.locator('#btn-create-room').click();
    const codeEl = p1.locator('#waiting-room-code');
    await expect(codeEl).not.toHaveText('XXXX');
    await p2.locator('#room-code-input').fill((await codeEl.textContent()) ?? '');
    await p2.locator('#btn-join-room').click();

    await expect(p2.locator('#game-board')).toHaveClass(/active/);
    await expect(p2.locator('#player1-banner .player-name')).toHaveText(EVIL_NAME);
    await expect(p2.locator('#pwn')).toHaveCount(0);
    await ctx1.close();
    await ctx2.close();
  });

  test("ches'spell: local profile names are displayed as text", async ({ browser }) => {
    const ctx = await browser.newContext();
    await seed(ctx, EVIL_NAME, [8, 12, 5]);
    const page = await ctx.newPage();
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Manage Profiles' }).click();
    await expect(page.locator('.profile-card .player-name')).toHaveText(EVIL_NAME);
    await expect(page.locator('#pwn')).toHaveCount(0);
    await ctx.close();
  });
});
