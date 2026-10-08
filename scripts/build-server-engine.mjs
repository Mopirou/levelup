// Empaquette packages/engine en un seul module ESM pour les Edge Functions (Deno) :
// un seul moteur de jeu, importé à la fois par l'app et par le serveur.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(root, 'packages', 'engine', 'src', 'index.ts')],
  outfile: join(root, 'supabase', 'functions', '_shared', 'engine.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  loader: { '.json': 'json' },
  legalComments: 'none',
  banner: { js: '// Fichier généré par scripts/build-server-engine.mjs — ne pas modifier à la main.' },
});
console.log('supabase/functions/_shared/engine.mjs généré');
