# Boutique et collection « Bestiaire & Reliques »

Deux ajouts à l'onglet Aventure : acheter des coffres avec des fragments, et collectionner des cartes D&D trouvées dans les coffres.

## 1. Boutique (fragments → coffres)

| Coffre | Prix |
|---|---|
| Bois | 25 🔹 |
| Bronze | 75 🔹 |
| Argent | 225 🔹 |

- Les prix valent trois coffres du rang inférieur : acheter ne revient jamais moins cher que fusionner.
- Un coffre acheté rejoint les coffres fermés (source `shop`). Le plafond d'ouverture reste de 2 par jour : la boutique alimente le stock, elle ne contourne rien.
- Or et mythique ne sont pas en vente : ils se méritent (séries, échelons, boss, saisons).
- Les fragments viennent de l'expédition, des donjons, du démontage et des doublons de cartes.

Moteur : `shop.ts` (prix), `buyChest` dans `server/adventure-game.ts`. Commande API `shop-buy`.

## 2. Collection (60 cartes)

32 créatures du Bestiaire et 28 objets magiques célèbres (Mimique, Tyrannœil, Tarasque, Sac sans fond, Jeu du destin…).
Répartition : 16 communes, 14 peu communes, 12 rares, 10 épiques, 8 légendaires. Contenu : `packages/content/src/cards.mjs` (génère `cards.fr.json`).

Les cartes n'ont **aucun effet de jeu** : elles n'influencent ni la puissance ni l'équilibre.

### Tirage

Après la rareté (inchangée), le type est tiré : capacité (`SPELL_CHANCE`), puis carte (`CARD_CHANCE`), sinon objet.

| Coffre | Capacité | Carte |
|---|---|---|
| Bois | 0 % | 20 % |
| Bronze | 15 % | 20 % |
| Argent | 22 % | 18 % |
| Or | 30 % | 15 % |
| Mythique | 40 % | 12 % |

- La carte a la rareté tirée pour le coffre.
- Une fois sur deux, on vise d'abord une carte encore inconnue de cette rareté (`CARD_NEW_BIAS`), pour limiter les doublons.
- Un doublon donne +1 exemplaire et des fragments : 1 / 3 / 8 / 20 / 50 selon la rareté.

### Données

Table `cards_owned (profile_id, card_id, copies)` (migration `20261018000001_collection_shop.sql`), lecture seule pour le joueur, écriture par la fonction `game`. `AdventureState` expose `shop` et `collection`.

### Interface

Cartes « Boutique » et « Bestiaire & Reliques » dans l'onglet Aventure ; page `/collection` (grille, filtres Bestiaire / Reliques, cartes inconnues cachées, détail). L'ouverture d'un coffre annonce la carte, en grand pour les épiques et légendaires.
