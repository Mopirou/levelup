import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createHero } from './helpers';

test.describe('Raid d’amis (mode local)', () => {
  test('la carte raid montre le boss de la semaine et explique qu’il faut un compte', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Aventure' }).click();
    const card = page.getByTestId('raid-card');
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: /Raid d’amis/ })).toBeVisible();
    await expect(page.getByTestId('raid-boss')).not.toBeEmpty();
    await expect(page.getByTestId('raid-local')).toContainText('crée un compte');
    await expect(page.getByTestId('raid-create')).toHaveCount(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`accessibilité WCAG 2.1 AA de la carte raid — thème ${theme === 'dark' ? 'sombre' : 'clair'}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await createHero(page);
      await page.goto('/tabs/adventure');
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await expect(page.getByTestId('raid-card')).toBeVisible();
      await page.waitForTimeout(800);
      const r = await new AxeBuilder({ page }).include('[data-testid="raid-card"]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => `${v.id} (${v.impact}) : ${v.nodes[0]?.target?.join(' ')}`)).toEqual([]);
    });
  }
});
