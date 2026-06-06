const { test, expect } = require('@playwright/test');
const { installApi } = require('./fixtures/api.js');

test.beforeEach(async ({ page }) => {
  await installApi(page);
  await page.goto('/app/homeview/profile.html');
  await expect(page.locator('#screen-profile')).toBeVisible();
});

test('shows photo cards for Kids and Adults with names', async ({ page }) => {
  await expect(page.locator('.profile-card')).toHaveCount(2);
  await expect(page.locator('#btn-kids .profile-name')).toHaveText('Kids');
  await expect(page.locator('#btn-adults .profile-name')).toHaveText('Adults');
});

test('only the Adults card has a lock badge', async ({ page }) => {
  await expect(page.locator('#btn-adults .lock-badge')).toBeVisible();
  await expect(page.locator('#btn-kids .lock-badge')).toHaveCount(0);
});

test('missing photo falls back to an emoji placeholder', async ({ page }) => {
  await expect(page.locator('#btn-kids .profile-photo-ph')).toBeVisible();
  await expect(page.locator('#btn-kids .profile-photo-img')).toBeHidden();
});

test('Kids opens straight to browse with no PIN prompt', async ({ page }) => {
  await page.locator('#btn-kids').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('Adults click reveals the PIN keypad, focused on the first key', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/active/);
  await expect(page.locator('.key')).toHaveCount(12);
  await expect(page.locator('.key[data-key="1"]')).toBeFocused();
});

test('wrong PIN shakes, clears the dots, and stays on the profile screen', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await page.locator('.key[data-key="9"]').click();
  await page.locator('.key[data-key="9"]').click();
  await page.locator('.key[data-key="9"]').click();
  await page.locator('.key[data-key="9"]').click();
  await expect(page.locator('#screen-profile')).toBeVisible();
  await expect(page.locator('#pin-panel')).toHaveClass(/active/);
  await expect(page.locator('.pin-dots span.on')).toHaveCount(0);
});

test('backspace key (⌫) removes the last entered digit', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await page.locator('.key[data-key="1"]').click();
  await page.locator('.key[data-key="2"]').click();
  await expect(page.locator('.pin-dots span.on')).toHaveCount(2);
  await page.locator('.key[data-key="back"]').click();
  await expect(page.locator('.pin-dots span.on')).toHaveCount(1);
});

test('keypad is d-pad navigable', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await expect(page.locator('.key[data-key="1"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.key[data-key="2"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.key[data-key="5"]')).toBeFocused();
});

test('Enter on a focused key enters its digit', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await expect(page.locator('.key[data-key="1"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.pin-dots span.on')).toHaveCount(1);
});

test('correct PIN entered by d-pad unlocks Adults', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await page.locator('.key[data-key="1"]').click();
  await page.locator('.key[data-key="2"]').click();
  await page.locator('.key[data-key="3"]').click();
  await page.locator('.key[data-key="4"]').click();
  await expect(page.locator('#screen-browse')).toBeVisible();
});

test('Escape closes the keypad and returns focus to the Adults card', async ({ page }) => {
  await page.locator('#btn-adults').click();
  await expect(page.locator('#pin-panel')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pin-panel')).not.toHaveClass(/active/);
  await expect(page.locator('#btn-adults')).toBeFocused();
});

test('arrow keys move focus between profile cards', async ({ page }) => {
  await expect(page.locator('#btn-kids')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#btn-adults')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#btn-kids')).toBeFocused();
});
