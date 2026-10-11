// Équipement (V4) : 54 modèles d'objets = 7 classes D&D × 6 emplacements (42) + 12 objets universels (2 par emplacement).
// Aucune image : un glyphe (emoji), un nom, une rareté donnée au tirage. `ability` est la caractéristique augmentée
// (bonus d'aventure). `classId` désigne la classe pour laquelle l'objet est fait (affinité +20 % de PP) ; `null` = universel.
// Noms français du SRD 5e / des règles officielles. Voir docs/CLASSES.md §3.1 et docs/DONJONS.md §6.
//
// Colonnes : [id, emplacement, caractéristique, nom, glyphe, description, classe]
export default [
  // ───── Armes
  ['espadon', 'arme', 'FOR', 'Espadon', '⚔️', 'Une lame à deux mains que seuls les combattants aguerris savent faire chanter.', 'guerrier'],
  ['marteau-de-guerre', 'arme', 'FOR', 'Marteau de guerre', '🔨', 'Béni avant la bataille, il frappe pour le serment plus que pour la gloire.', 'paladin'],
  ['arc-long', 'arme', 'DEX', 'Arc long', '🏹', 'Portée infinie pour qui sait lire le vent et la forêt.', 'rodeur'],
  ['masse-d-armes', 'arme', 'SAG', 'Masse d’armes', '⚒️', 'Elle assomme sans verser le sang, comme le veulent les temples.', 'clerc'],
  ['rapiere', 'arme', 'DEX', 'Rapière', '🤺', 'Fine, vive, élégante : une réplique aussi tranchante qu’une lame.', 'barde'],
  ['dagues-jumelles', 'arme', 'DEX', 'Dagues jumelles', '🗡️', 'Deux lames, un sourire, et personne n’a rien vu venir.', 'roublard'],
  ['baton-du-mage', 'arme', 'INT', 'Bâton du mage', '🪄', 'Taillé dans un bois ancien, il vibre chaque fois qu’on pense à une formule.', 'magicien'],
  ['gourdin-de-voyageur', 'arme', 'CON', 'Gourdin de voyageur', '🏏', 'Un bon bout de chêne : il tient la route aussi bien que son porteur.', null],
  ['sceptre-de-heraut', 'arme', 'CHA', 'Sceptre de héraut', '🔱', 'Quand on le lève, les conversations s’arrêtent.', null],

  // ───── Casques et couvre-chefs
  ['heaume', 'tete', 'CON', 'Heaume', '🪖', 'Un casque de fer qui en a vu d’autres, et qui tient toujours.', 'guerrier'],
  ['heaume-de-brillance', 'tete', 'CHA', 'Heaume de brillance', '🌟', 'Il rayonne d’une lumière sacrée dès que son porteur lève la voix.', 'paladin'],
  ['capuchon-de-pisteur', 'tete', 'SAG', 'Capuchon de pisteur', '🧢', 'Sous son ombre, on entend les bois respirer.', 'rodeur'],
  ['mitre', 'tete', 'CON', 'Mitre', '⛑️', 'Coiffe de cérémonie, lourde de prières et de patience.', 'clerc'],
  ['chapeau-de-deguisement', 'tete', 'CHA', 'Chapeau de déguisement', '🎩', 'Une plume, un clin d’œil, et chacun se souvient de vous autrement.', 'barde'],
  ['capuche-de-voleur', 'tete', 'INT', 'Capuche de voleur', '🥷', 'Elle avale la lumière et garde les secrets.', 'roublard'],
  ['chapeau-de-sorcier', 'tete', 'INT', 'Chapeau de sorcier', '🧙', 'Pointu, étoilé, vaguement poussiéreux : un classique d’érudit.', 'magicien'],
  ['bandeau-de-combattant', 'tete', 'FOR', 'Bandeau de combattant', '🏴', 'Noué serré, il retient la sueur et le doute.', null],
  ['chapeau-de-voyageur', 'tete', 'DEX', 'Chapeau de voyageur', '👒', 'Il aime le grand air et les chemins de traverse.', null],

  // ───── Torses
  ['harnois', 'torse', 'FOR', 'Harnois', '🛡️', 'L’armure complète des chevaliers : chaque plaque compte des heures de forge.', 'guerrier'],
  ['cotte-de-mailles-paladin', 'torse', 'FOR', 'Cotte de mailles', '⛓️', 'Des milliers d’anneaux pour une seule certitude : tenir bon.', 'paladin'],
  ['armure-de-cuir-cloute', 'torse', 'DEX', 'Armure de cuir clouté', '🥋', 'Souple, silencieuse, renforcée là où ça compte.', 'rodeur'],
  ['robe-consacree', 'torse', 'CON', 'Robe consacrée', '👘', 'Tissée de prières, elle apaise tout ce qu’elle touche.', 'clerc'],
  ['pourpoint-de-velours', 'torse', 'CHA', 'Pourpoint de velours', '🧥', 'Taillé pour les scènes de taverne et les salons de nobles.', 'barde'],
  ['armure-de-cuir', 'torse', 'DEX', 'Armure de cuir', '🦺', 'Légère comme une ombre, parfaite pour les ruelles.', 'roublard'],
  ['robe-d-archimage', 'torse', 'CON', 'Robe d’archimage', '🥼', 'Les runes brodées protègent celui qui les a apprises.', 'magicien'],
  ['veste-d-erudit', 'torse', 'INT', 'Veste d’érudit', '👔', 'Pleine de poches, pleine de solutions.', null],
  ['manteau-de-pelerin', 'torse', 'SAG', 'Manteau de pèlerin', '🧣', 'Il connaît chaque chemin et chaque auberge.', null],

  // ───── Gants
  ['gantelets-de-puissance-d-ogre', 'mains', 'FOR', 'Gantelets de puissance d’ogre', '🥊', 'Ils serrent plus fort qu’on ne l’imagine.', 'guerrier'],
  ['gantelets-de-serment', 'mains', 'CHA', 'Gantelets de serment', '🧤', 'Gravés des vœux d’un ordre, ils ne tremblent jamais.', 'paladin'],
  ['gants-de-nage-et-d-escalade', 'mains', 'DEX', 'Gants de nage et d’escalade', '🧗', 'Aucune falaise, aucun torrent ne leur résiste.', 'rodeur'],
  ['mitaines-de-benediction', 'mains', 'SAG', 'Mitaines de bénédiction', '🙏', 'Chaque geste y devient une prière silencieuse.', 'clerc'],
  ['gants-de-menestrel', 'mains', 'DEX', 'Gants de ménestrel', '✋', 'Pour pincer les cordes sans jamais manquer une note.', 'barde'],
  ['outils-de-voleur', 'mains', 'INT', 'Outils de voleur', '🗝️', 'Aucune serrure ne résiste à celui qui sait écouter le déclic.', 'roublard'],
  ['bracelets-de-defense', 'mains', 'CON', 'Bracelets de défense', '🔰', 'Une barrière invisible entoure les poignets de leur porteur.', 'magicien'],
  ['gants-de-travail', 'mains', 'FOR', 'Gants de travail', '🪵', 'Rien de magique, juste de bonnes mains à l’ouvrage.', null],
  ['anneau-de-protection', 'mains', 'CON', 'Anneau de protection', '💍', 'Un simple anneau, une certitude : on s’en sortira.', null],

  // ───── Bottes
  ['bottes-de-marche-et-de-saut', 'bottes', 'CON', 'Bottes de marche et de saut', '🥾', 'Elles avalent les lieues et franchissent les ravins.', 'guerrier'],
  ['sabatons-benis', 'bottes', 'FOR', 'Sabatons bénis', '👢', 'Ils ancrent le paladin face à toutes les tempêtes.', 'paladin'],
  ['bottes-elfiques', 'bottes', 'SAG', 'Bottes elfiques', '🍃', 'Un pas léger, pas un bruit : la forêt vous adopte.', 'rodeur'],
  ['sandales-de-pelerin', 'bottes', 'CON', 'Sandales de pèlerin', '🩴', 'Elles ont parcouru toutes les routes saintes.', 'clerc'],
  ['bottes-de-danse', 'bottes', 'DEX', 'Bottes de danse', '👞', 'Impossible de les porter sans avoir envie de danser.', 'barde'],
  ['souliers-de-velours', 'bottes', 'DEX', 'Souliers de velours', '🥿', 'On n’entend que le silence quand ils passent.', 'roublard'],
  ['bottes-de-levitation', 'bottes', 'CON', 'Bottes de lévitation', '🪽', 'Le sol n’est qu’une suggestion.', 'magicien'],
  ['pantoufles-d-erudit', 'bottes', 'INT', 'Pantoufles d’érudit', '🧦', 'Pour les longues veillées avec un bon grimoire.', null],
  ['bottes-d-apparat', 'bottes', 'CHA', 'Bottes d’apparat', '👠', 'Cirées, brillantes : elles annoncent votre arrivée.', null],

  // ───── Amulettes
  ['amulette-de-sante', 'amulette', 'CON', 'Amulette de santé', '❤️', 'Elle bat au rythme de ton endurance.', 'guerrier'],
  ['reliquaire', 'amulette', 'CHA', 'Reliquaire', '🏺', 'Il renferme un souvenir sacré qui inspire ceux qui suivent le paladin.', 'paladin'],
  ['medaillon-de-pensees', 'amulette', 'SAG', 'Médaillon de pensées', '📿', 'Il murmure ce que la nature essaie de dire.', 'rodeur'],
  ['symbole-sacre', 'amulette', 'SAG', 'Symbole sacré', '✝️', 'Focaliseur de foi : il brille quand on prie avec sincérité.', 'clerc'],
  ['luth', 'amulette', 'CHA', 'Luth', '🪕', 'Un instrument porté en bandoulière, prêt pour la prochaine ballade.', 'barde'],
  ['amulette-de-protection-contre-la-detection', 'amulette', 'INT', 'Amulette de protection contre la détection', '🧿', 'Ni sort ni regard ne peut vous suivre.', 'roublard'],
  ['grimoire', 'amulette', 'INT', 'Grimoire', '📖', 'Chaque page est un sort ; chaque sort, une promesse.', 'magicien'],
  ['talisman-de-force', 'amulette', 'FOR', 'Talisman de force', '💪', 'Il chauffe quand l’effort se fait sentir.', null],
  ['pierre-de-chance', 'amulette', 'DEX', 'Pierre de chance', '🍀', 'Un galet poli qui fait tourner le hasard en votre faveur.', null],
];
