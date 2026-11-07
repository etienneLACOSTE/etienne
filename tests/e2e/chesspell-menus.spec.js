// @ts-check
const { test, expect } = require('@playwright/test');
const { blockExternalRequests, trackPageErrors } = require('./helpers');

// Every menu button of Ches'spell: navigation, timer, profiles, deck builder, campaign setup.

test.describe("Ches'spell menus", () => {
  test.beforeEach(async ({ page }) => {
    await blockExternalRequests(page);
  });

  const active = (page) => page.locator('.screen.active');

  test('navigation, timer and campaign options', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chesspell/');

    for (const [label, screen, back] of [
      ['Card Index', 'card-index', 'Back to Menu'],
      ['Deck Builder', 'deck-builder', 'Back'],
      ['Manage Profiles', 'profiles-screen', 'Back'],
      ['Online Multiplayer', 'online-screen', 'Back'],
    ]) {
      await page.getByRole('button', { name: label }).click();
      await expect(active(page)).toHaveId(screen);
      await active(page).getByRole('button', { name: back, exact: true }).click();
      await expect(active(page)).toHaveId('main-menu');
    }

    await page.getByRole('button', { name: '⚙️ Timer' }).click();
    await expect(active(page)).toHaveId('timer-modal');
    await page.getByRole('button', { name: 'Overall Time' }).click();
    await expect(page.locator('#timer-desc-overall')).not.toHaveClass(/hidden/);
    await expect(page.locator('#timer-desc-turn')).toHaveClass(/hidden/);
    await page.getByRole('button', { name: 'Turn Time' }).click();
    await expect(page.locator('#timer-desc-turn')).not.toHaveClass(/hidden/);
    await expect(page.locator('#timer-desc-overall')).toHaveClass(/hidden/);
    await page.getByRole('button', { name: 'Save Options' }).click();
    await expect(active(page)).toHaveId('main-menu');

    await page.getByRole('button', { name: 'Local Game' }).click();
    await page.getByRole('button', { name: 'Play Campaign Mode' }).click();
    await expect(active(page)).toHaveId('difficulty-modal');
    await page.locator('#bot-elo-slider').fill('2000');
    await expect(page.locator('#elo-display')).toHaveText('2000 ELO');
    await page.locator('.btn-archetype[data-deck="aggressive"]').click();
    await expect(page.locator('.btn-archetype[data-deck="aggressive"]')).toHaveClass(/selected/);
    await expect(page.locator('.btn-archetype[data-deck="random"]')).not.toHaveClass(/selected/);
    await active(page).getByRole('button', { name: 'Back', exact: true }).click();
    await expect(active(page)).toHaveId('player-select-screen');
    expect(errors).toEqual([]);
  });

  // Regression test: style.css had no generic `.hidden` rule, so both timer
  // descriptions stayed visible whatever the mode.
  test('timer modal shows only the selected mode description', async ({ page }) => {
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: '⚙️ Timer' }).click();
    await page.getByRole('button', { name: 'Overall Time' }).click();
    await expect(page.locator('#timer-desc-turn')).toBeHidden();
    await expect(page.locator('#timer-desc-overall')).toBeVisible();
  });

  test('profiles: create, edit/cancel, build and save a deck', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Manage Profiles' }).click();

    await page.locator('#new-profile-name').fill('Ana');
    await page.locator('#profile-submit-btn').click();
    const card = page.locator('.profile-card', { hasText: 'Ana' });
    await expect(card).toBeVisible();

    await card.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('#profile-form-title')).toHaveText('Edit Profile');
    await page.locator('#profile-cancel-btn').click();
    await expect(page.locator('#profile-form-title')).toHaveText('Create New Profile');

    await card.getByRole('button', { name: 'Build Deck' }).click();
    await expect(active(page)).toHaveId('deck-builder');
    const unlocked = page.locator('#deck-grid .spell-card:not(.locked)');
    for (let i = 0; i < 3; i++) await unlocked.nth(i).click();
    // The alert opens during the click itself, so answer it from a handler set beforehand.
    let message = '';
    page.once('dialog', async (dialog) => { message = dialog.message(); await dialog.accept(); });
    await page.locator('#save-deck-btn').click();
    await expect.poll(() => message).toBe('Deck saved for Ana!');
    await expect(active(page)).toHaveId('profiles-screen');
    await expect(card).toContainText('Deck: Ready');
    expect(errors).toEqual([]);
  });
});
