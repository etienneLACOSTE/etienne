// @ts-check
const { test, expect } = require('@playwright/test');
const { answerDialog, blockExternalRequests } = require('./helpers');

// In-page dialogs (assets/js/dialog.js), instead of the browser's alert() and confirm().

/** Open a dialog from the page without waiting for its answer; the answer lands in window.answer. */
const open = (page, kind, message, labels) => page.evaluate(([k, m, l]) => {
  window.answer = undefined;
  import('/assets/js/dialog.js').then((d) => d[k](m, l)).then((a) => { window.answer = a; });
}, [kind, message, labels]);
const answer = (page) => page.evaluate(() => window.answer);

test.describe('In-page dialogs', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
    page.on('dialog', (d) => { throw new Error(`Browser dialog opened: ${d.message()}`); });
  });

  test('Chessdown: a mistake is told in the page, and the focus comes back', async ({ page }) => {
    await page.goto('/chessdown/');
    const join = page.locator('#btn-join-room');
    await join.focus();
    await join.dispatchEvent('pointerdown'); // No code typed
    const dialog = page.getByRole('alertdialog', { name: 'Please enter a valid 6-letter code.' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(join).toBeFocused();
  });

  test("Ches'spell: a question, answered with the keyboard", async ({ page }) => {
    await page.goto('/chesspell/');
    await open(page, 'ask', 'Delete it?', { confirm: 'Delete' });
    const dialog = page.getByRole('alertdialog', { name: 'Delete it?' });
    // The focus starts on Cancel and stays inside the dialog.
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Delete' })).toBeFocused();
    await page.keyboard.press('Escape'); // Escape means no
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => answer(page)).toBe(false);

    await open(page, 'ask', 'Delete it?', { confirm: 'Delete' });
    await answerDialog(page, 'Delete it?', 'Delete');
    await expect.poll(() => answer(page)).toBe(true);
  });

  test('one dialog at a time, in order; text stays text', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const { notify } = await import('/assets/js/dialog.js');
      notify('First');
      notify('<img src=x onerror="window.hacked=1">');
    });
    await expect(page.getByRole('alertdialog')).toHaveCount(1);
    await answerDialog(page, 'First');
    await answerDialog(page, '<img src=x onerror="window.hacked=1">');
    expect(await page.evaluate(() => window.hacked)).toBeUndefined();
  });

  test('Ches\'spell: deleting a profile asks first', async ({ page }) => {
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Manage Profiles' }).click();
    await page.locator('#new-profile-name').fill('Temp');
    await page.locator('#profile-submit-btn').click();
    const row = page.locator('.profile-card', { hasText: 'Temp' });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await answerDialog(page, 'Are you sure you want to delete this profile?', 'Cancel');
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await answerDialog(page, 'Are you sure you want to delete this profile?', 'Delete');
    await expect(row).toHaveCount(0);
  });
});
