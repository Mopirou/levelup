import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Les simulations d'un an de tirages sur le catalogue complet (740 quêtes) dépassent 5 s sur une machine chargée.
    testTimeout: 30_000,
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/server/supabase-store.ts', 'src/**/index.ts', 'src/**/*types.ts'], reporter: ['text-summary'] },
  },
});
