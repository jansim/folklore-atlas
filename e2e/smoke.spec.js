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

test('opens on the globe with no tale chosen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('#wisps .wisp.on')).toHaveCount(0);
  await expect.poll(() => visibleWisps(page).count()).toBeGreaterThan(10);
});

test('the chosen tale can be closed', async ({ page }) => {
  await page.goto('/#germany');
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#wisps .wisp.on')).toHaveCount(1);
  await page.locator('#close').click();
  await expect(page.locator('#panel')).toBeHidden();
  await expect(page.locator('#wisps .wisp.on')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
});

test('zooming in shows more of the tales of a place', async ({ page }) => {
  const german = () => page.locator('#wisps .wisp[aria-label$=", Germany"]').count();
  await page.goto('/#germany');
  await expect(page.locator('#loading')).toBeHidden();
  await page.waitForTimeout(1500);
  const onGlobe = await german();
  // In to the closest zoom: tales stay inside their country, which is small on a phone.
  for (let i = 0; i < 8; i++) {
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
    const panelEl = document.querySelector('#panel');
    const panel = panelEl.hidden ? { left: Infinity, top: Infinity } : panelEl.getBoundingClientRect();
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
  await expect(page.locator('#reader')).toBeVisible();
  await expect(page.locator('#r-title')).toHaveText("The Emperor's Daughter and the Swineherd");
  await expect.poll(() => page.locator('#reading p').count()).toBeGreaterThan(3);
  await expect(page.locator('#reading .cap')).toHaveCount(1);
  await expect(page.locator('#r-source')).toContainText('Folktexts');
  await page.locator('#back').click();
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page).toHaveURL(/#[a-z-]+\/100$/);
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#kin-head')).toContainText('Similar tale');
  await expect(page.locator('#fam-head')).toHaveText('Similar family · no other places yet');
  const chip = page.locator('#kin-chips .kc:not(.more-kin)').first();
  const place = await chip.textContent();
  await chip.click();
  await expect(page.locator('#tale-place')).toHaveText(place);
});

test('the reader opens kindred tales and closes with Escape', async ({ page }) => {
  await page.goto('/#germany');
  await page.locator('#read').click();
  await expect(page.locator('#reader')).toBeVisible();
  await expect(page).toHaveURL(/#read\/\d+$/);
  const before = await page.locator('#r-title').textContent();
  await page.locator('#fs-up').click();
  await expect(page.locator('#reading')).toHaveAttribute('style', /--fs: 25px/);
  const other = page.locator('#r-kin-chips .kc, #r-fam-chips .kc').first();
  const title = (await other.getAttribute('title')).match(/“(.*)”/)[1];
  await other.click();
  await expect(page.locator('#r-title')).toHaveText(title);
  expect(title).not.toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('#reader')).toBeHidden();
  await expect(page.locator('#tale-title')).toHaveText(title);
});

test('lists all the tales of a place and goes back to the list', async ({ page }) => {
  await page.goto('/#germany');
  const all = page.locator('#others-list .more.all');
  await expect(all).toHaveText(/^All \d+ tales from Germany$/);
  const count = Number((await all.textContent()).match(/\d+/)[0]);
  await all.click();
  await expect(page).toHaveURL(/#germany\/all$/);
  await expect(page.locator('#tale-title')).toHaveText('Germany');
  await expect(page.locator('#list .more')).toHaveCount(count);
  await expect(page.locator('#to-list')).toBeHidden();
  const row = page.locator('#list .more').nth(2);
  const title = await row.textContent();
  await row.click();
  await expect(page.locator('#tale-title')).toHaveText(title);
  await page.locator('#to-list').click();
  await expect(page.locator('#tale-title')).toHaveText('Germany');
  await page.locator('#close').click();
  await expect(page.locator('#panel')).toBeHidden();
  expect(new URL(page.url()).hash).toBe('');
});

test('the tale type opens the index of types, kinds and families', async ({ page }) => {
  await page.goto('/#germany');
  const type = page.locator('#tale-type .tt-name');
  await expect(type).toHaveText(/^.+ \(ATU \w+\)$/);
  await type.locator('.atu-link').click();
  await expect(page.locator('#atu')).toBeVisible();
  await expect(page.locator('#atu-sub')).toContainText(/ATU \w+ · \d+ tales? in \d+ places?/);
  await expect(page.locator('#atu-body .atu-summary')).not.toHaveText('…');
  await page.locator('#atu-crumbs .crumb').first().click();
  await expect(page.locator('#atu-title')).toHaveText('The kinds of tale');
  await expect(page.locator('#atu-body .more')).toHaveCount(7);
  await page.locator('#atu-body .more').nth(1).click();
  await expect(page.locator('#atu-title')).toHaveText('Tales of Magic');
  await page.locator('#atu-body .more').first().click();
  await page.locator('#atu-body .more').first().click();
  const tale = page.locator('#atu-body .more').first();
  const title = await tale.evaluate((b) => b.firstChild.textContent);
  await tale.click();
  await expect(page.locator('#atu')).toBeHidden();
  await expect(page.locator('#tale-title')).toHaveText(title);
});
