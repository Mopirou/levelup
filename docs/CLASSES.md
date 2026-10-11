# Classes D&D et butin de classe (V4)

Complète `DONJONS.md`. Remplace les 8 classes actuelles par **7 classes classiques de D&D**, chacune avec son butin (armes, tenues, sorts, capacités) fidèle à l'univers.
Source de vérité de la V4. Les noms de sorts et d'objets viennent du SRD 5e en français ; l'agent de contenu les vérifie (recherche web) avant de les figer.

## 1. Principes

1. **Fidélité D&D** : pas d'objet au hasard. Un Guerrier trouve des épées à deux mains et des harnois ; un Paladin son Châtiment divin ; un Magicien sa Boule de feu.
2. **Chaque classe a 2 caractéristiques de maîtrise** qui collent à son rôle (le bonus de maîtrise du moteur s'y applique, comme aujourd'hui).
3. **Équilibre mesuré, pas supposé** : toutes les classes ont la même structure de butin et la même « enveloppe de puissance » ; un test automatique le vérifie (§6).
4. **Aucun visuel à produire** : glyphe emoji + couleur de rareté, comme le reste.

## 2. Les 7 classes

| Classe | Maîtrises | Rôle D&D | Style de jeu dans l'app |
|---|---|---|---|
| ⚔️ **Guerrier** | FOR, CON | Combattant robuste | Endurance, sport, régularité |
| 🔨 **Paladin** | FOR, CHA | Combattant sacré | Force + présence : dégâts de boss et coopération |
| 🏹 **Rôdeur** | DEX, SAG | Chasseur, nature | Agilité + attention : expéditions et exploration |
| 🌿 **Clerc** | SAG, CON | Soigneur divin | Résilience et sérénité : donjons profonds |
| 🎵 **Barde** | CHA, DEX | Charismatique polyvalent | Social et créativité : raids, encouragements |
| 🗡️ **Roublard** | DEX, INT | Agile et rusé | Débrouille : or, butin, clés |
| 🔮 **Magicien** | INT, CON | Lanceur de sorts érudit | Apprentissage : sorts, XP d'étude |

**Couverture des caractéristiques** (14 places de maîtrise) : FOR 2, DEX 3, CON 3, INT 2, SAG 2, CHA 2. Aucune caractéristique n'est ignorée et aucune n'est monopolisée. (DEX et CON ont une place de plus, car elles servent de seconde maîtrise à des classes de soutien.)

Chaque classe garde **2 voies** (au niveau 3), d'affinités différentes, dont la caractéristique peut recouper une maîtrise. Identifiants fixes `{classe}-{voie}` (V4a, `packages/content/src/classes.mjs`) :

| Classe (id) | Voie 1 | Voie 2 |
|---|---|---|
| `guerrier` | `guerrier-champion` (FOR) | `guerrier-chevalier` (CHA) |
| `paladin` | `paladin-devotion` Serment de Dévotion (SAG) | `paladin-vengeance` Serment de Vengeance (FOR) |
| `rodeur` | `rodeur-chasseur` (FOR) | `rodeur-belluaire` Maître des bêtes (CON) |
| `clerc` | `clerc-vie` Domaine de la Vie (CON) | `clerc-savoir` Domaine du Savoir (INT) |
| `barde` | `barde-vaillance` Collège de la Vaillance (FOR) | `barde-savoir` Collège du Savoir (INT) |
| `roublard` | `roublard-voleur` (CHA) | `roublard-assassin` (SAG) |
| `magicien` | `magicien-evocation` (INT) | `magicien-abjuration` (SAG) |

Les icônes de classe sont des emojis (champ `icon`). Chaque classe a 3 quêtes favorites (titres du catalogue, d'une de ses maîtrises) ; `gen-content` vérifie que chaque caractéristique est maîtrisée par 2 ou 3 classes et qu'aucune discipline n'est orpheline.

## 3. Butin de classe : même structure pour tout le monde

### 3.1 Équipement de classe (V4b, implémenté)
- **Panoplie de classe** : 6 pièces (arme, tête, torse, mains, bottes, amulette) ⇒ 7 × 6 = **42 modèles**, plus **12 objets universels** (2 par emplacement) ⇒ **54 modèles** (`items.mjs`, champ `classId` ; `null` pour un universel). Les 54 modèles couvrent les 6 caractéristiques dans chaque emplacement, et chaque classe a 3 pièces dans chacune de ses deux maîtrises. Noms français du SRD 5e / des règles officielles (aidedd.org) ; les noms des pièces de classe ci-dessous sont figés.

| Classe | Arme | Tête | Torse | Mains | Bottes | Amulette |
|---|---|---|---|---|---|---|
| ⚔️ Guerrier | Espadon (FOR) | Heaume (CON) | Harnois (FOR) | Gantelets de puissance d’ogre (FOR) | Bottes de marche et de saut (CON) | Amulette de santé (CON) |
| 🔨 Paladin | Marteau de guerre (FOR) | Heaume de brillance (CHA) | Cotte de mailles (FOR) | Gantelets de serment (CHA) | Sabatons bénis (FOR) | Reliquaire (CHA) |
| 🏹 Rôdeur | Arc long (DEX) | Capuchon de pisteur (SAG) | Armure de cuir clouté (DEX) | Gants de nage et d’escalade (DEX) | Bottes elfiques (SAG) | Médaillon de pensées (SAG) |
| 🌿 Clerc | Masse d’armes (SAG) | Mitre (CON) | Robe consacrée (CON) | Mitaines de bénédiction (SAG) | Sandales de pèlerin (CON) | Symbole sacré (SAG) |
| 🎵 Barde | Rapière (DEX) | Chapeau de déguisement (CHA) | Pourpoint de velours (CHA) | Gants de ménestrel (DEX) | Bottes de danse (DEX) | Luth (CHA) |
| 🗡️ Roublard | Dagues jumelles (DEX) | Capuche de voleur (INT) | Armure de cuir (DEX) | Outils de voleur (INT) | Souliers de velours (DEX) | Amulette de protection contre la détection (INT) |
| 🔮 Magicien | Bâton du mage (INT) | Chapeau de sorcier (INT) | Robe d’archimage (CON) | Bracelets de défense (CON) | Bottes de lévitation (CON) | Grimoire (INT) |

Objets universels (sans classe) — arme : Gourdin de voyageur (CON), Sceptre de héraut (CHA) ; tete : Bandeau de combattant (FOR), Chapeau de voyageur (DEX) ; torse : Veste d’érudit (INT), Manteau de pèlerin (SAG) ; mains : Gants de travail (FOR), Anneau de protection (CON) ; bottes : Pantoufles d’érudit (INT), Bottes d’apparat (CHA) ; amulette : Talisman de force (FOR), Pierre de chance (DEX).

- **Affinité** : un objet de sa classe donne **+20 % de PP** (`ITEM_AFFINITY_BONUS = 0.2`, remplace le +10 % basé sur les maîtrises). Les objets des autres classes et les universels s'équipent sans bonus. L'affinité se lit sur la classe du **modèle** (`InventoryItem.classId`, calculé à la lecture depuis `items.fr.json`, jamais stocké), pas sur sa caractéristique. `ItemView` porte `classId` et `affinity`.
- **Panoplie de classe** : 7 sets (un par classe, id du set = id de la classe, 6 pièces). Bonus identiques pour les 7 classes à 2 / 4 / 6 pièces : **+5 / +12 / +25 PP**, avec en plus le bonus de score d'aventure existant (+1 / +3 / +6) sur la **première maîtrise** de la classe (*écart avec la première version de la spec, qui ne parlait que de PP : conservé pour ne pas casser la V3 ; il est identique pour toutes les classes et n'entre pas dans l'équilibre*). Les 42 objets de classe sont les pièces des sets ; les 12 universels sont hors set.
- L'ancien identifiant `cotte-de-mailles` (torse CON) est repris dans la migration (§4b) ; le nouvel objet du Paladin s'appelle donc `cotte-de-mailles-paladin`.

### 3.2 Sorts et capacités de classe : 8 par classe (V4b, implémenté)
Nouveau type de butin (Grimoire de **3 emplacements**). **Chaque classe a exactement 8 capacités** : 2 communes, 2 peu communes, 2 rares, 1 épique, 1 légendaire ⇒ **56** au total (`spells.mjs` → `spells.fr.json`). Un joueur équipe jusqu'à 3 capacités, de n'importe quelle classe, mais celles de sa classe donnent **+25 %** d'effet. Entre parenthèses : la famille d'effet (§3.3).

Noms vérifiés sur aidedd.org (SRD 5e en français, règles 2014/2024) : sorts (Boule de feu, Éclair, Mur de force, Souhait, Projectile magique, Mot de guérison, Soins, Arme spirituelle, Flamme sacrée, Moquerie cruelle, Motif hypnotique, Marque du chasseur, Passage sans trace, Suggestion, Fou rire de Tasha, Mot de pouvoir étourdissant / mortel, Résurrection) et capacités de classe (Second souffle, Style de combat, Fougue, Attaque supplémentaire, Inflexible, Critique amélioré, Athlète accompli, Imposition des mains, Sens divin, Châtiment divin, Aura de protection, Arme sacrée, Nimbe sacré, Ennemi juré, Fin explorateur, Voile de la nature, Tueur implacable, Intervention divine, Contre-charme, Expertise, Ruse, Esquive instinctive, Esquive totale, Coup de chance…).

| Classe | Commun | Peu commun | Rare | Épique | Légendaire |
|---|---|---|---|---|---|
| ⚔️ Guerrier | Second souffle (Donjon), Style de combat (Score) | Critique amélioré (XP), Athlète accompli (XP) | Fougue (Raid), Attaque supplémentaire (Score) | Inflexible (XP) | Triple attaque supplémentaire (Raid) |
| 🔨 Paladin | Imposition des mains (Donjon), Sens divin (Score) | Bénédiction (XP), Protection contre le mal et le bien (XP) | Châtiment divin (Raid), Aura de protection (Donjon) | Frappes radiantes (XP) | Nimbe sacré (Raid) |
| 🏹 Rôdeur | Marque du chasseur (Raid), Ennemi juré (Score) | Fin explorateur (XP), Passage sans trace (XP) | Proie du chasseur (Butin), Tactiques défensives (Donjon) | Voile de la nature (XP) | Tueur implacable (Or) |
| 🌿 Clerc | Flamme sacrée (Score), Soins (Donjon) | Arme spirituelle (XP), Mot de guérison (XP) | Esprits gardiens (Donjon), Frappes bénies (Raid) | Résurrection (XP) | Intervention divine (Donjon) |
| 🎵 Barde | Moquerie cruelle (Raid), Inspiration bardique (Score) | Fou rire de Tasha (XP), Contre-charme (XP) | Suggestion (Or), Motif hypnotique (Butin) | Mot de pouvoir étourdissant (XP) | Mot de pouvoir mortel (Raid) |
| 🗡️ Roublard | Attaque sournoise (Raid), Expertise (Score) | Ruse (XP), Esquive instinctive (XP) | Savoir-faire (Or), Esquive totale (Donjon) | Assassinat (XP) | Coup de chance (Butin) |
| 🔮 Magicien | Projectile magique (Raid), Lumière (Score) | Mains brûlantes (XP), Bouclier (Donjon) | Boule de feu (Raid), Éclair (XP) | Mur de force (Donjon) | Souhait (XP, toutes maîtrises) |

*Corrections de noms par rapport au tableau provisoire de la première version* : « Sursaut d'action » devient **Fougue** (nom des règles françaises), « Indomptable » devient **Inflexible**, « Maître d'armes » / « Frappe puissante » / « Posture défensive » (inventés) cèdent la place à des capacités du Guerrier ou du Champion (Style de combat, Critique amélioré, Athlète accompli, Triple attaque supplémentaire) ; « Châtiment suprême » et « Avatar divin » deviennent **Frappes radiantes** et **Nimbe sacré** ; « Épée sacrée » devient **Arme sacrée** ; « Cordon d'épines », « Tir précis », « Flèche éclair », « Pas de brume », « Tueur de géants » et « Chasse sauvage » (non rôdeurs ou inventés) deviennent Ennemi juré, Fin explorateur, Passage sans trace, Proie du chasseur, Tactiques défensives, Voile de la nature et Tueur implacable ; « Gardiens spirituels » devient **Esprits gardiens** ; « Chant de l'éternité » et « Main de la fortune » (inventés) deviennent **Mot de pouvoir mortel** et **Coup de chance** (capacité de niveau 20 du Roublard, donc légendaire). La rareté suit le niveau d'accès D&D de la capacité (cantrips et niveau 1 communs, sorts de niveau 8-9 épiques/légendaires). **Châtiment divin** est une capacité *rare* du Paladin (et non peu commune) pour rester un coup de boss notable.

### 3.3 Effets des capacités : valeur fixée par la rareté, saveur par la classe
- **Valeur d'effet selon la rareté** (identique pour toutes les classes) : commun 3, peu commun 5, rare 8, épique 12, légendaire 18 (« points d'effet »), multipliés par **(1 + 0,2 × (niveau − 1))** (niveau 1 à 5, ×1,8 au maximum) puis par **1,25** si la capacité est de la classe du héros.
- Chaque capacité convertit ses points dans **une famille d'effet** ; la table de conversion est unique :

| Famille | Effet de N points (déjà multipliés par niveau et classe) |
|---|---|
| XP de caractéristique (`xp`) | +N % d'XP sur la caractéristique visée (une maîtrise de la classe) ; `ability: all` (Souhait) : N / 2 % sur **chacune** des maîtrises du héros |
| Caractéristique d'aventure (`stat`) | +floor(N / 4) au score (aventure uniquement : expédition, coffres, donjons, raids ; jamais l'XP de progression) |
| Dégâts de boss (`raid`) | +N % de dégâts de raid (coup quotidien) |
| Or d'expédition (`gold`) | +N % d'or d'expédition |
| Chance de coffre (`chest`) | décale la rareté de l'objet d'un coffre de N / 4 points de probabilité (comme la SAG : de la rareté la plus basse vers la plus haute) |
| Survie de donjon (`dungeon`) | +N / 2 % de CON effective (`conBonusPct`) |

- **PP des capacités** : chaque capacité équipée ajoute aussi `round(N)` PP à la puissance (comme un objet : `powerBreakdown.spells`), sans double compte dans la somme des scores.
- **Plafonds anti-dérive** (`spellBonuses`) : XP ≤ +25 % par caractéristique ; raid, or, survie de donjon ≤ +30 % ; chance de coffre ≤ 30 points de probabilité.
- **Doublons** : une capacité déjà possédée monte d'un niveau (1 à 5) ; au niveau 5, le doublon rend des fragments (commun 4, peu commun 10, rare 24, épique 60, légendaire 160).
- **Branchements** : XP des quêtes (`completeQuest` reçoit `abilityXpBonus`, appliqué *après* l'équilibrage rattrapage/spécialisation, sur chaque part ; les retraits d'annulation ne sont jamais modifiés, les événements d'XP enregistrent les montants versés) ; `heroPower` et `adventureScores` (`stat`) ; `expeditionYield` (`goldBonusPct`) ; `raidBaseDamage` (`spellBonusPct`) ; `resolveDungeon` (`conBonusPct`) ; `adjustedOdds`/`drawChest` (`chestShift`).

### 3.4 Dans les coffres (V4b, implémenté)
- Tirage en trois étapes, déterministe (même graine que V1) : (1) **rareté** de ce que contient le coffre (tableau de la V1, décalage SAG et capacités de chance, pitié inchangée : une capacité tirée compte pour la pitié comme un objet de même rareté) ; (2) **type** : objet d'équipement ou capacité, avec une probabilité par rareté de coffre — **bois 0 %, bronze 15 %, argent 22 %, or 30 %, mythique 40 %** (`SPELL_CHANCE`) ; (3) **contenu** : pour un objet, **70 % de la classe du joueur, 20 % universel, 10 % d'une autre classe** ; pour une capacité (il n'y a pas de capacité universelle), **80 % de la classe, 20 % d'une autre classe**, toujours à la rareté tirée. Sans classe connue, tirage uniforme.
- La Forge (fusion de 3 objets) tire le modèle de l'emplacement avec les mêmes proportions 70 / 20 / 10.
- Résultat d'ouverture : `ChestOpening = { chest, item: ItemView | null, spell: SpellGain | null, gold, fragments, guaranteed, opensToday }` ; `SpellGain = { spell: SpellView, isNew, levelBefore, fragments }`. Une capacité obtenue n'est jamais équipée d'office.
- L'interface annonce une capacité rare ou mieux en grand (« ✨ Boule de feu ! ») avec une phrase d'ambiance, et dit si c'est une nouveauté, un niveau gagné ou des fragments.

## 4. Migration des personnages existants

Table de correspondance appliquée par la migration (aucun personnage ne perd de niveau, d'XP, de série ni d'objet) :

| Ancienne classe | Nouvelle classe |
|---|---|
| Éclaireur (FOR, CON) | Guerrier |
| Rassembleur (CON, CHA) | Paladin |
| Aventurier (FOR, DEX) | Rôdeur |
| Explorateur (CON, SAG) | Clerc |
| Troubadour (DEX, CHA) | Barde |
| Artisan (DEX, INT) | Roublard |
| Érudit (INT, SAG) | Magicien |
| Gardien (SAG, CHA) | Clerc |

- Les voies déjà choisies sont remplacées par la voie équivalente de la nouvelle classe (même caractéristique si possible, sinon la première voie). Table complète : `packages/engine/src/legacy-classes.ts`, appliquée à l'identique par `supabase/migrations/20261016000001_classes.sql` (un test compare les deux).
- À sa prochaine connexion, le joueur voit « Ta classe a évolué » (fiche Héros) et peut **la changer une fois, gratuitement** parmi les 7.
- `characters.class_id`, `path_id`, les titres et le contenu `classes.fr.json` (entièrement réécrit, quêtes favorites comprises) sont migrés. Le titre « Rassembleur » (trophée Vingt amis) devient « Cœur de la compagnie » ; le trophée « Explorateur du catalogue » devient « Fouilleur du catalogue ».
- **Mise en œuvre de la reclassification** (V4a) : colonnes `characters.class_notice` (annonce à afficher, levée uniquement pour les personnages migrés ; défaut `false`, les nouveaux personnages ne la voient pas) et `characters.class_changed` (reclassification gratuite utilisée). Action `class-change { classId }` (moteur `changeClass`, Edge `game`, `GameService.changeClass`, stores supabase/mémoire/local) : autorisée si `class_notice` et pas `class_changed`, sinon `forbidden`. Choisir sa classe actuelle referme simplement l'annonce sans consommer le changement ; changer de classe consomme le changement, remet la voie à la 1re voie de la nouvelle classe si une voie était déjà choisie (sinon elle reste à choisir au niveau 3). Les colonnes ne sont pas modifiables par le joueur (seule l'Edge Function y écrit).
- Mode local (IndexedDB) : les anciens personnages sont migrés au chargement avec la même table (`migrateLegacyClass`).

## 5. Contenu à produire (`packages/content/src/`)
- `classes.mjs` : 7 classes (description, maîtrises, 2 voies, quêtes favorites), à la place des 8 actuelles.
- `items.mjs` : 54 modèles (42 de classe + 12 universels), champ `classId` (7e colonne).
- `sets.mjs` : 7 panoplies de classe (id = id de la classe) et `SET_BONUSES` (+5/+12/+25 PP).
- `spells.mjs` : 56 capacités (8 × 7) : `classId`, `rarity`, `family`, `ability` (ou `all`), `glyph`, `blurb`. `gen-content` valide les 54 modèles (2 universels et 1 objet par classe dans chaque emplacement, 6 caractéristiques par emplacement, 3 pièces par maîtrise), les 7 sets, et les 56 capacités (structure 2-2-2-1-1, XP visant une maîtrise de la classe, chaque caractéristique couverte).
- Mise à jour des trophées, de l'onboarding et des textes qui citent les anciennes classes.

## 6. Équilibre : test automatique obligatoire
Un test de moteur (`packages/engine/test/balance.test.ts`) calcule, pour **chaque classe**, avec son équipement et ses capacités de classe au maximum (6 pièces légendaires niveau 10 de la classe, panoplie complète, et les 3 meilleures capacités de la classe au niveau 5) :
1. la PP maximale atteignable (même héros de référence pour toutes les classes) ;
2. la somme des points d'effet des capacités, au total, pour les 3 meilleures, et par famille (aucune famille > 50 % du total, au moins 4 familles par classe, chaque famille présente chez au moins une classe) ;
3. l'XP bonus maximal possible (meilleur total sur une caractéristique, avec 3 emplacements, avant puis après plafond) ;

et exige que l'**écart entre la meilleure et la moins bonne classe soit ≤ 5 %** sur chacun de ces critères, et que les 7 classes aient exactement le même nombre de modèles (6 pièces, 8 capacités, 2-2-2-1-1), que chaque caractéristique soit maîtrisée par 2 ou 3 classes et que chacune soit couverte par des capacités et des objets. Les différences viennent de la **saveur** (quelle caractéristique, quelle famille), pas de la puissance totale.

**Chiffres obtenus** (héros de référence niveau 20, scores 10) :

| Classe | PP max | dont objets | dont panoplie | dont capacités | Points d'effet (8 capacités) | 3 meilleures | XP max brut → plafonné |
|---|---|---|---|---|---|---|---|
| ⚔️ Guerrier | 2243 | 1872 | 25 | 86 | 62 | 38 | 49,5 % → 25 % |
| 🔨 Paladin | 2243 | 1872 | 25 | 86 | 62 | 38 | 49,5 % → 25 % |
| 🏹 Rôdeur | 2243 | 1872 | 25 | 86 | 62 | 38 | 49,5 % → 25 % |
| 🌿 Clerc | 2243 | 1872 | 25 | 86 | 62 | 38 | 49,5 % → 25 % |
| 🎵 Barde | 2243 | 1872 | 25 | 86 | 62 | 38 | 49,5 % → 25 % |
| 🗡️ Roublard | 2243 | 1872 | 25 | 86 | 62 | 38 | 49,5 % → 25 % |
| 🔮 Magicien | 2243 | 1872 | 25 | 86 | 62 | 38 | 49,5 % → 25 % |

Écart entre classes : **0 %** sur la PP max, le total de points d'effet, les 3 meilleures et l'XP plafonné ; l'XP *avant* plafond est lui aussi identique (la structure d'XP est la même : épique + les deux peu communes pour 6 classes, 22 points ; le Magicien atteint les mêmes 22 points avec Souhait partagé 9 + Éclair 8 + Mains brûlantes 5). Le plafond de +25 % est donc atteint dès que le Grimoire contient les trois meilleures capacités d'XP, quel que soit le niveau des capacités ; c'est voulu (un Grimoire optimisé en XP renonce au raid, à l'or et à la survie).

Points d'effet par famille (niveau 1, sans bonus) — la saveur de chaque classe :

| Classe | XP | Score | Raid | Or | Butin | Donjon | Total |
|---|---|---|---|---|---|---|---|
| ⚔️ Guerrier | 22 | 11 | 26 | 0 | 0 | 3 | 62 |
| 🔨 Paladin | 22 | 3 | 26 | 0 | 0 | 11 | 62 |
| 🏹 Rôdeur | 22 | 3 | 3 | 18 | 8 | 8 | 62 |
| 🌿 Clerc | 22 | 3 | 8 | 0 | 0 | 29 | 62 |
| 🎵 Barde | 22 | 3 | 21 | 8 | 8 | 0 | 62 |
| 🗡️ Roublard | 22 | 3 | 3 | 8 | 18 | 8 | 62 |
| 🔮 Magicien | 31 | 3 | 11 | 0 | 0 | 17 | 62 |

## 7. API et données (implémenté)
- Actions Edge `game` / `GameStore` / `GameService` : `spell-equip { spellId, slot? }` et `spell-unequip { slot | spellId }` (réponse `{ grimoire: GrimoireState, character }`), `engine.equipSpell` / `engine.unequipSpell`. Équiper sans emplacement prend le premier libre (le dernier si le Grimoire est plein), un emplacement occupé est libéré d'abord (un seul sort par emplacement). Le tirage de coffre renvoie `{ item }` ou `{ spell }` (§3.4).
- `adventure-state` ajoute `grimoire` (`slots`, `equipped` — id par emplacement —, `spells: SpellView[]` avec niveau, emplacement, points d'effet et phrase d'effet, `bonus` actifs plafonnés), `heroClass` et `powerBreakdown.spells`.
- Tables : `spells_known(profile_id, spell_id, level 1..5, equipped_slot 1..3 null, created_at)`, clé primaire `(profile_id, spell_id)`, index unique partiel `(profile_id, equipped_slot) where equipped_slot is not null`, RLS en lecture propriétaire, aucune écriture client, cascade à la purge du compte ; `GameStore.listSpells` / `saveSpell` (supabase, mémoire, local). `reset-adventure` vide `spells_known`.
- Le calcul d'XP (`completeQuest`) lit le bonus d'XP des capacités équipées (`heroXpBonus`, plafonné à +25 %).

### 7b. Migration des objets existants
`supabase/migrations/20261017000001_spells.sql` (idempotente) crée `spells_known` et remplace chaque ancien `template_id` (48 anciens modèles) par un modèle de **même emplacement et de même caractéristique** (universel en priorité, sinon un objet de classe, réparti entre les candidats). Rareté, niveau, état équipé, date et caractéristique sont inchangés : aucun objet n'est perdu et il reste au plus un objet équipé par emplacement. Deux anciens identifiants gardent leur nom (`chapeau-de-voyageur`, `talisman-de-force`) ; l'ancien `cotte-de-mailles` (CON) devient `robe-consacree`. Même table côté TypeScript (`LEGACY_ITEM_MAP`, `migrateLegacyItems`) pour le mode local, appliquée à la lecture du store mémoire ; un test vérifie que les deux tables sont identiques.

## 8. Écarts avec la première version de la spec
- Noms de capacités corrigés (§3.2) ; Châtiment divin rare ; Souhait et le reste des capacités d'XP : structure d'XP identique pour les 7 classes (§6).
- Les capacités ajoutent des PP (arrondi des points d'effet) et pas seulement des effets ; la chance de coffre est un décalage en points de probabilité (N / 4), cumulé avec celui de la SAG.
- Contenu d'une capacité : 80 / 20 (pas d'universel) ; chance de capacité par coffre : bois 0, bronze 15, argent 22, or 30, mythique 40.
- Le bonus de score des panoplies (+1/+3/+6) est conservé sur la première maîtrise de la classe.
- `cotte-de-mailles` : l'identifiant de l'objet du Paladin est `cotte-de-mailles-paladin` (l'ancien identifiant est migré).
- L'initial bundle de l'application dépasse de ~70 ko le budget d'avertissement de 1,5 Mo (avertissement seulement, plafond d'erreur à 3 Mo) : le contenu `spells.fr.json` (≈ 14 ko) y contribue ; la division en chunks est un chantier à part.
