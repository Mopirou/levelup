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

  test('on ajoute une quête depuis le catalogue, on la valide puis on la refait avec moins d’XP', async ({ page }) => {
    await createHero(page);
    await page.goto('/grimoire?for=daily');
    await page.getByRole('button', { name: /^Constitution/ }).click();
    await page.getByRole('button', { name: /Niveau 1 · Journée/ }).click();
    // une quête « simple » qui n'est pas déjà dans le tirage du jour
    const add = page.getByRole('button', { name: /^Commencer : (Coucher avant 23 heures|Écrans coupés 30 minutes avant dormir|Petit-déjeuner dans l’heure du réveil)/ }).first();
    await add.click();
    await expect(page.getByText(/ajoutée à tes quêtes/)).toBeVisible();

    await page.waitForTimeout(500); // laisse partir l’enregistrement local avant de recharger
    await page.goto('/tabs/quests');
    await expect(page.getByRole('heading', { name: 'Mes ajouts' })).toBeVisible();
    const extra = page.locator('lu-quest-card').filter({ has: page.getByRole('button', { name: 'Accomplir' }) }).last();
    await extra.getByRole('button', { name: 'Accomplir' }).click();
    await expect(page.getByText(/Quête accomplie à/)).toBeVisible();

    await page.getByRole('button', { name: 'Refaire cette quête' }).click();
    // la seconde tentative rapporte moitié moins d’XP (20 → 10)
    await expect(page.locator('.chips').getByText('+10 XP')).toBeVisible();
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

  test('le catalogue se parcourt par caractéristique : quatre niveaux, les niveaux 3 et 4 verrouillés au départ', async ({ page }) => {
    await createHero(page);
    await page.goto('/grimoire');
    await page.getByRole('button', { name: /^Force/ }).click();
    await expect(page.getByText('Niveau 1 · Journée')).toBeVisible();
    await expect(page.getByText('Niveau 2 · Semaine')).toBeVisible();
    await expect(page.getByText('Niveau 3 · Mois')).toBeVisible();
    await expect(page.getByText('Niveau 4 · Épique')).toBeVisible();
    await expect(page.getByText('Force 14 requis (tu es à 13)')).toBeVisible();
    await expect(page.getByText('Niveau 11 requis (tu es niveau 1)')).toBeVisible();
    await expect(page.getByRole('button', { name: /Niveau 3 · Mois/ })).toBeDisabled();
    await page.getByRole('button', { name: /Niveau 1 · Journée/ }).click();
    await expect(page.getByText('Pompes en séries, 5 minutes')).toBeVisible();
    await page.getByRole('button', { name: 'Toutes les caractéristiques' }).click();
    await expect(page.getByRole('button', { name: /^Dextérité/ })).toBeVisible();
  });

  test('l’accueil montre les jours d’élan et les objectifs par caractéristique', async ({ page }) => {
    await createHero(page);
    await expect(page.getByText(/0 jour d’élan/)).toBeVisible();
    await expect(page.getByText(/Accomplis au moins 1 quête aujourd’hui/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Objectifs' })).toBeVisible();
    await expect(page.getByText("0 / 5 quêtes", { exact: false }).first()).toBeVisible();
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
    await expect(page.getByText('0/100 quêtes essayées').first()).toBeVisible();
    await page.getByPlaceholder('Chercher une quête…').fill('pompes');
    await expect(page.getByText('Pompes en séries, 5 minutes')).toBeVisible();
  });
});

test.describe('Social (mode local)', () => {
  test('aucun ami ni demande fictive : le fil, les amis et le classement sont vides', async ({ page }) => {
    await createHero(page);
    await page.locator('ion-tab-button', { hasText: 'Amis' }).click();
    await expect(page.getByRole('heading', { name: 'Fil des amis' })).toBeVisible();
    await expect(page.getByText('Rien pour le moment')).toBeVisible();
    for (const fake of ['Léa Martin', 'Sam Diallo', 'Hugo Durand', 'Emma Petit']) await expect(page.getByText(fake)).toHaveCount(0);

    await page.goto('/companions');
    await expect(page.getByText('Pas encore d’amis')).toBeVisible();
    await expect(page.getByText('Demandes d’amis')).toHaveCount(0);
    await expect(page.getByText(/demandent le mode en ligne/)).toBeVisible();
    await page.getByLabel('Rechercher par pseudo').fill('theo');
    await expect(page.getByText('Aucun utilisateur trouvé.')).toBeVisible();
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
