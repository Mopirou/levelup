import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHero } from './helpers';

const quests = JSON.parse(readFileSync(resolve(__dirname, '../../../packages/content/data/quests.fr.json'), 'utf8')) as { theme?: string | null; trackId?: string | null }[];

test.describe('Parcours de discipline', () => {
  test('sans parcours, l’écran Quêtes explique le principe et propose de choisir', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Quêtes' }).click();
    await expect(page.getByRole('heading', { name: 'Aujourd’hui, mes parcours' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choisis où tu veux progresser' })).toBeVisible();
    await expect(page.locator('lu-track-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'Choisir mes parcours' }).click();
    await expect(page.getByRole('heading', { name: 'Mes parcours', level: 1 })).toBeVisible();
    await expect(page.getByText('0 / 3', { exact: true })).toBeVisible();
  });

  test('on démarre un parcours depuis « Mes parcours », puis on le met en pause, on le reprend et on l’arrête', async ({ page }) => {
    await createHero(page);
    await page.goto('/tracks');
    await page.getByRole('button', { name: /^Danse/ }).click();
    await page.getByRole('button', { name: 'Voir les 10 échelons' }).first().click();
    await expect(page.getByRole('list', { name: /^Échelons du parcours/ })).toBeVisible();
    await page.getByRole('button', { name: 'Commencer le parcours Salsa (Danse)' }).click();
    await expect(page.getByText(/Parcours commencé : Salsa/)).toBeVisible();
    await expect(page.getByText('1 / 3')).toBeVisible();

    await page.getByRole('button', { name: 'Mettre en pause le parcours Salsa' }).click();
    await expect(page.getByText(/Parcours en pause/)).toBeVisible();
    await expect(page.getByText('0 / 3')).toBeVisible();
    await page.getByRole('button', { name: 'Reprendre le parcours Salsa' }).click();
    await expect(page.getByText(/Parcours repris : Salsa/)).toBeVisible();

    await page.getByRole('button', { name: 'Arrêter le parcours Salsa' }).click();
    await page.getByRole('button', { name: 'Arrêter le parcours', exact: true }).click();
    await expect(page.getByText(/Parcours arrêté : Salsa/)).toBeVisible();
    await expect(page.getByText('0 / 3')).toBeVisible();
  });

  test('trois parcours actifs au maximum', async ({ page }) => {
    await createHero(page, 'Aldric', 'aldric-e2e', [
      ['Musculation', 'Muscu haut du corps'],
      ['Danse', 'Salsa'],
      ['Langues', 'Espagnol'],
    ]);
    await page.locator('ion-tab-button', { hasText: 'Quêtes' }).click();
    await expect(page.locator('lu-track-card')).toHaveCount(3);
    await page.getByRole('button', { name: 'Ajouter ou gérer mes parcours' }).click();
    await expect(page.getByText('3 / 3')).toBeVisible();
    await page.getByRole('button', { name: /^Yoga/ }).click();
    await expect(page.getByRole('button', { name: /^Commencer le parcours Yoga doux/ })).toBeDisabled();
  });

  test('le menu d’un parcours permet la pause, et le parcours en pause se reprend depuis l’écran Quêtes', async ({ page }) => {
    await createHero(page, 'Aldric', 'aldric-e2e', [['Danse', 'Salsa']]);
    await page.locator('ion-tab-button', { hasText: 'Quêtes' }).click();
    await page.getByRole('button', { name: 'Gérer le parcours Salsa : pause ou arrêt' }).click();
    await page.getByRole('button', { name: /Mettre en pause/ }).click();
    await expect(page.getByText(/Parcours en pause/)).toBeVisible();
    await expect(page.locator('lu-track-card')).toHaveCount(0);
    await page.getByRole('button', { name: 'Reprendre le parcours Salsa' }).click();
    await expect(page.locator('lu-track-card').filter({ hasText: 'Salsa' })).toBeVisible();
  });

  test('la fiche héros affiche l’évolution : parcours actifs et XP sur 30 jours', async ({ page }) => {
    await createHero(page, 'Aldric', 'aldric-e2e', [['Musculation', 'Muscu haut du corps']]);
    await page.locator('ion-tab-button', { hasText: 'Profil' }).click();
    await expect(page.getByRole('heading', { name: 'Évolution' })).toBeVisible();
    await expect(page.locator('app-hero').getByText('Muscu haut du corps')).toBeVisible();
    await expect(page.locator('app-hero').getByText('Échelon 1/10')).toBeVisible();
    await expect(page.getByText('XP GAGNÉE SUR 30 JOURS')).toBeVisible();
  });

  test('le catalogue libre ne montre jamais les quêtes d’échelon des parcours', async ({ page }) => {
    await createHero(page, 'Aldric', 'aldric-e2e', [['Musculation', 'Muscu haut du corps']]);
    await page.goto('/grimoire');
    await page.getByRole('button', { name: 'Disciplines' }).click();
    const total = quests.filter((q) => q.theme === 'musculation' && !q.trackId).length;
    await expect(page.getByText(`0 / ${total} quêtes essayées`).first()).toBeVisible();
  });

  test('les réglages n’ont plus de mode Hardcore ni de centres d’intérêt, mais « Mes parcours »', async ({ page }) => {
    await createHero(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Mes parcours' })).toBeVisible();
    await expect(page.getByText('Mode Hardcore')).toHaveCount(0);
    await expect(page.getByText('Centres d’intérêt')).toHaveCount(0);
  });
});
