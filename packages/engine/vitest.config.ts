import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/server/supabase-store.ts', 'src/**/index.ts', 'src/**/*types.ts'], reporter: ['text-summary'] },
  },
});
