import { expect, test } from '@playwright/test';
import { createHero } from './helpers';

test.describe('Parcours solo', () => {
  test('crée un personnage, voit ses quêtes, en valide une et gagne de l’XP', async ({ page }) => {
    await createHero(page);
    await expect(page.getByText('0 / 60 XP')).toBeVisible();

    await page.locator('ion-tab-button', { hasText: 'Quêtes' }).click();
    await expect(page.getByRole('heading', { name: 'Mes quêtes' })).toBeVisible();
    await expect(page.getByText('Rien de fait pour l’instant')).toBeVisible();

    // valider une quête « simple » directement depuis le tableau
    const simple = page.locator('lu-quest-card').filter({ has: page.getByRole('button', { name: 'Accomplir' }) }).first();
    if (await simple.count()) {
      await simple.getByRole('button', { name: 'Accomplir' }).click();
      await expect(page.getByText(/Quête accomplie à/)).toBeVisible();
      await expect(page.getByText(/XP gagnés/)).toBeVisible();
    }
  });

  test('les quêtes hebdomadaires s’acceptent', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Quêtes' }).click();
    await page.getByRole('tab', { name: 'Semaine' }).click();
    await expect(page.getByText('À accepter')).toBeVisible();
    await page.getByRole('button', { name: 'Accepter' }).first().click();
    await expect(page.getByText(/Quête acceptée/)).toBeVisible();
  });

  test('la fiche affiche les six caractéristiques et le radar', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Profil' }).click();
    await expect(page.getByText('Tes six caractéristiques')).toBeVisible();
    for (const n of ['Constitution', 'Intelligence', 'Dextérité', 'Force', 'Charisme', 'Sagesse']) {
      await expect(page.locator('app-hero').getByText(n, { exact: true }).first()).toBeVisible();
    }
    await expect(page.locator('app-hero').getByRole('img', { name: /Radar/ })).toBeVisible();
  });

  test('le Grimoire se classe aussi par disciplines, avec quatre niveaux par quête guidée', async ({ page }) => {
    await createHero(page);
    await page.goto('/grimoire');
    await page.getByRole('button', { name: 'Disciplines' }).click();
    await expect(page.getByText('0 / 20 quêtes essayées').first()).toBeVisible();
    await page.getByRole('button', { name: /^Danse/ }).click();
    for (const n of ['Niveau 1 · Journée', 'Niveau 2 · Semaine', 'Niveau 3 · Mois', 'Niveau 4 · Épique']) {
      await expect(page.getByText(n)).toBeVisible();
    }
    await expect(page.getByText('Salsa, 20 minutes guidées')).toBeVisible();
    await expect(page.getByText(/Répartition de l’XP : Dextérité 60 %/)).toBeVisible();
  });

  test('le Grimoire liste les quêtes par chapitre et se filtre', async ({ page }) => {
    await createHero(page);
    await page.goto('/grimoire');
    await expect(page.getByText('0 / 100 quêtes essayées').first()).toBeVisible();
    await page.getByPlaceholder('Chercher une quête…').fill('pompes');
    await expect(page.getByText('Pompes en séries, 5 minutes')).toBeVisible();
  });
});

test.describe('Social (mode démo)', () => {
  test('le Village montre les nouvelles du cercle, on réagit et on commente', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Amis' }).click();
    await expect(page.getByRole('heading', { name: 'Fil des amis' })).toBeVisible();
    await expect(page.getByText('Léa Martin').first()).toBeVisible();
    await expect(page.locator('app-village').getByText('Courir 3 km', { exact: true })).toBeVisible();

    const post = page.locator('lu-post-card').first();
    await post.getByRole('button', { name: /Bravo/ }).click();
    await expect(post.getByRole('button', { name: /Bravo/ })).toHaveAttribute('aria-pressed', 'true');

    await post.getByRole('button', { name: /commentaires/ }).click();
    await page.getByLabel('Ton commentaire').fill('Magnifique, bravo !');
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await expect(page.getByText('Magnifique, bravo !')).toBeVisible();
  });

  test('les demandes d’amis s’acceptent et un ami se trouve par pseudo', async ({ page }) => {
    await createHero(page);
    await page.goto('/companions');
    await expect(page.getByText('Demandes d’amis')).toBeVisible();
    await page.getByRole('button', { name: 'Accepter', exact: true }).first().click();
    await expect(page.getByText(/est maintenant ton ami/)).toBeVisible();
    await page.getByLabel('Rechercher par pseudo').fill('theo');
    await expect(page.getByText('@theo_marin')).toBeVisible();
    await page.getByRole('button', { name: 'Demander' }).click();
    await expect(page.getByText('Demande envoyée.')).toBeVisible();
  });

  test('on peut préparer une publication', async ({ page }) => {
    await createHero(page);
    await page.goto('/publish');
    await page.getByLabel(/Ton message/).fill('Une publication toute simple');
    await expect(page.getByRole('button', { name: 'Publier' })).toBeEnabled();
  });
});

test.describe('Réglages et documents', () => {
  test('le thème clair s’applique et persiste', async ({ page }) => {
    await createHero(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Clair' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('les documents légaux sont accessibles sans compte', async ({ page }) => {
    await page.goto('/legal/privacy');
    await expect(page.getByRole('heading', { name: 'Politique de confidentialité' })).toBeVisible();
    await page.goto('/legal/community');
    await expect(page.getByRole('heading', { name: 'Règles de la communauté' })).toBeVisible();
  });
});
