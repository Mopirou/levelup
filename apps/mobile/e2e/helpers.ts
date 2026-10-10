import { expect, Page } from '@playwright/test';

/** Parcours à choisir pendant l'onboarding : [discipline, nom du parcours], ex. ['Musculation', 'Muscu haut du corps']. */
export type ParcoursChoice = [discipline: string, parcours: string];

/** Inscription (mode local) puis création rapide d'un personnage jusqu'à l'écran d'accueil (avec les parcours demandés, aucun par défaut). */
export async function createHero(page: Page, name = 'Aldric', username = 'aldric-e2e', parcours: ParcoursChoice[] = []): Promise<void> {
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
  // étape « Où veux-tu évoluer ? » : on déplie la discipline puis on choisit le parcours
  await expect(page.getByRole('heading', { name: 'Où veux-tu évoluer ?' })).toBeVisible();
  for (const [discipline, label] of parcours) {
    await page.getByRole('button', { name: new RegExp('^' + discipline) }).click();
    await page.getByRole('button', { name: `Choisir le parcours ${label} (${discipline})` }).click();
  }
  await page.getByRole('button', { name: parcours.length ? 'Continuer' : 'Passer cette étape' }).click();
  await page.getByRole('button', { name: /^Commencer$/ }).click();
  await expect(page.getByRole('heading', { name: 'Aujourd’hui' })).toBeVisible({ timeout: 15_000 });
}

/**
 * Valide la quête ouverte (page /quest/:id), quel que soit son type : simple, compteur ou checklist.
 * Renvoie false pour un chronomètre ou un journal (pas validables d'un clic).
 */
export async function validateOpenQuest(page: Page): Promise<boolean> {
  // une quête encore « proposée » (page de détail) doit d'abord être acceptée
  const accept = page.getByRole('button', { name: 'Accepter cette quête' });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  const validate = page.getByRole('button', { name: /^(Accomplir|Valider ma quête)$/ });
  await expect(validate).toBeVisible();
  const plus = page.getByRole('button', { name: /^Plus( \d+)?/ }).and(page.locator('.rb'));
  if (await plus.count()) {
    for (let i = 0; i < 400 && !(await validate.isEnabled()); i++) await plus.click();
  } else {
    const steps = page.locator('.steps .chk');
    for (let i = 0, n = await steps.count(); i < n; i++) await steps.nth(i).click();
  }
  if (!(await validate.isEnabled())) return false;
  await validate.click();
  await expect(page.getByText(/Quête accomplie à/)).toBeVisible();
  return true;
}
