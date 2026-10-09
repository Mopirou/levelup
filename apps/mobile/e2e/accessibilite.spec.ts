import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createHero } from './helpers';

const PAGES = ['/tabs/tavern', '/tabs/quests', '/tabs/village', '/tabs/hero', '/tabs/chronicle', '/grimoire', '/trophies', '/settings', '/companions', '/messenger'];

async function audit(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['region']).analyze();
  return r.violations.map((v) => `${v.id} (${v.impact}) — ${v.nodes.length} élément(s) : ${v.nodes[0]?.target?.join(' ')}`);
}

for (const theme of ['dark', 'light'] as const) {
  test(`WCAG 2.1 AA — thème ${theme === 'dark' ? 'sombre' : 'clair'}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await createHero(page);
    const problems: string[] = [];
    for (const p of PAGES) {
      await page.goto(p);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(1200);
      for (const v of await audit(page)) problems.push(`${p} : ${v}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
}

test('aucun défilement horizontal de 360 à 430 px', async ({ page }) => {
  await createHero(page);
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    for (const p of PAGES) {
      await page.goto(p);
      await page.waitForTimeout(600);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${p} à ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});
