import AxeBuilder from '@axe-core/playwright';
import { test } from '@playwright/test';
import { createHero } from './helpers';

// Outil de diagnostic (exécuté à la demande) : affiche le détail des contrastes insuffisants.
test.skip(!process.env['DEBUG_CONTRAST'], 'diagnostic uniquement');

for (const theme of ['dark', 'light']) {
  test(`contrastes ${theme}`, async ({ page }) => {
    await createHero(page);
    for (const p of ['/tabs/tavern', '/tabs/village', '/tabs/hero', '/trophies', '/companions', '/messenger']) {
      await page.goto(p);
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(1500);
      const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
      for (const v of r.violations) {
        for (const n of v.nodes.slice(0, 3)) {
          const d = (n.any[0]?.data ?? {}) as Record<string, unknown>;
          console.log(`${theme} ${p} :: ${n.target.join(' ')} fg=${d['fgColor']} bg=${d['bgColor']} ratio=${d['contrastRatio']} txt=${String(n.html).slice(0, 80)}`);
        }
      }
    }
  });
}
