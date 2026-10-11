import { expect, test } from '@playwright/test';
import { createHero } from './helpers';

test.describe('Panoplies, portrait et saison', () => {
  test('l’onglet Aventure liste les 6 panoplies avec leurs paliers à 2, 4 et 6 pièces', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Aventure' }).click();
    await expect(page.getByTestId('pp')).toBeVisible();
    const sets = page.getByTestId('sets');
    await expect(sets.locator('.set')).toHaveCount(6);
    await expect(page.getByTestId('set-titan')).toContainText('Panoplie du Titan');
    await expect(page.getByTestId('set-titan')).toContainText('0/6');
    await expect(page.getByTestId('set-titan')).toContainText('2 pièces : +5 PP');
    await expect(page.getByTestId('set-titan')).toContainText('6 pièces : +25 PP');
  });

  test('la carte Saison affiche les jours restants, le classement et la récompense', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Aventure' }).click();
    const card = page.getByTestId('season-card');
    await card.scrollIntoViewIfNeeded();
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { name: /Saison \d+/ })).toBeVisible();
    await expect(page.getByTestId('season-days')).toContainText(/\d+ jours? restants?/);
    await expect(page.getByTestId('season-power')).toContainText(/\d+ PP/);
    // en mode local, le héros est seul au classement
    await expect(page.getByTestId('season-board').locator('li')).toHaveCount(1);
    await expect(page.getByTestId('season-me')).toContainText('toi');
    await expect(page.getByTestId('season-prize')).toContainText('coffre d’or');
  });

  test('la fiche du héros affiche sa puissance et le portrait sans équipement ni illustration', async ({ page }) => {
    await createHero(page);
    await page.goto('/tabs/hero');
    await expect(page.getByTestId('hero-pp')).toContainText(/\d+ PP/);
    // aucun objet équipé : pas d'anneau de pastilles
    await expect(page.locator('lu-portrait .gear').first()).toHaveCount(0);
    await expect(page.locator('lu-portrait img')).toHaveCount(0);
  });
});
