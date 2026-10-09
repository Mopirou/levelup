# Level Up

Application de développement personnel gamifiée et sociale (Ionic + Angular + Capacitor, back-end Supabase).
Cahier des charges : [docs/Level Up — Cahier des charges.docx](docs/Level%20Up%20—%20Cahier%20des%20charges.docx).

## Structure

| Dossier | Rôle |
|---|---|
| `packages/engine` | Moteur de jeu pur (XP, niveaux, tirage, séries, trophées) + logique serveur (`server/`). Partagé par l'app et les Edge Functions. |
| `packages/content` | Contenu : 740 quêtes (240 générales, 500 guidées), 98 succès, 8 classes, tavernier, bilans… (JSON générés depuis `src/`). |
| `apps/mobile` | App Ionic/Angular/Capacitor (web PWA, Android, iOS). Maquettes Figma pour l'UI. |
| `supabase` | Migrations SQL + RLS, Edge Functions (`game`, `account`, `push`), seed, tests de base. |

## Démarrer en local (sans Supabase)

```bash
npm install
npm run dev          # http://localhost:4200 — mode local : données dans le navigateur, sans amis (le social demande le mode en ligne)
```

## Quêtes : tirage, choix et répétition

- **Quota du jour** : chaque jour (et chaque semaine / mois), le moteur tire des quêtes selon le niveau ; réglable dans *Réglages → Rythme*, jusqu'à **0 = mode manuel** (le joueur compose sa journée).
- **Choisir dans le catalogue** : le bouton « Commencer » du Grimoire (action `start`) ajoute la quête à la période en cours, déjà acceptée, hors quota. Les quêtes verrouillées (palier 3/4) restent inaccessibles ; les quêtes du tirage proposées sont simplement acceptées.
- **Refaire** : une quête terminée peut être refaite dans la même période (action `redo`). L'XP est dégressive — 100 %, puis 90 %, 80 %… jusqu'à un plancher de 50 % — avec un plafond par période (jour : 3, semaine : 2, mois et épique : 1) et au plus 8 quêtes ajoutées en cours par jour. Le lendemain, « Refaire » relance la quête dans la nouvelle période.
- Les quêtes choisies ou refaites (`origin` = `chosen` / `redo`) ne comptent pas dans le quota des « journées parfaites », ne peuvent pas être relancées et ne subissent aucune pénalité Hardcore.

## Brancher Supabase (mode en ligne)

1. Créer un projet Supabase, **région UE**.
2. **Migrations automatiques** : définir `SUPABASE_DB_URL` (chaîne de connexion Postgres du projet). `npm run migrate` compare `supabase/migrations` à la table de suivi `supabase_migrations.schema_migrations` (la même que la CLI Supabase), n’applique que les migrations en retard, chacune dans une transaction, puis rejoue `supabase/seed.sql` seulement s’il a changé (catalogue de quêtes, trophées). Rien à faire à la main :
   - `npm run dev` le lance au démarrage (sans `SUPABASE_DB_URL`, il ne fait rien) ;
   - `.github/workflows/deploy.yml` le lance à chaque push sur `main` (secrets `SUPABASE_DB_URL`, et en option `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` pour redéployer les Edge Functions).
   La migration `20261010000001_quest_runs.sql` ajoute les quêtes refaisables (`run`, `origin`) et le mode manuel (0 quête tirée par jour) : elle est appliquée automatiquement.
3. `npm run gen` (regénère contenu, seed et bundle du moteur serveur), puis
   `npx supabase functions deploy game account push` et
   `npx supabase secrets set CRON_SECRET=… PUSH_WEBHOOK_SECRET=… FCM_SERVICE_ACCOUNT='{…}'` (les deux derniers pour le push).
4. Renseigner `apps/mobile/public/env.js` : `supabaseUrl` et `supabaseAnonKey`.
5. Auth : connexion par e-mail et mot de passe uniquement (pas de Google/Apple). Dans *Authentication → URL Configuration*, mettre l’URL du site dans *Site URL* et ajouter `https://<domaine>/auth/callback` aux *Redirect URLs* (confirmation d’e-mail, lien magique).
6. Tâches planifiées : activer `pg_cron` et `pg_net`, puis adapter `migrations/…0003_cron.sql` (tirage toutes les 15 min, purge des comptes).
7. Push : créer un Database Webhook sur `notifications` (INSERT) vers la fonction `push` avec l'en-tête `x-webhook-secret`.

## Mettre le site en ligne (gratuit)

Netlify (ou Cloudflare Pages) : importer le dépôt GitHub, la configuration est dans `netlify.toml`. Définir les variables `SUPABASE_URL` et `SUPABASE_ANON_KEY` (clé *anon public*, jamais *service_role*) : `npm run build:web` les écrit dans `env.js` au moment du build. `apps/mobile/public/_redirects` gère les liens directs (`/auth/callback`, `/companions/…`).

## Mobile

```bash
npm run cap:android   # build + sync + ouvre Android Studio
npm run cap:ios       # (macOS) build + sync + ouvre Xcode
```
Liens d'invitation : héberger `/.well-known/assetlinks.json` et `apple-app-site-association` sur le domaine, puis ajouter la capacité *Associated Domains* dans Xcode.

## Tests

```bash
npm run test:engine   # moteur (138 tests)
npm run test:db       # migrations, RLS, logique de jeu sur le vrai schéma (PGlite)
npm run e2e -w @levelup/mobile   # parcours complets + WCAG 2.1 AA (Playwright + axe)
```

## À faire avant la mise en production

- Faire relire par un juriste les documents de `features/legal/legal.page.ts` (mentions légales à compléter).
- Étendre la liste de mots interdits (`scripts/gen-seed.mjs`) et organiser la modération (traitement sous 48 h).
- Fiches des stores, test fermé Google Play, TestFlight (cf. §11 du cahier des charges).
