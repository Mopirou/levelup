import { expect, Page } from '@playwright/test';

/** Inscription (mode local) puis création rapide d'un personnage jusqu'à l'écran d'accueil. */
export async function createHero(page: Page, name = 'Aldric', username = 'aldric-e2e'): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Continuer avec un e-mail' }).click();
  await page.getByLabel('E-mail').fill('e2e@example.fr');
  await page.getByLabel('Mot de passe').fill('MotDePasse42!');
  await page.getByLabel('Année de naissance').fill('1994');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continuer' }).click();

  await expect(page.getByRole('heading', { name: /Bienvenue sur Level Up/ })).toBeVisible();
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.getByRole('button', { name: 'J’ai compris' }).click();
  await page.getByLabel('Nom du personnage').fill(name);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /Éclaireur/ }).click();
  await page.getByRole('button', { name: 'Choisir cette classe' }).click();
  await page.getByLabel('Pseudo', { exact: true }).fill(username);
  await expect(page.getByText('Ce pseudo est libre')).toBeVisible();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Répartition équilibrée' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByRole('button', { name: /^Commencer$/ }).click();
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible({ timeout: 15_000 });
}
