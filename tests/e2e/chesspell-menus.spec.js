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

    await page.getByRole('button', { name: 'Timer', exact: true }).click();
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
    await page.getByRole('button', { name: 'Timer', exact: true }).click();
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
    await expect(page.locator('#deck-profile-select option:checked')).toHaveText('Ana');
    const save = page.locator('#save-deck-btn');
    await expect(save).toBeDisabled();
    const unlocked = page.locator('#deck-grid .spell-card:not(.locked)');
    for (let i = 0; i < 3; i++) await unlocked.nth(i).click();
    await save.click();
    await expect(page.locator('#deck-status')).toHaveText('Deck saved for Ana, on this device.');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Manage Profiles' }).click();
    await expect(card).toContainText('Deck: Ready');
    expect(errors).toEqual([]);
  });

  test('deck builder: shows the saved deck of each profile and changes it', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.addInitScript(() => localStorage.setItem('spellChessProfiles', JSON.stringify([
      { id: 'a', name: 'Ana', avatar: '', stats: { played: 0, wins: 0 }, deck: [1, 5, 8] },
      { id: 'b', name: 'Bo', avatar: '', stats: { played: 0, wins: 0 }, deck: [9, 11, 12] },
    ])));
    await page.goto('/chesspell/');
    await page.getByRole('button', { name: 'Deck Builder' }).click();

    // From the menu: the first profile's deck, in the slots and glowing in the grid.
    const slots = page.locator('#deck-slots li');
    await expect(page.locator('#deck-profile-select option:checked')).toHaveText('Ana');
    await expect(slots).toHaveText([/Cannibalism/, /Ghost/, /Wall/]);
    await expect(page.locator('#deck-grid .spell-card.selected')).toHaveCount(3);
    await expect(page.locator('#deck-grid .spell-card[data-id="8"] .card-main')).toHaveAttribute('aria-pressed', 'true');

    // Another profile: its own deck.
    await page.locator('#deck-profile-select').selectOption('b');
    await expect(slots).toHaveText([/Revive/, /Shield/, /Leap Frog/]);

    // A slot takes its card out; the deck cannot be saved short of three cards.
    await page.getByRole('button', { name: 'Remove Shield from the deck' }).click();
    await expect(slots).toHaveText([/Revive/, /Leap Frog/, 'Empty slot']);
    await expect(page.locator('#save-deck-btn')).toBeDisabled();
    // A full deck: one more card is refused, with a message.
    await page.locator('#deck-grid .spell-card[data-id="1"]').click();
    await page.locator('#deck-grid .spell-card[data-id="5"]').click();
    await expect(page.locator('#deck-status')).toContainText('Your deck is full');
    await expect(slots).toHaveText([/Revive/, /Leap Frog/, /Cannibalism/]);
    await page.locator('#save-deck-btn').click();

    const decks = await page.evaluate(() => JSON.parse(localStorage.getItem('spellChessProfiles') || '[]').map((p) => p.deck));
    expect(decks).toEqual([[1, 5, 8], [9, 12, 1]]);
    expect(errors).toEqual([]);
  });
});
