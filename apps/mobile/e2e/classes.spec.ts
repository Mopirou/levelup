import { expect, Page, test } from '@playwright/test';
import { createHero } from './helpers';

const CLASSES = ['Guerrier', 'Paladin', 'Rôdeur', 'Clerc', 'Barde', 'Roublard', 'Magicien'];
const OLD = /Éclaireur|Aventurier|Artisan|Troubadour|Rassembleur|Érudit|Gardien|Explorateur/;

/** Remet le personnage local dans l'état d'avant la refonte (ancienne classe, ancienne voie), puis recharge l'app. */
async function downgradeToLegacyHero(page: Page, classId: string, pathId: string | null): Promise<void> {
  // l'enregistrement du mode local est différé de 150 ms : on le laisse partir avant de le modifier
  await page.waitForTimeout(600);
  await page.evaluate(
    ([cls, path]) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('levelup-local');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('kv', 'readwrite');
          const kv = tx.objectStore('kv');
          const get = kv.get('game');
          get.onsuccess = () => {
            const row = get.result;
            const ch = row.value.users['local-user'].character;
            ch.classId = cls;
            ch.pathId = path;
            delete ch.classNotice;
            delete ch.classChanged;
            kv.put(row);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [classId, pathId],
  );
  await page.reload();
}

test.describe('Classes D&D', () => {
  test('l’onboarding propose les 7 classes de D&D et aucune ancienne classe', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Continuer avec un e-mail' }).click();
    await page.getByLabel('E-mail').fill('classes@example.fr');
    await page.getByLabel('Mot de passe').fill('MotDePasse42!');
    await page.getByLabel('Année de naissance').fill('1994');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.getByRole('button', { name: 'Commencer' }).click();
    await page.getByRole('button', { name: 'J’ai compris' }).click();
    await page.getByLabel('Nom du personnage').fill('Aldric');
    await page.getByRole('button', { name: 'Continuer' }).click();

    await expect(page.getByRole('heading', { name: 'Choisis ta classe' })).toBeVisible();
    const cards = page.locator('button.class');
    await expect(cards).toHaveCount(7);
    for (const name of CLASSES) await expect(cards.filter({ hasText: name })).toHaveCount(1);
    await expect(page.locator('body')).not.toContainText(OLD);

    await cards.filter({ hasText: 'Magicien' }).click();
    await expect(page.getByRole('dialog', { name: 'Magicien' })).toContainText('Intelligence');
    await expect(page.getByRole('dialog', { name: 'Magicien' })).toContainText('Voie de l’Évocation');
  });

  test('un ancien personnage voit « Ta classe a évolué » et change de classe une seule fois', async ({ page }) => {
    await createHero(page);
    await downgradeToLegacyHero(page, 'erudit', 'erudit-savant');
    await page.locator('ion-tab-button', { hasText: 'Profil' }).click();

    const notice = page.getByTestId('class-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Ta classe a évolué');
    await expect(notice.locator('.copt')).toHaveCount(7);
    // l'ancien Érudit devient Magicien, sur la voie équivalente
    await expect(page.locator('.cls')).toHaveText('Magicien · Voie de l’Évocation');
    await expect(page.getByTestId('class-magicien')).toContainText('Classe actuelle');

    await page.getByTestId('class-barde').click();
    await page.getByRole('button', { name: 'Devenir Barde' }).click();
    await expect(notice).toBeHidden();
    await expect(page.locator('.cls')).toHaveText('Barde · Collège de la Vaillance');

    // l'annonce ne revient pas, même après un rechargement
    await page.waitForTimeout(600);
    await page.reload();
    await page.locator('ion-tab-button', { hasText: 'Profil' }).click();
    await expect(page.locator('.cls')).toHaveText('Barde · Collège de la Vaillance');
    await expect(page.getByTestId('class-notice')).toHaveCount(0);
  });

  test('garder sa classe referme l’annonce sans changer de classe', async ({ page }) => {
    await createHero(page);
    await downgradeToLegacyHero(page, 'gardien', null);
    await page.locator('ion-tab-button', { hasText: 'Profil' }).click();
    await expect(page.locator('.cls')).toHaveText('Clerc');
    await page.getByTestId('class-keep').click();
    await expect(page.getByTestId('class-notice')).toHaveCount(0);
    await expect(page.locator('.cls')).toHaveText('Clerc');
  });
});
