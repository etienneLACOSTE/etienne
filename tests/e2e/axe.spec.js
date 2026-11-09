// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { blockExternalRequests } = require('./helpers');

// Automated accessibility audit (axe-core) of every screen, against WCAG 2.2 A and AA.
// Complements keyboard.spec.js and a11y.spec.js, which test behaviour axe cannot see.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Run axe on the page and list violations as "rule: target (summary)". */
async function audit(page) {
  // Audit the settled screen: text in the middle of a fade-in has a lower contrast.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect && a.effect.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => {}))));
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} (${v.help})`));
}

/** @param {import('@playwright/test').Page} page */
const pointer = (page, selector) => page.locator(selector).dispatchEvent('pointerdown');

/** Chessdown screens, each reached from the main menu. */
const CHESSDOWN = {
  'main menu': async () => {},
  rules: async (page) => pointer(page, '#btn-how-to-play'),
  timer: async (page) => pointer(page, '#btn-show-timer'),
  campaign: async (page) => pointer(page, '#btn-start-bot'),
  draft: async (page) => {
    await pointer(page, '#btn-start-local');
    await pointer(page, '.shop-item[data-type="k"]');
    await pointer(page, '#chessboard .square[data-vr="5"][data-vc="4"]');
  },
  match: async (page) => {
    await CHESSDOWN.draft(page);
    await pointer(page, '#btn-validate-draft');
    await pointer(page, '#btn-ready');
    await pointer(page, '.shop-item[data-type="k"]');
    await pointer(page, '#chessboard .square[data-vr="5"][data-vc="4"]');
    await pointer(page, '#btn-validate-draft');
    await expect(page.locator('#side-status')).toBeVisible({ timeout: 15_000 });
  },
};

/** Ches'spell screens, each reached from the main menu. */
const CHESSPELL = {
  'main menu': async () => {},
  'deck builder': async (page) => page.getByRole('button', { name: 'Deck Builder' }).click(),
  'card index': async (page) => page.getByRole('button', { name: 'Card Index' }).click(),
  profiles: async (page) => page.getByRole('button', { name: 'Manage Profiles' }).click(),
  online: async (page) => page.getByRole('button', { name: 'Online Multiplayer' }).click(),
  timer: async (page) => page.getByRole('button', { name: 'Timer', exact: true }).click(),
  campaign: async (page) => {
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Campaign Mode' }).click();
  },
  'draft with a card dialog': async (page) => {
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Draft Mode' }).click();
    await page.locator('#draft-grid .spell-card[data-id="8"]').click();
    await expect(page.locator('#card-modal')).toBeVisible();
  },
  'spell info dialog': async (page) => {
    await page.getByRole('button', { name: 'Card Index' }).click();
    await page.locator('#index-grid .btn-info').first().click();
    await expect(page.locator('#info-modal')).toBeVisible();
  },
  match: async (page) => {
    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Draft Mode' }).click();
    for (const id of [8, 1, 2, 12, 5, 15]) {
      await page.locator(`#draft-grid .spell-card[data-id="${id}"]`).click();
      await page.locator('#modal-confirm').click();
    }
    await expect(page.locator('#game-board')).toHaveClass(/active/);
  },
  'end screen': async (page) => {
    await CHESSPELL.match(page);
    await page.evaluate(() => { // A white queen on e7 takes the black king
      chesspell.engine.board[1][4] = 'Q';
      chesspell.engine.move(1, 4, 0, 4);
    });
    await expect(page.locator('#game-over-modal')).toBeVisible();
  },
};

test.describe('axe audit', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  test('hub', async ({ page }) => {
    await page.goto('/');
    expect(await audit(page)).toEqual([]);
  });

  test('privacy', async ({ page }) => {
    await page.goto('/privacy/');
    expect(await audit(page)).toEqual([]);
  });

  test('account: signed out, with an error shown', async ({ page }) => {
    await page.goto('/account/');
    await page.locator('#login-form button[type="submit"]').click();
    await expect(page.locator('#login-error')).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  test('account: signed in, deletion open', async ({ page }) => {
    await page.goto('/account/');
    const name = `axe${Date.now() % 1e6}`;
    await page.getByLabel('Username', { exact: true }).fill(name);
    await page.getByLabel('Email', { exact: true }).fill(`${name}@example.com`);
    await page.locator('#signup-password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Create my account' }).click();
    await page.getByText('Delete my account', { exact: true }).click();
    await expect(page.locator('#delete-confirm')).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  for (const [name, open] of Object.entries(CHESSDOWN)) {
    test(`chessdown: ${name}`, async ({ page }) => {
      await page.goto('/chessdown/');
      await open(page);
      expect(await audit(page)).toEqual([]);
    });
  }

  for (const [name, open] of Object.entries(CHESSPELL)) {
    test(`ches'spell: ${name}`, async ({ page }) => {
      await page.goto('/chesspell/');
      await open(page);
      expect(await audit(page)).toEqual([]);
    });
  }
});
