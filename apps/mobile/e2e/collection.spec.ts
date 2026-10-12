import AxeBuilder from '@axe-core/playwright';
import { expect, Page, test } from '@playwright/test';
import { createHero } from './helpers';

/** Modifie le personnage / les cartes du mode local (IndexedDB), puis recharge l'app. */
async function patchLocal(page: Page, patch: { fragments?: number; cards?: { cardId: string; copies: number }[] }): Promise<void> {
  // l'enregistrement du mode local est différé de 150 ms : on le laisse partir avant de le modifier
  await page.waitForTimeout(600);
  await page.evaluate(
    (p) =>
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
            const user = row.value.users['local-user'];
            if (p.fragments !== undefined) user.character.fragments = p.fragments;
            if (p.cards) user.cards = p.cards;
            kv.put(row);
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    patch,
  );
  await page.reload();
}

const openAdventure = async (page: Page) => {
  await page.locator('ion-tab-button', { hasText: 'Aventure' }).click();
  await expect(page.getByTestId('pp')).toBeVisible();
};

test.describe('Boutique et collection', () => {
  test('la boutique propose bois, bronze et argent, et bloque l’achat sans assez de fragments', async ({ page }) => {
    await createHero(page);
    await openAdventure(page);
    await expect(page.getByRole('heading', { name: /Boutique/ })).toBeVisible();
    await expect(page.getByTestId('shop').locator('li.crow')).toHaveCount(3);
    for (const r of ['bois', 'bronze', 'argent']) await expect(page.getByTestId(`shop-${r}`)).toBeVisible();
    await expect(page.getByTestId('shop-bois')).toContainText('25');
    await expect(page.getByTestId('shop-bronze')).toContainText('75');
    await expect(page.getByTestId('shop-argent')).toContainText('225');
    await expect(page.getByRole('button', { name: /Acheter un coffre Bois/ })).toBeDisabled();
    await expect(page.getByTestId('shop-bois')).toContainText(/il te manque/);
  });

  test('acheter un coffre dépense les fragments et ajoute le coffre au stock', async ({ page }) => {
    await createHero(page);
    await openAdventure(page);
    await patchLocal(page, { fragments: 100 });
    await openAdventure(page);
    await expect(page.getByTestId('shop-fragments')).toContainText('100');
    await page.getByRole('button', { name: /Acheter un coffre Bronze/ }).click();
    await expect(page.getByText(/Coffre bronze acheté pour 75 fragments/)).toBeVisible();
    await expect(page.getByTestId('shop-fragments')).toContainText('25');
    await expect(page.getByRole('button', { name: /Ouvrir un coffre Bronze/ })).toBeVisible();
    // les fragments restants ne suffisent plus pour un bronze
    await expect(page.getByRole('button', { name: /Acheter un coffre Bronze/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Acheter un coffre Bois/ })).toBeEnabled();
  });

  test('la collection est vide au départ : 60 cartes cachées, filtres par type', async ({ page }) => {
    await createHero(page);
    await openAdventure(page);
    await expect(page.getByTestId('collection-count')).toContainText('0/60');
    await page.getByTestId('open-collection').click();
    await expect(page.getByRole('heading', { name: 'Bestiaire & Reliques', level: 1 })).toBeVisible();
    await expect(page.getByTestId('collection-progress')).toContainText('0 / 60');
    await expect(page.getByTestId('card-grid').locator('li')).toHaveCount(60);
    await expect(page.getByRole('group', { name: /Carte inconnue/ })).toHaveCount(60);
    await page.getByRole('button', { name: /Bestiaire/ }).click();
    await expect(page.getByTestId('card-grid').locator('li')).toHaveCount(32);
    await page.getByRole('button', { name: /Reliques/ }).click();
    await expect(page.getByTestId('card-grid').locator('li')).toHaveCount(28);
  });

  test('une carte obtenue se révèle dans la collection, avec ses exemplaires et son détail', async ({ page }) => {
    await createHero(page);
    await openAdventure(page);
    await patchLocal(page, { cards: [{ cardId: 'mimique', copies: 3 }, { cardId: 'gobelin', copies: 1 }] });
    await page.goto('/collection');
    await expect(page.getByTestId('collection-progress')).toContainText('2 / 60');
    await expect(page.getByRole('group', { name: /Carte inconnue/ })).toHaveCount(58);
    const mimic = page.getByTestId('card-mimique');
    await expect(mimic).toContainText('Mimique');
    await expect(mimic).toContainText('×3');
    await expect(mimic).toHaveAccessibleName(/Mimique, Rare, 3 exemplaires/);
    await mimic.click();
    await expect(page.getByTestId('card-detail')).toContainText('Mimique');
    await expect(page.getByTestId('card-detail')).toContainText('Rare');
    await expect(page.getByRole('dialog')).toContainText('3 exemplaires');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`accessibilité WCAG 2.1 AA — boutique et collection, thème ${theme === 'dark' ? 'sombre' : 'clair'}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await createHero(page);
      await openAdventure(page);
      await patchLocal(page, { fragments: 60, cards: [{ cardId: 'tyrannoeil', copies: 1 }, { cardId: 'torche', copies: 2 }, { cardId: 'sac-sans-fond', copies: 1 }] });
      for (const url of ['/tabs/adventure', '/collection']) {
        await page.goto(url);
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await expect(page.locator(url === '/collection' ? '[data-testid=card-grid]' : '[data-testid=shop]')).toBeVisible();
        await page.waitForTimeout(800);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['region']).analyze();
        expect(r.violations.map((v) => `${v.id} (${v.impact}) : ${v.nodes[0]?.target?.join(' ')}`), url).toEqual([]);
      }
    });
  }
});
