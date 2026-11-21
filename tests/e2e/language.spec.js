// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { blockExternalRequests, chooseFormat, trackPageErrors } = require('./helpers');

// Chessdown in five languages (assets/js/i18n.js, games/chessdown/strings/): chosen in
// Settings, kept in this browser; without a choice, the browser's language when offered.

test.describe('Languages', () => {
  test.beforeEach(async ({ context }) => {
    await blockExternalRequests(context);
  });

  test('Settings: choose French, the page reloads in French and stays so; the timer is kept', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.getByRole('button', { name: 'Settings' }).click();
    const language = page.getByLabel('Language');
    await expect(language).toHaveValue('en');
    await expect(language.locator('option')).toHaveText(['English', 'Français', 'Español', 'Italiano', 'Deutsch']);
    const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
    const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(violations.map((v) => v.id)).toEqual([]);

    await page.getByRole('button', { name: 'Overall Time' }).click();
    await page.getByLabel('Minutes').fill('3');
    await page.getByLabel('Seconds').fill('0');
    await language.selectOption('fr');
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Save' }).click()]);

    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { name: 'Prêt pour le grand match ?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Partie rapide (contre le bot)' })).toBeVisible();
    await expect(page.locator('#status-bar')).toHaveText('Bienvenue sur Chessdown');
    await expect(page.locator('#online-gate')).toHaveText("Connecte-toi pour jouer en ligne. Sans compte, la campagne t'est ouverte.");
    await expect(page).toHaveTitle('Chessdown - Échecs x football américain');

    // Kept after a reload, with the timer chosen before.
    await page.reload();
    await page.getByRole('button', { name: 'Réglages' }).click();
    await expect(page.getByLabel('Langue')).toHaveValue('fr');
    await expect(page.getByRole('button', { name: 'Temps total' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Minutes')).toHaveValue('3');
    expect(await page.evaluate(() => chessdown.state.chosenTimer)).toEqual({ mode: 'overall', seconds: 180 });
    expect(errors).toEqual([]);
  });

  for (const [lang, title, local] of [
    ['es', '¿Listo para el gran partido?', 'Jugar en local (2 jugadores)'],
    ['it', 'Pronto per la grande partita?', 'Gioca in locale (2 giocatori)'],
    ['de', 'Bereit für das große Spiel?', 'Lokal spielen (2 Spieler)'],
  ]) {
    test(`without a choice, a browser in "${lang}" gets the menu in its language`, async ({ browser }) => {
      const context = await browser.newContext({ locale: lang });
      await blockExternalRequests(context);
      const page = await context.newPage();
      await page.goto('/chessdown/');
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
      await expect(page.getByRole('button', { name: local })).toBeVisible();
      await context.close();
    });
  }

  test('in French, a local game: the draft, the board and the screen reader speak French', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pawnet.language', 'fr'));
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'Jouer en local (2 joueurs)' }).dispatchEvent('pointerdown');
    await chooseFormat(page);
    await expect(page.locator('#status-bar')).toHaveText(/^Draft : (joueur 1|compose ton armée !)$/);
    await expect(page.getByRole('button', { name: 'Acheter : Roi, 0 points' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Terrain' })).toBeVisible();
    await expect(page.locator('#btn-validate-draft')).toHaveText("Valider l'équipe");
    // Other pages of the site stay in English for now.
    await page.goto('/chesspell/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'Online Multiplayer' })).toBeVisible();
  });

  test('a server message is shown in the language of the page', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pawnet.language', 'de'));
    await page.goto('/chessdown/');
    await page.evaluate(async () => {
      const { serverText } = await import('/assets/js/i18n.js');
      const { notify } = await import('/assets/js/dialog.js');
      notify(serverText('Room not found.'));
    });
    const dialog = page.getByRole('alertdialog', { name: 'Raum nicht gefunden.' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeVisible();
  });
});
