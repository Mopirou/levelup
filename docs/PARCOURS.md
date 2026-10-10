# Parcours de discipline — spécification

Source de vérité pour la refonte « je choisis où j'évolue ». Les types partagés sont déjà dans
`packages/engine/src/types.ts` (section « Parcours de discipline ») et `packages/engine/src/server/types.ts` (`GameStore.listTracks / saveTrack / deleteTrack`).

## Principe

Discipline (25 existantes) → **parcours** (= une activité de la discipline, 5 par discipline, donc ~125) → **échelons** (10 par parcours) → **quête du jour**.

- Le joueur active jusqu'à `MAX_ACTIVE_TRACKS` (3) parcours. Il peut les mettre en **pause** (échelon gelé, sans pénalité) ou les **arrêter**.
- Chaque jour, pour chaque parcours actif, l'appli propose **la quête de l'échelon courant** (instance `origin = 'track'`, `period = 'daily'`, `status = 'proposed'`). Rien n'est accepté d'office : le joueur l'accepte ou la valide directement.
- Les quêtes du catalogue actuel restent telles quelles (le joueur les aime). Les échelons sont **construits à partir d'elles** (voir Contenu).

## Règles de jeu (valeurs dans `types.ts`)

| Règle | Valeur |
|---|---|
| Parcours actifs max | `MAX_ACTIVE_TRACKS` = 3 |
| Monter d'un échelon | `TRACK_PROMOTE_HITS` = 5 jours validés à l'échelon courant (pas forcément d'affilée) ; `hits` repart à 0 ; `bestRung` mis à jour |
| Descendre d'un échelon | `TRACK_DEMOTE_MISSES` = 4 jours manqués d'affilée sur un parcours actif ; `hits` repart à 0 ; échelon minimum 1 ; au plus −1 par passage de `ensureQuests` puis recomptage |
| Jour manqué | jour de jeu passé, parcours actif, aucune quête du parcours validée ce jour-là, et jour **absent** de `listRestDays`. Un parcours en pause, ou créé il y a moins de 1 jour, ne compte pas de jour manqué. Un parcours ne peut pas descendre en dessous de 1. |
| Série (streak) | un jour compte s'il contient **≥ 1 quête de parcours validée** (`origin = 'track'`). Si le joueur n'a **aucun** parcours actif, repli sur l'ancienne règle (n'importe quelle quête du jour validée). Les jours de repos protègent la série comme avant. |
| Verrou par score | `trackRungMinScore(rung)` : échelons 1-4 → 0, 5-6 → 4, 7-8 → 6, 9-10 → 9 (score de la caractéristique principale). Si le score est insuffisant, la quête du jour reste celle du dernier échelon accessible et l'UI affiche « FOR 6 requis ». La montée n'est pas bloquée côté `hits` mais l'échelon effectif est plafonné (`effectiveRung`). |
| XP | `questXp` avec `period: 'daily'` et la `difficulty` de l'échelon : échelons 1-3 `easy`, 4-6 `medium`, 7-9 `high`, 10 `expert`. Les secondaires du parcours (`secondary`) sont utilisés par `splitXp`. Pas de verrou de niveau global pour `expert` sur un échelon. |
| Quête d'échelon | Gabarit en base : `quest_templates` avec `track_id` et `rung` renseignés, id `{trackId}-r{NN}` (NN sur 2 chiffres, ex. `musculation-muscu-haut-du-corps-r03`). **Jamais tirée par `drawQuests`, jamais dans le catalogue libre du Grimoire** (filtre sur `trackId`). |

### Précisions après revue

- **Série de transition** : la règle « parcours » ne vaut qu'à partir du jour de jeu du premier démarrage de parcours (plus ancien `startedAt`). Avant cette date, n'importe quelle quête validée du jour compte (un joueur en série ne retombe pas à 0). Série record et Inspiration en héritent.
- **Abandon interdit** : une quête de parcours ne s'abandonne pas (`invalid` : « Mets le parcours en pause plutôt que d'abandonner sa quête »). L'arrêt d'un parcours retire sa quête « proposée » du jour (jamais une quête validée ou déjà acceptée).
- **« Trop dur / trop facile » interdit** sur une quête de parcours (`invalid`) : la progression d'échelon remplace ce réglage, et une ancienne préférence `tune` sur un gabarit d'échelon est ignorée.
- **Validation hors ligne** d'une quête de parcours expirée : refusée (`too-late`) si son jour est déjà réglé (`lastCheckedDate` ≥ jour de la quête, parcours actif), sauf le jour de démarrage qui n'est jamais évalué.
- **XP partielle à l'expiration** : une quête de parcours à compteur expirée à ≥ 50 % verse l'XP au prorata comme les autres quêtes, sans équilibrage (rattrapage / spécialisation non appliqués).
- **Parcours orphelins** (état sans aucun gabarit d'échelon) : ne comptent plus dans la limite de 3 et sont supprimés au passage de `ensureQuests` (sauf si aucun gabarit de parcours n'existe du tout).
- **« Propositions par jour »** (`dailyQuestCount`, défaut 2) pilote le nombre de suggestions « Pour aller plus loin » (plafond `MAX_FREE_QUESTS_PER_DAY` = 4 ; 0 = aucune).

### « Pour aller plus loin » (ancien tirage)

`drawQuests` ne sert plus qu'à proposer des quêtes **facultatives** (`origin = 'draw'`, `free = true`, `status = 'proposed'`, jamais acceptées d'office, pas de pénalité, ne comptent ni pour la série ni pour les échelons). Les poids d'intérêts (`interestWeight`) et le bonus « favori » sont retirés ; le tirage privilégie les caractéristiques **les plus basses**. Les périodes hebdo/mensuelle/épique restent tirées mais toutes `proposed`. Le mode hardcore est retiré.

### Économie d'XP (vague 2)

- Rattrapage : l'XP versée à une caractéristique **sous la moyenne des autres de ≥ 1 point** reçoit **+50 %**.
- Spécialisation : l'XP versée à une caractéristique **au-dessus de la moyenne de ≥ 4 points** est multipliée par **0,75** (≥ 7 points : **0,5**).
- Les scores servant au calcul sont ceux **avant** l'attribution. Le montant effectivement versé est celui écrit dans `xp_events` (l'annulation reste symétrique). Le bonus est visible dans la réponse de validation (`CompleteResponse`).

## Contrat d'API

### Moteur (`packages/engine/src/server/game.ts`, exporté par `server/index.ts`)

```ts
startTrack(ctx, userId, { trackId }): Promise<Result<{ track: TrackState }>>      // erreurs : not-found, already-active, too-many-open (au-delà de MAX_ACTIVE_TRACKS), no-character
setTrackPaused(ctx, userId, { trackId, paused }): Promise<Result<{ track: TrackState }>>
stopTrack(ctx, userId, { trackId }): Promise<Result<{ trackId: string }>>          // supprime l'état ; les quêtes passées restent
```

- `ensureQuests` : (1) calcule les jours manqués / descentes, (2) crée **avant** le tirage la quête du jour de chaque parcours actif absente (`origin: 'track'`), (3) tire « Pour aller plus loin ».
- La validation d'une quête de parcours appelle `advanceTrack` (montée/hits) ; l'annulation (`undo`) le défait.
- Nouvelles erreurs possibles : aucune nouvelle `GameError` n'est requise.

### Actions Edge Function `game` (supabase/functions/game/index.ts) et `GameApi` (apps/mobile/src/app/core/api/types.ts)

| action | GameApi |
|---|---|
| `track-start` `{ trackId }` | `trackStart(trackId)` |
| `track-pause` `{ trackId, paused }` | `trackPause(trackId, paused)` |
| `track-stop` `{ trackId }` | `trackStop(trackId)` |

Lecture : `api.store.listTracks()` (RLS). Définitions de parcours : `@levelup/content/tracks.fr.json` (`TrackDef[]`, statique, embarqué dans l'app).

### Base de données

Table `public.tracks` : `profile_id uuid`, `track_id text`, `status text check in ('active','paused')`, `rung int check >= 1`, `hits int`, `last_done_date date null`, `last_checked_date date null`, `best_rung int`, `started_at timestamptz`, clé `(profile_id, track_id)`, RLS lecture pour le propriétaire seulement (écriture réservée au rôle service, comme `quest_instances`). Colonnes ajoutées : `quest_templates.track_id text null`, `quest_templates.rung int null` ; `quest_instances.track_id text null`, `quest_instances.rung int null` ; `origin` accepte `'track'`. L'index unique des tirages `(profile_id, template_id, period, period_start, run)` est conservé. La table `tracks` est vidée par `reset-adventure` et exportée par `exportData`.

## Contenu (`packages/content`)

- Source : `src/tracks.mjs` → `data/tracks.fr.json` (`TrackDef[]`). Un parcours par activité de `src/guided.mjs` (~125), **10 échelons chacun**.
- Les échelons se bâtissent **à partir des quêtes existantes** (palier jour de l'activité = échelon de référence ; semaine/mois/épique donnent les cibles hautes). Les cibles `counter`/`timer` montent progressivement (≈ ×0,5 → ×4, arrondies « naturellement », voir `niceTarget` dans `interests.ts`) ; pour les quêtes `simple` ou `steps`, la progression passe par un chronomètre/compteur ou des étapes ajoutées. Les titres et objectifs doivent rester lisibles, en français, et chaque échelon strictement plus exigeant que le précédent.
- Chaque échelon génère aussi un gabarit (`quest_templates`) via `scripts/gen-seed.mjs`.
- Les disciplines « habitudes » (nutrition, sommeil, mobilité, méditation…) restent des habitudes : jamais de suivi du poids ni de calories.
- Les 740 quêtes actuelles restent inchangées (utilisées par « Pour aller plus loin » et le catalogue).

## Interface (`apps/mobile`)

- **Écran Quêtes** : en haut « Aujourd'hui, mes parcours » (carte par parcours : discipline, échelon n/10, barre de `hits`/5, quête du jour, état verrou score), puis « Pour aller plus loin » (facultatif, bonus de rattrapage visible), puis le catalogue. Plus de section de quêtes imposées.
- **Choix des parcours** (onboarding + Réglages + bouton « + » de l'écran Quêtes) : on part des disciplines, on déplie, on active un parcours (max 3). Remplace le sélecteur d'intérêts (la colonne `settings.interests` reste en base mais n'est plus utilisée).
- **Fiche héros** : bloc « Évolution » (gain d'XP par caractéristique sur 30 jours, parcours actifs avec échelon).
- Mode local (IndexedDB/MemoryStore) et mode cloud se comportent pareil.

## Attribution des fichiers (pas de chevauchement)

| Agent | Possède |
|---|---|
| Contenu | `packages/content/**`, `scripts/gen-content.mjs`, `scripts/gen-seed.mjs`, `supabase/seed.sql` (généré), `packages/engine/test/content.test.ts` |
| Moteur | `packages/engine/src/**` (sauf `types.ts` et `server/types.ts` : ajout seulement, contrat posé), `packages/engine/test/**` (sauf `content.test.ts`) |
| Base & fonctions | `supabase/migrations/**`, `supabase/functions/**` (sauf `_shared/engine.mjs`, généré), `supabase/tests/**` |
| Interface | `apps/mobile/**` |

Le bundle `supabase/functions/_shared/engine.mjs` et le seed se régénèrent avec `npm run gen` (fait en dernier par le coordinateur).
