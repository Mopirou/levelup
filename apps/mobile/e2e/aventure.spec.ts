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
    await expect(page.getByTestId('opens')).toContainText('0 ouvert');
    await expect(page.getByTestId('keys')).toContainText('/3');
    // l'expédition vient de partir : rien à réclamer avant une minute
    await expect(page.getByRole('button', { name: 'Réclamer le butin' })).toBeDisabled();
    // les 26 donjons sont listés avec leurs noms (verrouillés ou non)
    await expect(page.locator('.drow').first()).toBeVisible();
    expect(await page.locator('.drow').count()).toBeGreaterThan(20);
  });

  test('le Grimoire (V4) affiche 3 emplacements libres, l’affinité de classe et l’aide sur les capacités', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Aventure' }).click();
    await expect(page.getByRole('heading', { name: /Grimoire/ })).toBeVisible();
    const slots = page.getByRole('list', { name: 'Emplacements du Grimoire' }).getByRole('listitem');
    await expect(slots).toHaveCount(3);
    await expect(page.getByRole('group', { name: /Emplacement 1 : libre/ })).toBeVisible();
    await expect(page.getByTestId('grimoire-empty')).toContainText('coffres de bronze');
    await expect(page.getByTestId('grimoire-count')).toContainText('0/8');
    // l'affinité de classe est expliquée, sans dépendre de la couleur
    await expect(page.getByTestId('affinity-help')).toContainText('+20 % de PP');
    // sept panoplies de classe
    expect(await page.locator('[data-testid^="set-"]').count()).toBe(7);
  });

  test('ouvrir le coffre de bois offert annonce un objet ou une carte (jamais une capacité)', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Aventure' }).click();
    await page.getByRole('button', { name: /Ouvrir un coffre Bois/ }).click();
    const result = page.getByTestId('open-result');
    await expect(result).toBeVisible();
    await expect(page.getByTestId('spell-announce')).toHaveCount(0);
    await expect(result).toContainText(/PP|Carte/);
    const gotItem = /PP/.test((await result.textContent()) ?? '');
    await page.getByRole('button', { name: 'Super' }).click();
    if (gotItem) {
      // l'objet obtenu est dans le sac : son détail indique s'il est de la classe du héros ou universel
      await page.locator('.irow').first().click();
      await expect(page.getByTestId('item-class')).toContainText(/Objet|universel|classe/);
    }
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
