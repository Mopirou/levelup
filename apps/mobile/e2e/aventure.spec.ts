import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createHero } from './helpers';

test.describe('Aventure', () => {
  test('l’onglet Aventure affiche la puissance, l’expédition, les coffres, l’équipement et les donjons', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Aventure' }).click();
    await expect(page.getByRole('heading', { name: 'Ton aventure', level: 1 })).toBeVisible();
    await expect(page.getByTestId('pp')).toContainText(/\d+ PP/);
    await expect(page.getByRole('heading', { name: /Expédition/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Coffres/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Équipement/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Donjons/ })).toBeVisible();
    await expect(page.getByTestId('opens')).toContainText('0/2');
    await expect(page.getByTestId('keys')).toContainText('/3');
    // l'expédition vient de partir : rien à réclamer avant une minute
    await expect(page.getByRole('button', { name: 'Réclamer le butin' })).toBeDisabled();
    // les 26 donjons sont listés avec leurs noms (verrouillés ou non)
    await expect(page.locator('.drow').first()).toBeVisible();
    expect(await page.locator('.drow').count()).toBeGreaterThan(20);
  });

  test('réclamer l’expédition affiche un message de butin', async ({ page }) => {
    await page.clock.install();
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Aventure' }).click();
    await expect(page.getByTestId('pp')).toBeVisible();
    await page.clock.fastForward('06:00:00');
    await page.goto('/tabs/adventure');
    await expect(page.getByTestId('expedition-hours')).toContainText(/6 h/);
    await page.getByRole('button', { name: 'Réclamer le butin' }).click();
    await expect(page.getByText(/Expédition : \+\d+ or/)).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`accessibilité WCAG 2.1 AA — thème ${theme === 'dark' ? 'sombre' : 'clair'}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await createHero(page);
      await page.goto('/tabs/adventure');
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await expect(page.getByTestId('pp')).toBeVisible();
      await page.waitForTimeout(800);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['region']).analyze();
      expect(r.violations.map((v) => `${v.id} (${v.impact}) : ${v.nodes[0]?.target?.join(' ')}`)).toEqual([]);
    });
  }
});
