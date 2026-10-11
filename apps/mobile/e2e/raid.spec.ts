import { expect, test } from '@playwright/test';
import { createHero } from './helpers';

test.describe('Raid d’amis (mode local)', () => {
  test('sans compte, la carte raid n’est pas affichée', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Aventure' }).click();
    await expect(page.getByRole('heading', { name: /Expédition/ }).first()).toBeVisible();
    await expect(page.getByTestId('raid-card')).toHaveCount(0);
  });
});
