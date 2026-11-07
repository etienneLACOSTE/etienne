// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { blockExternalRequests } = require('./helpers');

// Automated accessibility audit (axe-core) of every screen, against WCAG 2.2 A and AA.
// Complements keyboard.spec.js and a11y.spec.js, which test behaviour axe cannot see.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Run axe on the page and list violations as "rule: target (summary)". */
async function audit(page) {
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
};

test.describe('axe audit', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  test('hub', async ({ page }) => {
    await page.goto('/');
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
