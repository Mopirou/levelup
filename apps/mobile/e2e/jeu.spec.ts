import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BALANCED_SCORES, TIER3_MIN_SCORE, TIER4_MIN_LEVEL, questXp } from '../../../packages/engine/src/xp';
import { createHero, validateOpenQuest } from './helpers';

const quests = JSON.parse(readFileSync(resolve(__dirname, '../../../packages/content/data/quests.fr.json'), 'utf8')) as {
  ability: string;
  trackId?: string | null;
}[];
/** Quêtes du catalogue libre (les gabarits d'échelon des parcours n'y figurent pas). */
const catalogCount = (ability: string): number => quests.filter((q) => q.ability === ability && !q.trackId).length;

test.describe('Parcours solo', () => {
  test('crée un personnage avec un parcours, voit la quête du jour, l’accepte puis la valide', async ({ page }) => {
    await createHero(page, 'Aldric', 'aldric-e2e', [['Musculation', 'Muscu haut du corps']]);
    await expect(page.getByText('0 / 60 XP')).toBeVisible();

    await page.locator('ion-tab-button', { hasText: 'Quêtes' }).click();
    await expect(page.getByRole('heading', { name: 'Mes quêtes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aujourd’hui, mes parcours' })).toBeVisible();
    await expect(page.getByText('Rien de validé pour l’instant')).toBeVisible();

    const card = page.locator('lu-track-card').filter({ hasText: 'Muscu haut du corps' });
    await expect(card).toBeVisible();
    await expect(card.getByText('Échelon 1/10')).toBeVisible();
    await expect(card.getByText('0/5 jours validés')).toBeVisible();

    // la quête du jour est proposée : rien n'est accepté d'office (une quête « simple » se valide directement)
    const primary = card.getByRole('button', { name: /^(Accepter|Accomplir)$/ });
    await expect(primary).toBeVisible();
    if ((await primary.textContent())?.trim() === 'Accepter') {
      await primary.click();
      await expect(page.getByText(/Quête acceptée/)).toBeVisible();
    }

    // on l'ouvre et on la valide (le type dépend de l'échelon : simple, compteur ou étapes)
    await card.getByRole('button', { name: /^Voir la quête/ }).click();
    if (await validateOpenQuest(page)) {
      await expect(page.getByText(/XP gagnés/)).toBeVisible();
      // l'enregistrement local est différé (150 ms) : on laisse le temps d'écrire avant de recharger la page
      await page.waitForTimeout(600);
      await page.goto('/tabs/quests');
      await expect(page.locator('lu-track-card').filter({ hasText: 'Muscu haut du corps' }).getByText('Fait aujourd’hui')).toBeVisible();
      await expect(page.locator('lu-track-card').filter({ hasText: 'Muscu haut du corps' }).getByText('1/5 jours validés')).toBeVisible();
      await expect(page.getByText('Parcours du jour validés')).toBeVisible();
    }
  });

  test('les quêtes hebdomadaires s’acceptent', async ({ page }) => {
    // on ne peut plus accepter une quête de la semaine après le vendredi : on fige la date au mercredi 7 octobre 2026
    await page.clock.setFixedTime(new Date('2026-10-07T10:00:00+02:00'));
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
    // la seconde tentative rapporte moins d’XP (dégressivité des répétitions) ; héros Éclaireur (maîtrises FOR et CON), scores équilibrés : aucun facteur d’équilibrage
    const second = questXp({ difficulty: 'easy', period: 'daily', ability: 'CON', level: 1, masteries: ['FOR', 'CON'], repeat: 1 }).total;
    await expect(page.locator('.chips').getByText(`+${second} XP`)).toBeVisible();
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
    await expect(page.getByText(`Force ${TIER3_MIN_SCORE} requis (tu es à ${BALANCED_SCORES.FOR})`)).toBeVisible();
    await expect(page.getByText(`Niveau ${TIER4_MIN_LEVEL} requis (tu es niveau 1)`)).toBeVisible();
    await expect(page.getByRole('button', { name: /Niveau 3 · Mois/ })).toBeDisabled();
    await page.getByRole('button', { name: /Niveau 1 · Journée/ }).click();
    await expect(page.getByText('Pompes, 20 aujourd’hui')).toBeVisible();
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
    await expect(page.getByText('Salsa, un cours aujourd’hui')).toBeVisible();
    await expect(page.getByText(/Répartition de l’XP : Dextérité 60 %/)).toBeVisible();
  });

  test('le Grimoire liste les quêtes par chapitre et se filtre', async ({ page }) => {
    await createHero(page);
    await page.goto('/grimoire');
    await expect(page.getByText(`0/${catalogCount('FOR')} quêtes essayées`).first()).toBeVisible();
    await page.getByPlaceholder('Chercher une quête…').fill('pompes');
    await expect(page.getByText('Pompes, 20 aujourd’hui')).toBeVisible();
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

  test('photo + message : la publication part même après avoir quitté le champ de texte', async ({ page }) => {
    await createHero(page);
    await page.goto('/publish');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Galerie' }).click();
    await (await chooser).setFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    });
    await expect(page.getByAltText('Photo à partager')).toBeVisible();
    await page.getByLabel(/Ton message/).fill('Ma première victoire');
    // le clic sur « Publier » fait perdre le focus au textarea : son `change` natif remonte jusqu'au formulaire
    await page.getByRole('button', { name: 'Publier' }).click();
    await expect(page.getByText('Publié pour tes amis !')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fil des amis' })).toBeVisible();
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
