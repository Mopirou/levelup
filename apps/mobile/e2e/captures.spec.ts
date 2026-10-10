import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createHero } from './helpers';

// Captures d'écran des écrans principaux (exécutées à la demande : CAPTURES=1).
test.skip(!process.env['CAPTURES'], 'captures sur demande');

const OUT = process.env['CAPTURES_DIR'] ?? 'captures';
const PAGES: [string, string][] = [
  ['tavern', '/tabs/tavern'], ['quests', '/tabs/quests'], ['tracks', '/tracks'], ['village', '/tabs/village'], ['hero', '/tabs/hero'], ['chronicle', '/tabs/chronicle'],
  ['grimoire', '/grimoire'], ['forge', '/forge'], ['trophies', '/trophies'], ['settings', '/settings'], ['companions', '/companions'], ['messenger', '/messenger'], ['publish', '/publish'],
];

test('captures', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await createHero(page, 'Aldric', 'aldric-e2e', [['Musculation', 'Muscu haut du corps']]);
  for (const theme of ['dark', 'light']) {
    for (const [name, path] of PAGES) {
      await page.goto(path);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(1300);
      await page.screenshot({ path: `${OUT}/${theme}-${name}.png`, fullPage: false });
    }
  }
  // détail d'une quête
  await page.goto('/tabs/quests');
  await page.waitForTimeout(800);
  await page.locator('lu-track-card').first().getByRole('button', { name: /^Voir la quête/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/dark-quest-detail.png` });
});
