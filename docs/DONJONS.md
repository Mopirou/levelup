# Aventure : Puissance, Expédition, Coffres, Équipement, Donjons, Raids

Source de vérité du système « le héros part à l'aventure ». Même esprit que `PARCOURS.md`.
Toute implémentation doit suivre ce document ; en cas d'écart nécessaire, corriger la spec dans le même commit.

## 1. Principes

1. **Peu d'interactions.** Le joueur revient **1 fois par jour, 2 maximum**. Aucun timer court, aucune notification de spam.
2. **La discipline est la source.** Les coffres viennent des quêtes de parcours, pas du temps passé dans l'app.
3. **Peu de coffres, gros loot, raretés.** Un coffre est un événement. Les bons objets exigent d'en accumuler beaucoup (fusion, pitié).
4. **Pas d'achat.** Aucune monétisation. Pas de pay-to-win.
5. **Visuel minimal.** Aucune illustration à produire : chaque objet = un glyphe (emoji/SVG simple) + couleur de rareté + nom. Pas de sprites, pas d'animation de combat.
6. **Évaluation paresseuse.** On stocke des horodatages ; le serveur calcule à la réclamation. Aucun nouveau cron pour V1.
7. **Rien n'est jamais retiré.** Rater un jour ralentit, ne retire jamais d'objet ni de progression.

## 2. Puissance (PP)

```
PP = niveau × 10 + Σ(scores des 6 caractéristiques) + Σ(PP des objets équipés) + PP des bonus de panoplies (§9)
```
- Fonction pure `heroPower(character, equipped, masteries, setBonus)` dans `packages/engine/src/adventure.ts` (`setBonus` vient de `setBonusTotals`, `sets.ts`).
- Rôle de chaque caractéristique (score effectif de la caractéristique) :

| Carac. | Effet |
|---|---|
| FOR | dégâts contre les boss de donjon et de raid |
| DEX | vitesse d'expédition (réduit la durée de cycle) |
| CON | profondeur de donjon atteignable (survie par salle) |
| INT | quantité d'or |
| SAG | qualité des coffres (décale la rareté de l'objet tiré) |
| CHA | bonus de raid (+1 % par point de CHA moyen du groupe aux dégâts de chaque membre, plafonné +30 %) |

## 3. Monnaies et ressources (colonnes sur `characters`)

- `gold` : or (expédition, doublons vendus, donjons). Sert à améliorer les objets et à forger.
- `fragments` : fragments (coffres, démontage). Servent à améliorer un objet (niveau +1 à +5).
- `keys` : Clés de donjon (0..3 en stock, `MAX_KEYS`). Gagnées : +1 par promotion d'échelon, +1 par jalon de série (7 / 30 / 100 jours), et par l'expédition (voir 4). Un stock plein ne dépasse jamais 3.
- `chest_pity` jsonb : compteur de pitié par rareté de coffre (voir 5).

## 4. Expédition (idle)

- Une seule expédition active, **toujours en cours** dès la création du personnage (`expedition_started_at`).
- Rendement : `rate_or_par_h = 20 × (1 + PP/200) × (1 + INT/40)`. Fragments : `rate_frag_par_h = 1 + PP/400`. La **DEX** (score d'aventure) est la vitesse d'expédition : les deux rendements sont multipliés par `1 + DEX/50` (il n'y a pas de « cycle » à raccourcir : le cap de 24 h reste fixe). INT et DEX sont des scores d'aventure (objets équipés compris).
- **Cap d'accumulation : 24 h.** Réclamer remet `started_at = now`. Un bouton « Réclamer » suffit ; en dessous d'une minute d'accumulation, la réclamation est refusée (`nothing-pending`).
- Multiplicateur de série : `1 + min(0.30, 0.02 × streak_current)`.
- L'expédition ne donne **pas de coffres** (les coffres viennent des quêtes) ; elle donne or et fragments, plus 5 % de chance par 24 h de réclamation complète d'une Clé (proportionnelle en dessous, tirée avec une graine déterministe profil + début d'expédition ; sans effet si le stock est plein).

## 5. Coffres

### 5.1 Raretés
`bois` < `bronze` < `argent` < `or` < `mythique`.

### 5.2 Sources (volontairement rares)
| Événement | Coffre |
|---|---|
| Chaque jour de jeu, à la première lecture de l'aventure (source `daily`, clé = jour, aucune quête requise) | `bois` offert |
| 1re quête `origin='track'` validée du jour (1/jour max) | `bois`, ou `bronze` si série >= 7, `argent` si série >= 30 |
| Promotion d'échelon d'un parcours | `bronze` (échelons 1-4), `argent` (5-7), `or` (8-9), `mythique` (10) |
| Jalon de série 7 / 30 / 100 jours | `argent` / `or` / `mythique` |
| Raid vaincu (V2) | `or` pour tous les membres joints, `mythique` si en moins de 4 jours |
| Fin de saison (V3) | `or` pour qui a joué au moins une semaine dans la saison (clé `season` + `S{n}`) |

Les coffres s'accumulent dans l'inventaire (`chests`), sans limite, sans expiration.

**Idempotence** (clé = `source` + `source_key`) : `quest` -> jour de jeu ; `rung` -> `{parcours}:{échelon atteint}` (un coffre par échelon et par parcours, même après une descente) ; `streak` -> `{jalon}:{jour}` ; `dungeon` -> id du donjon ; `merge` -> uuid. Un coffre porte `instance_id` (la quête qui l'a donné) : `undo` retire les coffres encore fermés de cette quête (et la Clé associée pour `rung` et `streak`). Un coffre ouvert ou fusionné est conservé (marqué `opened_at`), sa clé reste prise : annuler puis refaire une quête ne redonne jamais un coffre déjà consommé.

### 5.3 Fusion de coffres (moteur d'envie)
**3 coffres de même rareté -> 1 coffre de rareté supérieure** (action `chest-merge`, instantanée, hors plafond d'ouverture ; les 3 plus anciens sont consommés ; pas de fusion au-delà de mythique). Le joueur choisit : ouvrir maintenant ou accumuler.

### 5.4 Ouverture : max 2 par jour
- **Plafond : 2 ouvertures par `game_date`** (`chest_opens_today`, `chest_opens_date`). Pas de timer d'attente : ouverture immédiate, mais plafonnée.
- Le plafond rend chaque ouverture précieuse et empêche de revenir souvent.

### 5.5 Contenu d'un coffre (gros loot, peu de tirages)
Chaque ouverture donne **1 objet d'équipement** (ou, *V4b*, une capacité de classe : bois 0 %, bronze 15 %, argent 22 %, or 30 %, mythique 40 %, voir `CLASSES.md` §3.4) + des fragments + de l'or. Tableau par rareté de coffre :

| Coffre | Rareté de l'objet (probas %) Commun / Peu commun / Rare / Épique / Légendaire | Fragments | Or |
|---|---|---|---|
| bois | 70 / 25 / 5 / 0 / 0 | 5 | 50 |
| bronze | 35 / 40 / 20 / 5 / 0 | 15 | 150 |
| argent | 5 / 30 / 45 / 18 / 2 | 40 | 400 |
| or | 0 / 5 / 35 / 50 / 10 | 100 | 1000 |
| mythique | 0 / 0 / 10 / 55 / 35 | 250 | 3000 |

- **SAG** (score d'aventure) décale : chaque 10 points de SAG déplace 2 points de probabilité de la rareté **la plus basse du tableau** vers la **plus haute du tableau** (celle du coffre : un coffre de bois n'a jamais d'Épique), sans dépasser la masse de la plus basse ; la somme reste 100.
- **Pitié** : `chest_pity` a deux compteurs par rareté de coffre : `{rareté}` (ouvertures sans objet Épique+) et `{rareté}:legendaire` (sans Légendaire). À 8 ouvertures sans Épique, la suivante garantit Épique (coffres **bronze et au-dessus** : un coffre de bois n'en donne jamais et ne porte pas de pitié) ; à 25 sans Légendaire (coffres **or et mythique** uniquement), la suivante garantit Légendaire. Remis à 0 à l'obtention.
- Tirages avec `createRng` de `random.ts` (graine = `{profil}|chest|{nombre de coffres déjà ouverts}`) pour des tests déterministes. L'ouverture est atomique (`markChestOpened`) : un double appel ne donne qu'un objet.

## 6. Équipement

- **6 emplacements** : `arme`, `tete`, `torse`, `mains`, `bottes`, `amulette`.
- **Raretés** : `commun`, `peu_commun`, `rare`, `epique`, `legendaire` (couleurs gris, vert, bleu, violet, orange).
- **PP d'un objet** : `round(base[rareté] × (1 + 0.1 × niveau_objet) × affinité)` avec base = 5 / 12 / 28 / 60 / 130, `niveau_objet` 0..10.
- Chaque objet porte `ability` (la caractéristique qu'il augmente) : le **bonus de score** de cette caractéristique = `floor(PP_objet / 12)` (s'ajoute au score effectif en jeu d'aventure uniquement -- expédition, coffres, donjons --, **pas** au score de progression/XP du personnage). La somme des scores de la formule de PP (§2) n'inclut **pas** ces bonus, déjà comptés dans le PP des objets.
- **Affinité de classe** : +20 % de PP si l'objet est de la classe du héros (`classId` du modèle ; *V4b, remplace le +10 % basé sur les maîtrises*, voir `CLASSES.md` §3.1). Les objets universels et ceux des autres classes n'ont aucun bonus.
- **Contenu** (`packages/content/src/items.mjs`) : *V4b* 54 modèles (42 de classe + 12 universels, 9 par emplacement) avec `id`, `slot`, `ability`, `name`, `glyph` (un emoji), `blurb`, `classId`. Aucun asset image. (V1 : 48 modèles, 8 par emplacement.)
- **Améliorer** : `niveau_objet +1` coûte `fragments = 5 × (niveau+1)` et `gold = 100 × (niveau+1)^1.5` (arrondi).
- **Fusion d'objets (Forge)** : **3 objets de même rareté -> 1 objet de rareté supérieure** (emplacement de **celui des 3 passé en premier** dans `itemIds`, modèle tiré avec une graine déterministe, niveau 0), jamais au-delà de légendaire. Les objets équipés ne sont pas fusionnables. **Démonter** un objet donne des fragments (`2, 5, 12, 30, 80` selon rareté).
- Un seul objet équipé par emplacement. `equip` remplace.

## 7. Donjons

- 1 donjon par **thème de parcours** (dérivé de `tracks.fr.json`), `packages/content/src/dungeons.mjs`. 5 salles + 1 boss. Puissance de salle : `P(i) = base × 1.35^i`, boss = `P(5) × 1.5`. `base = round(40 × 1.5^(palier-1))`. Les 26 donjons sont rangés par paliers de **4** (7 paliers), débloqués au niveau `3 × palier` (plafonné à 20 : 3, 6, ..., 18, 20). Ordre et contenu dans `dungeons.mjs`.
- **Une run coûte 1 Clé.** Résolue côté serveur, **déterministe** (graine) :
  - Pour chaque salle i : réussit si `PP_eff(i) >= P(i)` avec `PP_eff = PP × (1 + CON/60)` ; sinon la run s'arrête à la salle i.
  - Boss : `PP × (1 + FOR/60) >= boss`.
- **Récompenses** : par salle franchie, `40 × palier` or et `4 × palier` fragments ; le boss vaincu rapporte en plus l'équivalent de 3 salles ; le boss donne 1 coffre (`bronze`, ou `argent` au palier 5+) **une seule fois par donjon** (première victoire : `boss_defeated_tier` >= palier du donjon ; clé de coffre = id du donjon) puis fragments/or.
- Résultat : `DungeonRunResult` avec journal textuel court de salles (« Salle 3 : tu terrasses un Gobelin ancien »), `reachedRoom` (salles franchies, 0..5), `bossDefeated`, `missingPower` (PP manquante pour la salle ou le boss bloquant), `chest`, `gold`, `fragments`, `roomPowers`, `bossPower`. `dungeon_progress.best_room` vaut 0..5, ou 6 si le boss est vaincu.
- Max 1 run par jour utile (limite douce par le stock de Clés, pas de plafond dur).

## 8. Raids d'amis (V2)

Implémentés dans `packages/engine/src/raid.ts` (règles pures) et `packages/engine/src/server/raid-game.ts` (actions).

- **Boss hebdomadaire mondial** : le même pour tous (semaine ISO, liste tournante `RAID_BOSSES`). PV = `10 000 × (1 + 0,15 × (membres − 1))`, membres comptés parmi les **joints** (1 à 6). *Écart avec la première version de la spec (200 000) : même six héros au niveau maximal, tout équipés, infligent environ 5 000 par jour chacun (PP ≈ 2 000, FOR ≈ 50, CHA et encouragements au plafond), soit ~240 000 en une semaine contre 350 000 PV : le boss était imbattable. La base de 10 000 (constante `RAID_BASE_HP`) rend une victoire possible dès le milieu de partie (PP ≈ 400) pour une équipe assidue, et rapide (< 4 jours) pour des héros avancés.*
- **Équipe de 2 à 6 membres, amis acceptés uniquement** (et non bloqués : règle de `can_view_owner`). Le créateur est le **chef** : lui seul invite ; un invité rejoint en acceptant. **Un joueur = une équipe jointe par semaine** (index unique partiel) ; il peut être invité dans plusieurs. Plafond de 6 imposé par la base (trigger). Les invitations en attente ne comptent pas dans le plafond mais le chef ne peut pas en poser plus que de places libres. Une équipe à 1 membre est « en formation » : elle frappe mais ne peut pas gagner.
- **Quitter** : emporte ses dégâts (et ses encouragements donnés). Le chef qui part passe la main au plus ancien membre joint ; une équipe sans membre joint disparaît avec ses invitations. Refuser une invitation = `raid-leave` avec `teamId`. Un raid clos ne se quitte plus (`raid-closed`).
- **Dégâts** : chaque membre inflige, **une fois par jour de jeu, automatiquement** au premier chargement du jour (`raid-state` ou `complete`, sans input) : `floor(PP × (1 + FOR/60) × (1 + bonus CHA du groupe))`, puis × `(1 + encouragements)`. FOR, CHA et PP sont les valeurs d'aventure (objets équipés compris). **Bonus CHA du groupe** = `min(30 %, 1 % × CHA moyen des membres joints)`. Le coup est stocké en deux parties (`base_damage`, `encouragements`) pour pouvoir être augmenté après coup. Un joueur ne frappe qu'une fois par jour toutes équipes confondues (`unique(profile_id, game_date)`) ; un coup hors de la semaine de l'équipe n'est jamais joué.
- **Encouragement** : un coéquipier joint en encourage un autre (**+5 %** de dégâts le jour même, un seul par couple ami/jour, **plafond +25 %** = 5 coéquipiers). Si la cible a déjà frappé aujourd'hui, son coup est recalculé à la hausse ; sinon le bonus s'applique à son coup à venir. Une notification `raid_encouraged`.
- **Récompense** : coffre `or` pour tous les membres joints si le boss tombe, **`mythique` s'il tombe en moins de 4 jours** (jours de jeu écoulés depuis le lundi, aujourd'hui compris : victoire lundi, mardi ou mercredi). Clé d'idempotence du coffre : `source='raid'`, `source_key='{semaine}:{équipe}'` (ex. `2026-W42:<uuid>`).
- **Clôture paresseuse, idempotente** (pas de cron) : à chaque lecture (`raid-state`, `complete`, `raid-*`) le serveur (1) clôt les raids des semaines passées encore ouverts (défaite, ou `void` si l'équipe n'a jamais compté 2 membres : ni récompense ni notification), (2) constate la **victoire dès que les dégâts cumulés atteignent les PV** avec 2 membres au moins (avant de frapper un boss déjà mort), (3) applique le coup du jour. La clôture est atomique (`resolved_at is null`) : les coffres sont versés avant, de façon idempotente, et seul l'appel qui clôt envoie les notifications. PV et dégâts sont figés à la clôture.
- **Notifications** (`notify_user`, une par événement) : `raid_invite` (à l'invité, une fois même si on le ré-invite), `raid_encouraged` (à la cible), `raid_victory` (à chaque membre, à la clôture victorieuse). Préférence `notifPrefs.raid` (activée par défaut ; `false` coupe les trois). Rien d'autre : pas de rappel, pas de notification de défaite.
- **Mode local** : pas d'équipes ; `raid-state` renvoie `available: false` et l'interface n'affiche pas la carte Raid. Les commandes répondent `forbidden`.

## 9. Habillage (V3)

Implémenté dans `packages/engine/src/sets.ts` et `seasons.ts` (règles pures), `server/hero-stats.ts` (puissance et scores d'un héros, panoplies comprises) et `server/season-game.ts` (actions). Contenu : `packages/content/src/sets.mjs` -> `sets.fr.json`.

### 9.1 Panoplies

- *V4b : ces 6 sets par caractéristique sont remplacés par 7 panoplies de classe (id = id de la classe, mêmes paliers +5/+12/+25 PP ; voir `CLASSES.md` §3.1). Le texte suivant décrit la V3 d'origine.*
- **6 sets de 6 pièces** (une par emplacement), **un set par caractéristique** : Titan (FOR), Ombre (DEX), Rempart (CON), Érudit (INT), Aube (SAG), Troubadour (CHA). Une pièce de set a toujours la caractéristique de son set.
- Aucun objet n'a été ajouté : sur les 8 modèles de chaque emplacement, 6 sont des pièces de set (un par caractéristique), **2 restent hors set** (`setId` nul) : 36 pièces, 12 objets libres. Le champ `setId` figure dans `items.fr.json` (généré depuis `sets.mjs`, qui liste les 6 pièces de chaque set). Le tirage de coffres est inchangé : un modèle uniforme parmi les 48, donc 3 chances sur 4 d'obtenir une pièce de set.
- **Bonus** selon le nombre de pièces **équipées** de la panoplie ; le palier atteint **remplace** le précédent (pas de cumul des paliers) :

| Pièces | PP | Bonus de score (caractéristique du set) |
|---|---|---|
| 2 | +5 | +1 |
| 4 | +12 | +3 |
| 6 | +25 | +6 |

- Plusieurs panoplies se cumulent (2 pièces d'un set et 4 d'un autre donnent leurs deux bonus). La rareté de l'exemplaire n'a pas d'effet sur le palier ; seul compte le modèle, dans son propre emplacement.
- Les PP du bonus s'ajoutent à `heroPower` (`powerBreakdown.sets`) ; le bonus de score s'ajoute au score d'aventure (expédition, coffres, donjons, raids), jamais à l'XP, comme les objets. Il n'entre pas dans la somme des scores de la formule de PP (les PP de bonus le couvrent déjà).
- `AdventureState` porte `sets` (par panoplie : pièces possédées et équipées, palier actif, palier suivant) et `setBonus`. `ItemView.setId` indique la panoplie d'un objet.

### 9.2 Portrait

- `lu-portrait` accepte `gear` (6 emplacements) : une **pastille emoji** par emplacement sur l'anneau, bordée de la **couleur de rareté** de l'objet ; un emplacement vide est une pastille pointillée. Aucune illustration, aucun asset. Sans `gear`, le portrait est inchangé (cartes compactes, listes, onboarding). `frameStyle` ajoute le cadre de saison (double anneau de la couleur du cadre et médaille).
- Fiche Héros : l'équipement porté du joueur. Fiche d'un compagnon : son équipement, **uniquement pour un ami non bloqué**, avec sa puissance (« ⚡ n PP »).
- *Écart avec la première version de la spec :* `get_profile_card` n'est pas modifiée (son type composite est partagé par plusieurs fonctions et listes). Une fonction dédiée `get_profile_gear(p_username)` renvoie `{ power, frameStyle, items: [{ slot, templateId, rarity, level }] }` pour soi-même et pour un ami (`can_view_owner`), `null` sinon. Seuls les 6 objets **équipés** sont exposés ; le sac reste privé. Les cartes d'ami des listes restent sans pastilles.

### 9.3 Saisons

- **8 semaines** (56 jours) depuis une date d'ancrage : lundi 2026-09-28 (`SEASON_ANCHOR`). Saison *n* = `S{n}` ; la saison 1 va du 28/09/2026 au 22/11/2026. Calcul pur (`seasonInfo(jourDeJeu)` : clé, bornes, jours restants, semaine, avancement), aucune table de saisons.
- **Puissance publiée** : à chaque lecture de l'aventure (`adventure-state`, `season-state`), après un changement d'équipement (équiper, retirer, améliorer un objet équipé) et après un niveau gagné en validant une quête, le serveur publie la PP du joueur : `characters.power` (carte de compagnon) et `season_scores` (saison en cours : puissance la plus récente, premier et dernier jour de publication). La clôture étant paresseuse, c'est ce cliché qui fait foi.
- **Classement** : le joueur et ses amis acceptés non bloqués qui **acceptent le classement** (`settings.leaderboard_opt_in`, le même réglage que le classement hebdomadaire d'XP), par PP décroissante, rangs partagés en cas d'égalité. Qui refuse n'en voit aucun et n'y figure pas. RPC `season_leaderboard(p_season)` (réservée aux comptes connectés).
- **Récompense** pour qui a **joué au moins une semaine** dans la saison (7 jours de jeu entre sa première et sa dernière publication, garde-fou contre les comptes jetables) : un **coffre d'or** (source `season`, clé `S{n}`) et un **cadre de portrait** : or (1er), argent (2e), bronze (3e) d'un classement d'au moins deux joueurs ; **laurier** pour tous les autres (et pour qui refuse le classement : participation sans rang). Le cadre est stocké dans `characters.frame_style` (`S1:or`), distinct de `frame_color` (choix du joueur) ; le dernier cadre gagné reste affiché.
- **Évaluation paresseuse idempotente** (pas de cron) : à chaque `adventure-state` et `season-state`, pour chaque saison **terminée** où le joueur a un cliché et pas encore de résultat : (1) le coffre d'or est inséré avec la clé fixe `(season, S{n})` (rejoué, il n'est jamais redonné) ; (2) le résultat est écrit une seule fois (`season_results`, clé primaire `(joueur, saison)`, atomique) ; (3) **seul l'appel qui écrit le résultat** applique le cadre et envoie la notification. Une saison sans participation suffisante reçoit un résultat sans récompense ni notification. Les saisons manquées sont évaluées dans l'ordre.
- **Notification** `season_end` (`{ season, name, rank, participants, frame }`), préférence `notifPrefs.season` (activée par défaut), message push dans la fonction `push`. La réponse de `adventure-state` (`seasonEvaluated`) et de `season-state` (`evaluated`) renvoie les résultats évalués par l'appel, pour les annoncer une fois.
- Aucun nouveau réglage de confidentialité. La suppression du compte retire le joueur du classement immédiatement (`deleted_at`), ses lignes de saison partent avec la purge (cascade).
- Mode local : pas d'amis ; la carte Saison affiche le héros seul, les jours restants et la récompense (coffre d'or et cadre de participation distribués comme en ligne).

## 10. API (Edge Function `game`)

Nouvelles actions (écriture via rôle service, voir `supabase/functions/game/index.ts`) :

| Action | Payload | Effet |
|---|---|---|
| `adventure-state` | — | État complet (PP, expédition, coffres, inventaire, ressources, plafond d'ouverture) : `{ state, character }` |
| `expedition-claim` | — | Réclame or/fragments/Clé, remet le compteur |
| `chest-open` | `{ chestId }` | Ouvre (si plafond du jour non atteint) |
| `chest-merge` | `{ rarity }` | 3 coffres -> 1 supérieur |
| `item-equip` / `item-unequip` | `{ itemId }` / `{ slot }` | Équipe / retire |
| `item-upgrade` | `{ itemId }` | Améliore (fragments + or) |
| `item-merge` | `{ itemIds: [a, b, c] }` | 3 objets -> 1 supérieur |
| `item-dismantle` | `{ itemId }` | Démonte |
| `dungeon-list` | — | Donjons + palier débloqué + meilleur résultat |
| `dungeon-run` | `{ dungeonId }` | Consomme 1 Clé, renvoie `DungeonRunResult` |
| `raid-state` | — | `{ state: RaidState }` : boss de la semaine, mon équipe, invitations reçues, dernier résultat ; applique le coup du jour et clôt les raids dus |
| `raid-create` | — | Crée l'équipe de la semaine (chef) |
| `raid-invite` | `{ profileId }` | Le chef invite un ami accepté |
| `raid-join` | `{ teamId }` | Accepte une invitation de la semaine |
| `raid-leave` | `{ teamId? }` | Quitte l'équipe de la semaine, ou refuse l'invitation `teamId` |
| `raid-encourage` | `{ profileId }` | +5 % pour un coéquipier aujourd'hui |
| `season-state` | — | `{ state: SeasonState, character }` : saison en cours (jours restants, semaine), ma PP, mon rang provisoire, la récompense en jeu, saisons passées ; publie la PP et évalue les saisons terminées |

Lecture directe (RPC) : `season_leaderboard(p_season)` (classement entre amis) et `get_profile_gear(p_username)` (équipement et PP d'un ami).

Les coffres de quête sont attribués **dans l'action `complete`** existante (et sur promotion d'échelon / jalon de série), de façon idempotente (clé = `source` + `game_date`), annulés proprement par `undo` s'ils viennent de la quête annulée tant qu'ils ne sont pas ouverts. La réponse de `complete` porte `chests` et `keysGained` quand il y en a.

Codes d'erreur ajoutés à `GameError` : `no-key` (aucune Clé), `daily-cap` (2 ouvertures atteintes), `insufficient` (fragments, or ou coffres insuffisants) ; raids : `no-team`, `team-full`, `not-friends`, `raid-closed`, `already-done` (encouragement déjà donné). Les commandes de raid renvoient toutes `{ state: RaidState }`; le coup du jour joué par `complete` est dans `CompleteResponse.raid` (`RaidHit`). Les autres cas réutilisent `not-found`, `invalid`, `level-too-low`, `nothing-pending`. Les actions sont implémentées dans `packages/engine/src/server/adventure-game.ts` (exporté avec `game.ts`).

## 11. Données (migration `2026MMDD00000N_adventure.sql`, idempotente, RLS, écriture service)

- `characters` : + `gold int`, `fragments int`, `keys int`, `chest_pity jsonb`, `expedition_started_at timestamptz`, `chest_opens_date date`, `chest_opens_today int`.
- `inventory_items(id uuid, profile_id, template_id text, rarity text, slot text, ability text, level int, equipped boolean, created_at)`. Index unique partiel : un seul `equipped` par `(profile_id, slot)`.
- `chests(id uuid, profile_id, rarity text, source text, source_key text, instance_id uuid, created_at, opened_at)`. Unique `(profile_id, source, source_key)` pour l'idempotence.
- `dungeon_progress(profile_id, dungeon_id, best_room int, boss_defeated_tier int, last_run_date)`.
- V2 (migration `20261013000001_raids.sql`, idempotente) : `raid_teams(id, week_start [lundi], leader_id, resolved_at, outcome victory|defeat|void, max_hp, total_damage, victory_day)`, `raid_members(team_id, profile_id, week_start, status invited|joined, invited_by, joined_at)` avec index unique `(profile_id, week_start) where status='joined'` et trigger `raid_members_guard` (6 joints au plus, invité = ami non bloqué du chef), `raid_damage(team_id, profile_id, game_date, damage, base_damage, encouragements)` avec `unique(profile_id, game_date)`, `raid_encouragements(team_id, from_id, to_id, game_date)`. RLS : lecture par les membres de l'équipe (un invité ne voit que l'équipe et sa propre ligne), aucune écriture client. Cascade des membres vers dégâts et encouragements. `raid_detach_profile(uuid)` (service) retire un joueur de ses raids en cours ; elle est appelée par `request_account_deletion` et par `reset-adventure`.
- V3 (migration `20261014000001_seasons.sql`, idempotente) : `characters.power int` et `characters.frame_style text` (`^S[0-9]+:(or|argent|bronze|laurier)$`), non modifiables par le joueur ; source de coffre `season` (contrainte `chests_source_check` recréée) ; `season_scores(profile_id, season_key, power, first_day, last_day)` et `season_results(profile_id, season_key, rank, participants, power, frame, created_at)`, clé primaire `(profile_id, season_key)`, lecture propriétaire, aucune écriture client. Fonctions : `record_season_power`, `_season_rows` et `season_ranking` (rôle service), `season_leaderboard` et `get_profile_gear` (comptes connectés).
- Tout passe par `GameStore` (supabase-store, memory-store, local-backend) : mêmes méthodes partout.

## 12. Tests exigés

- Engine : `heroPower`, rendement d'expédition (cap 24 h), tirage de coffre (distribution, SAG, pitié), fusions, amélioration, résolution de donjon déterministe. Couverture >= 90 %.
- `supabase/tests` : migration, RLS (le client ne peut pas écrire), idempotence des coffres, plafond 2 ouvertures/jour, unicité de l'équipé par emplacement.
- E2E léger : l'onglet Aventure s'affiche, ouverture d'un coffre ; panoplies et carte Saison affichées (`saison.spec.ts`).
- V3 : engine (`sets`, `seasons`, `season-game` : paliers, cumul, PP et scores, calendrier, rangs, récompense, évaluation idempotente, opt-in) ; `supabase/tests` : migration rejouable, RLS (lecture propriétaire, aucune écriture), `season_leaderboard` (amis, opt-in, blocage, compte supprimé, clés invalides), `get_profile_gear` (ami / inconnu / bloqué), idempotence du coffre et du résultat sur le vrai schéma.

## 13. UI (onglet « Aventure »)

- Écran unique, vertical : bandeau PP et ressources ; carte **Expédition** (gain en attente, bouton Réclamer) ; carte **Coffres** (compteurs par rareté, « Ouvrir (x/2 aujourd'hui) », « Fusionner 3 -> 1 ») ; **Équipement** (6 emplacements, liste, améliorer/fusionner/démonter) ; **Donjons** (liste, Clés, bouton Lancer, compte-rendu).
- V3 : sous **Équipement**, une liste **Panoplies** (6 lignes : pièces possédées/équipées en glyphes, paliers 2/4/6 avec une coche aux paliers atteints, `n/6`) ; le détail d'un objet rappelle sa panoplie ; la ligne de puissance ajoute « panoplies n » quand un bonus est actif. La carte **Saison** (`features/season/season-card.component.ts`, chargée à la demande) montre le nom, les jours restants, l'avancement en semaines, le classement entre amis (portraits avec cadre de saison), la récompense en jeu (cadre + coffre d'or), les saisons passées et une bannière « Compris » à la réception d'une récompense. La fiche Héros et la fiche d'un compagnon affichent l'équipement sur l'anneau du portrait.
- Style : glyphes + couleurs de rareté, composants Ionic existants. Libellés FR. Aucune image à produire.
