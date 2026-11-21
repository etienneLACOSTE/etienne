// @ts-check
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { answerDialog, blockExternalRequests, trackPageErrors } = require('./helpers');

// All Star: Gérard Mallet, commissioner of the League, names the coach and registers the
// club (js/club-onboarding.js); the club's page shows its register (js/club-view.js).

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const axe = async (page) => (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => v.id);

test.describe('All Star club', () => {
  test.beforeEach(async ({ context }) => {
    await blockExternalRequests(context);
  });

  test('the commissioner registers a club, step by step; the club page keeps it', async ({ page }) => {
    const errors = trackPageErrors(page);
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    const said = page.locator('#commissioner-said');
    await expect(said).toContainText("what's your name?");
    expect(await axe(page)).toEqual([]);

    // 1. Name: too short is refused, under the field.
    const coach = page.getByLabel('Your coach name');
    await coach.fill('E');
    await page.getByRole('button', { name: "That's me" }).click();
    await expect(page.locator('#club-coach-error')).toHaveText('From 2 to 24 characters.');
    await expect(coach).toHaveAttribute('aria-invalid', 'true');
    await coach.fill('  Etienne  ');
    await coach.press('Enter');

    // 2. Licence, signed.
    await expect(said).toContainText('Etienne… That has a nice ring to it.');
    await expect(page.locator('.club-who')).toHaveText('Etienne');
    await page.getByRole('button', { name: 'Sign the licence' }).click();

    // 3. The club's name (an example fills the field).
    const clubName = page.getByLabel('Club name');
    await expect(clubName).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Racing Rook' }).click();
    await expect(clubName).toHaveValue('Racing Rook');
    await clubName.fill('Olympique Cavalier');
    await page.getByRole('button', { name: 'Register this name' }).click();

    // 4. Colours: any shade; two colours too close are refused.
    await expect(said).toContainText('Olympique Cavalier! I like it.');
    expect(await axe(page)).toEqual([]); // Before any click: buttons fade their colours when pressed
    await page.locator('#club-primary').fill('#123456');
    await page.locator('#club-secondary').fill('#123457');
    await expect(page.locator('#club-colour-error')).toHaveText('These two colours look too alike: the pattern would not show.');
    await page.getByRole('group', { name: 'Colour 2: shortcuts' }).getByRole('button', { name: 'yellow' }).click();
    await expect(page.locator('#club-secondary-name')).toHaveText('yellow');
    await expect(page.locator('#club-primary-name')).toHaveText(/^close to /);
    await page.getByRole('button', { name: 'Chevron' }).click();
    await expect(page.getByRole('button', { name: 'Chevron' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('img', { name: /^Jersey: Chevron,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm the colours' }).click();

    // 5. Crest: a diamond with an eagle, and the club's initials.
    await expect(said).toContainText('Last touch: the crest.');
    expect(await axe(page)).toEqual([]);
    await page.getByRole('button', { name: 'Diamond' }).click();
    await page.getByRole('button', { name: 'Eagle' }).click();
    await expect(page.getByRole('img', { name: /^Crest: Diamond, Eagle, initials OC,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Stitch the crest' }).click();

    // 6. Registered: the king and six rookies at level 1.
    await expect(said).toContainText('Olympique Cavalier is registered in the School League.');
    await expect(page.locator('.club-roster tbody tr')).toHaveCount(7);
    await page.getByRole('button', { name: 'Go to my club' }).click();

    // The club's page, kept after a reload.
    await expect(page.getByRole('heading', { name: 'Olympique Cavalier' })).toBeFocused();
    await expect(page.locator('#club-screen').getByText('Coach: Etienne · School League · Season 1')).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await page.reload();
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await expect(page.getByRole('heading', { name: 'Olympique Cavalier' })).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club') || 'null'));
    expect(stored).toMatchObject({ coach: 'Etienne', name: 'Olympique Cavalier', secondary: '#f1c40f', pattern: 'chevron', shape: 'diamond', emblem: 'eagle' });
    expect(stored.players.map((p) => [p.type, p.level])).toEqual([['k', 5], ['r', 1], ['n', 1], ['b', 1], ['p', 1], ['p', 1], ['p', 1]]);
    expect(errors).toEqual([]);
  });

  /** A club made straight in storage, as the onboarding would have kept it. */
  async function withClub(page, extra = {}) {
    await page.addInitScript((more) => {
      if (localStorage.getItem('pawnet.chessdown.club')) return;
      const names = ['Alex', 'Lina', 'Hugo', 'Noah', 'Mila', 'Sam'];
      const types = ['r', 'n', 'b', 'p', 'p', 'p'];
      const stats = { games: 0, moves: 0, captures: 0, captured: 0, touchdowns: 0 };
      const players = [{ id: 1, type: 'k', name: 'The Captain', level: 5, xp: 0, stats },
        ...types.map((type, i) => ({ id: i + 2, type, name: names[i], level: 1, xp: 0, stats }))];
      localStorage.setItem('pawnet.chessdown.club', JSON.stringify({
        version: 1, coach: 'Etienne', name: 'Racing Rook', primary: '#3498db', secondary: '#ecf0f1',
        pattern: 'stripes', shape: 'shield', emblem: 'wolf', season: 1, tier: 'school', players, recruits: 0, lineups: [], ...more,
      }));
    }, extra);
  }

  test('the register: rename a player with the keyboard; a wrong name is refused', async ({ page }) => {
    await withClub(page);
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await page.getByRole('button', { name: 'Rename Lina' }).click();
    const field = page.getByLabel('New name for Lina');
    await expect(field).toBeFocused();
    await field.fill('x');
    await field.press('Enter');
    await expect(page.locator('#club-rename-error')).toHaveText('From 2 to 24 characters.');
    await field.fill('Lina la Flèche');
    await field.press('Enter');
    await expect(page.getByRole('button', { name: 'Rename Lina la Flèche' })).toBeFocused();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club')).players[2].name)).toBe('Lina la Flèche');
  });

  test('recruits: a recruit won is signed, at level 1, with its name', async ({ page }) => {
    await withClub(page, { recruits: 1 });
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await expect(page.getByText('Recruits to sign: 1.')).toBeVisible();
    await page.getByRole('button', { name: 'Queen' }).click();
    await page.getByLabel('Name of the recruit').fill('Rosa');
    await page.getByRole('button', { name: 'Sign the contract' }).click();
    await expect(page.getByRole('button', { name: 'Rename Rosa' })).toBeVisible();
    await expect(page.getByText('Win a best of 3 in the All Star campaign to earn a recruit.')).toBeVisible();
    const club = await page.evaluate(() => JSON.parse(localStorage.getItem('pawnet.chessdown.club')));
    expect(club.players.at(-1)).toMatchObject({ type: 'q', name: 'Rosa', level: 1, xp: 0 });
    expect(club.recruits).toBe(0);
  });

  test('a club in storage that does not check out is ignored; a club can be deleted', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('pawnet.chessdown.club', JSON.stringify({ version: 1, name: '<img src=x>', players: [] }));
      }
    });
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await expect(page.locator('#commissioner-said')).toContainText("what's your name?");

    await page.evaluate(() => localStorage.removeItem('pawnet.chessdown.club'));
    await withClub(page);
    await page.reload();
    await page.getByRole('button', { name: 'All Star: my club' }).click();
    await page.getByRole('button', { name: 'Start a new club' }).click();
    await answerDialog(page, 'Delete Racing Rook and all its players? This cannot be undone.', 'Delete the club');
    await expect(page.locator('#commissioner-said')).toContainText("what's your name?");
    expect(await page.evaluate(() => localStorage.getItem('pawnet.chessdown.club'))).toBeNull();
  });

  test('in French, Gérard speaks French', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('pawnet.language', 'fr'));
    await page.goto('/chessdown/');
    await page.getByRole('button', { name: 'All Star : mon club' }).click();
    await expect(page.locator('#commissioner-said')).toContainText("Et toi, comment tu t'appelles ?");
    await expect(page.getByLabel("Ton nom d'entraîneur")).toBeVisible();
  });
});
