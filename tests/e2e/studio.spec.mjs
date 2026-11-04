// Walks the studio in a browser against the dev server. Anything that would bill Muse is blocked and counted, so these
// tests never spend: every image they show is already on disk.
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.billed = [];
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(error.message));
  await page.route(/\/api\/(looks|try-on|catalog|stylist)/, (route) => {
    if (route.request().method() === 'GET') return route.continue();
    page.billed.push(route.request().url());
    return route.abort();
  });
  // Every test runs as a copy without a key would, whatever this machine has in .env.local.
  await page.route('**/api/status', (route) => route.fulfill({ json: { live: false, samples: ['mia-jacket-chinos'] } }));
  await page.goto('/');
  await expect(page.locator('body')).not.toHaveAttribute('data-intro', { timeout: 10_000 });
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
  expect(page.billed).toEqual([]);
});

test('the studio opens on a dressed mannequin', async ({ page }) => {
  await expect(page).toHaveTitle(/Orbit/);
  await expect(page.locator('#figure')).toBeVisible();
  await expect(page.locator('#try')).toBeVisible();
});

test('the wardrobe opens and closes', async ({ page }) => {
  // On a desk the rail opens it; on a phone, the wardrobe button in the dock.
  const opener = page.locator('#wardrobe-rail, #open-wardrobe').filter({ visible: true }).first();
  await opener.click();
  await expect(opener).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.piece').first()).toBeVisible();
  await page.locator('#wardrobe-close').click();
  await expect(opener).toHaveAttribute('aria-expanded', 'false');
});

test('each place can be chosen', async ({ page }) => {
  const places = page.locator('#places .place');
  await expect(places).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await places.nth(i).click();
    await expect(places.nth(i)).toHaveAttribute('aria-pressed', 'true');
  }
});

test('without a key Pin hands over looks that are ready', async ({ page }) => {
  await page.locator('#wardrobe-rail, #open-wardrobe').filter({ visible: true }).first().click();
  await page.locator('#stylist-form [name=ask]').fill('A gallery opening on Friday');
  await page.locator('#stylist-form [name=ask]').press('Enter');
  const picks = page.locator('.said[data-pick]');
  await expect(picks).toHaveCount(3);
  await picks.first().click();
  await expect(page.locator('#figure')).toBeVisible();
});

test('without a key a photo cannot be sent, but Mia can wear a look she already wore', async ({ page }) => {
  await page.locator('#try').click();
  await expect(page.locator('#upload')).toBeVisible();
  await expect(page.locator('#upload-drop')).toHaveAttribute('data-off');
  await expect(page.locator('#upload-send')).toBeHidden();
  await expect(page.locator('.model[data-model="mia"]')).toBeEnabled();
  await expect(page.locator('.model[data-model="theo"]')).toBeDisabled();
});
