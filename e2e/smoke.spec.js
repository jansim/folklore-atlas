import { expect, test } from '@playwright/test';

// Every wisp on screen has a button in the (visually hidden) #wisps list.
const visibleWisps = (page) => page.locator('#wisps .wisp');

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.errors = errors;
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'no errors in the console').toEqual([]);
});

test('opens on the globe with a tale and its kin', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#tale-title')).not.toBeEmpty();
  await expect(page.locator('#tale-atu')).toContainText('ATU 510A');
  await expect(page.locator('#wisps .wisp.on')).toHaveCount(1);
  await expect.poll(() => visibleWisps(page).count()).toBeGreaterThan(20);
});

test('zooming in shows more of the tales of a place', async ({ page }) => {
  const german = () => page.locator('#wisps .wisp[aria-label$=", Germany"]').count();
  await page.goto('/#germany');
  await expect(page.locator('#loading')).toBeHidden();
  await page.waitForTimeout(1500);
  const onGlobe = await german();
  for (let i = 0; i < 6; i++) {
    await page.locator('#zoom-in').click();
    await page.waitForTimeout(550);
  }
  await expect.poll(german, { timeout: 5000 }).toBeGreaterThan(onGlobe + 5);
});

test('clicking a wisp on the map opens its tale', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#to-flat').click(); // the flat map holds still
  await page.waitForTimeout(1800);
  // The list's buttons carry where their wisp is on screen; pick one away from the panel and the others.
  const wisp = await page.evaluate(() => {
    const panel = document.querySelector('#panel').getBoundingClientRect();
    const all = [...document.querySelectorAll('#wisps .wisp:not(.on)')].map((b) => ({ label: b.getAttribute('aria-label'), x: +b.dataset.x, y: +b.dataset.y }));
    const clear = (w) => all.every((o) => o === w || Math.hypot(o.x - w.x, o.y - w.y) > 30);
    const free = (w) => w.y > 120 && w.y < innerHeight - 40 && (w.x < panel.left - 20 || w.y < panel.top - 20);
    return all.find((w) => free(w) && clear(w));
  });
  expect(wisp).toBeTruthy();
  await page.mouse.click(wisp.x, wisp.y);
  await expect(page.locator('#tale-title')).toHaveText(wisp.label.slice(0, wisp.label.lastIndexOf(', ')));
});

test('search ignores accents and opens a tale', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#search').fill('erritso');
  await expect(page.locator('#results li[role=option]')).toHaveCount(1);
  await expect(page.locator('#results')).toContainText('Erritsø');
  await page.locator('#search').press('Enter');
  await expect(page.locator('#tale-title')).toContainText('Erritsø');
  await expect(page.locator('#wisps .wisp.on')).toHaveCount(1);
});

test('reads a tale and links to it', async ({ page }) => {
  await page.goto('/#read/100');
  await expect(page.locator('#tale-title')).toHaveText("The Emperor's Daughter and the Swineherd");
  await expect(page.locator('#reading p').first()).not.toBeEmpty();
  expect(await page.locator('#reading p').count()).toBeGreaterThan(3);
  await expect(page.locator('#reading .source')).toContainText('Source:');
  await page.locator('#back').click();
  await expect(page).toHaveURL(/#[a-z-]+\/100$/);
  await page.locator('#mode-family').click();
  await expect(page.locator('#kin-head')).toContainText('Kindred tales in');
  const chip = page.locator('.kc:not(.more-kin)').first();
  const place = await chip.textContent();
  await chip.click();
  await expect(page.locator('#tale-place')).toHaveText(place);
});
