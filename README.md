# Level Up

Application de développement personnel gamifiée et sociale (Ionic + Angular + Capacitor, back-end Supabase).
Cahier des charges : [docs/Level Up — Cahier des charges.docx](docs/Level%20Up%20—%20Cahier%20des%20charges.docx).

## Structure

| Dossier | Rôle |
|---|---|
| `packages/engine` | Moteur de jeu pur (XP, niveaux, tirage, séries, trophées) + logique serveur (`server/`). Partagé par l'app et les Edge Functions. |
| `packages/content` | Contenu : 240 quêtes, 80 trophées, 8 classes, tavernier, bilans… (JSON générés depuis `src/`). |
| `apps/mobile` | App Ionic/Angular/Capacitor (web PWA, Android, iOS). Maquettes Figma pour l'UI. |
| `supabase` | Migrations SQL + RLS, Edge Functions (`game`, `account`, `push`), seed, tests de base. |

## Démarrer en local (sans Supabase)

```bash
npm install
npm run dev          # http://localhost:4200 — mode démo : données dans le navigateur, compagnons fictifs
```

## Brancher Supabase (mode en ligne)

1. Créer un projet Supabase, **région UE**.
2. `npx supabase link --project-ref <ref>` puis `npx supabase db push` (migrations) et exécuter `supabase/seed.sql`.
3. `npm run gen` (regénère contenu, seed et bundle du moteur serveur), puis
   `npx supabase functions deploy game account push` et
   `npx supabase secrets set CRON_SECRET=… PUSH_WEBHOOK_SECRET=… FCM_SERVICE_ACCOUNT='{…}'` (les deux derniers pour le push).
4. Renseigner `apps/mobile/public/env.js` : `supabaseUrl` et `supabaseAnonKey`.
5. Auth : activer Google / Apple dans le tableau de bord ; ajouter les URL de redirection (`https://<domaine>/auth/callback`, `app.levelup.mobile://callback`).
6. Tâches planifiées : activer `pg_cron` et `pg_net`, puis adapter `migrations/…0003_cron.sql` (tirage toutes les 15 min, purge des comptes).
7. Push : créer un Database Webhook sur `notifications` (INSERT) vers la fonction `push` avec l'en-tête `x-webhook-secret`.

## Mobile

```bash
npm run cap:android   # build + sync + ouvre Android Studio
npm run cap:ios       # (macOS) build + sync + ouvre Xcode
```
Liens d'invitation : héberger `/.well-known/assetlinks.json` et `apple-app-site-association` sur le domaine, puis ajouter la capacité *Associated Domains* dans Xcode.

## Tests

```bash
npm run test:engine   # moteur (118 tests, couverture ≈ 98 %)
npm run test:db       # migrations, RLS, logique de jeu sur le vrai schéma (PGlite)
npm run e2e -w @levelup/mobile   # parcours complets + WCAG 2.1 AA (Playwright + axe)
```

## À faire avant la mise en production

- Faire relire par un juriste les documents de `features/legal/legal.page.ts` (mentions légales à compléter).
- Étendre la liste de mots interdits (`scripts/gen-seed.mjs`) et organiser la modération (traitement sous 48 h).
- Fiches des stores, test fermé Google Play, TestFlight (cf. §11 du cahier des charges).
