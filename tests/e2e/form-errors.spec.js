// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { blockExternalRequests, signUp } = require('./helpers');

// Form mistakes are told under their field (assets/js/field-error.js), not in a dialog:
// the field is marked invalid, described by the message, and has the focus back.

/** The field shows `message` as its error, and has the focus. */
async function expectFieldError(page, field, message) {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(field).toHaveAccessibleDescription(message);
  await expect(field).toBeFocused();
  await expect(page.getByRole('alert')).toHaveText(message);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
}

test.describe('Form errors', () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
    page.on('dialog', (d) => { throw new Error(`Browser dialog opened: ${d.message()}`); });
  });

  test('Chessdown: a wrong room code, under the field; typing clears it', async ({ page }) => {
    await signUp(page.context()); // The online controls are for accounts
    await page.goto('/chessdown/');
    const field = page.getByRole('textbox', { name: 'Room code (6 letters)' });
    await field.fill('AB1');
    await page.locator('#btn-join-room').click();
    await expectFieldError(page, field, 'Enter the 6-letter code of the room.');
    await page.keyboard.type('C');
    await expect(field).not.toHaveAttribute('aria-invalid');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(field).toHaveAccessibleDescription('');
  });

  test("Ches'spell: no username, no deck, a wrong code; the screens pass axe", async ({ page }) => {
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Profiles' }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const name = page.getByRole('textbox', { name: 'Username' });
    await expectFieldError(page, name, 'Enter a username.');
    const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
    let { violations } = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);
    await name.fill('Ann');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);

    // Signed in, neither the account nor Ann has a deck yet: told under the profile list.
    await signUp(page.context());
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Online Multiplayer' }).click();
    const select = page.locator('#online-p1-select');
    await page.locator('#btn-create-room').click();
    await expectFieldError(page, select, 'Choose a profile with a deck of three cards (build it in the Deck Builder).');
    ({ violations } = await new AxeBuilder({ page }).withTags(tags).analyze());
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  test("Ches'spell: a wrong room code, under the field", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('spellChessProfiles', JSON.stringify([
      { id: 'guest1', name: 'Guest 1', avatar: '', stats: { played: 0, wins: 0 }, deck: [8, 12, 5] },
    ])));
    await signUp(page.context());
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Online Multiplayer' }).click();
    await page.locator('#online-p1-select').selectOption('guest1'); // A profile with a deck
    const field = page.getByRole('textbox', { name: 'Room code (6 letters)' });
    await field.fill('ABC');
    await page.locator('#btn-join-room').click();
    await expectFieldError(page, field, 'Enter the 6-letter code of the room.');
  });
});
