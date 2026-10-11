// Panoplies de classe (V4) : 7 sets de 6 pièces (une par emplacement), un set par classe D&D. Les 12 objets universels
// restent « hors set ». Aucune image : un glyphe, un nom. Voir docs/CLASSES.md §3.1 et docs/DONJONS.md §9.
//
// Colonnes : [id, nom, glyphe, caractéristique du bonus de score (première maîtrise de la classe), description, { emplacement: id d'objet }]
// L'identifiant du set est celui de la classe.
export default [
  [
    'guerrier', 'Panoplie du Guerrier', '⚔️', 'FOR', 'L’équipement complet du combattant de première ligne.',
    { arme: 'espadon', tete: 'heaume', torse: 'harnois', mains: 'gantelets-de-puissance-d-ogre', bottes: 'bottes-de-marche-et-de-saut', amulette: 'amulette-de-sante' },
  ],
  [
    'paladin', 'Panoplie du Paladin', '🔨', 'FOR', 'Acier béni et serment gravé : l’armure d’une cause sacrée.',
    { arme: 'marteau-de-guerre', tete: 'heaume-de-brillance', torse: 'cotte-de-mailles-paladin', mains: 'gantelets-de-serment', bottes: 'sabatons-benis', amulette: 'reliquaire' },
  ],
  [
    'rodeur', 'Panoplie du Rôdeur', '🏹', 'DEX', 'Cuir, plumes et silence : la tenue de ceux qui connaissent les sentiers.',
    { arme: 'arc-long', tete: 'capuchon-de-pisteur', torse: 'armure-de-cuir-cloute', mains: 'gants-de-nage-et-d-escalade', bottes: 'bottes-elfiques', amulette: 'medaillon-de-pensees' },
  ],
  [
    'clerc', 'Panoplie du Clerc', '🌿', 'SAG', 'Foi, laine consacrée et masse bénie : le costume du soigneur divin.',
    { arme: 'masse-d-armes', tete: 'mitre', torse: 'robe-consacree', mains: 'mitaines-de-benediction', bottes: 'sandales-de-pelerin', amulette: 'symbole-sacre' },
  ],
  [
    'barde', 'Panoplie du Barde', '🎵', 'CHA', 'Velours, plumes et ballades : tout pour faire lever la salle.',
    { arme: 'rapiere', tete: 'chapeau-de-deguisement', torse: 'pourpoint-de-velours', mains: 'gants-de-menestrel', bottes: 'bottes-de-danse', amulette: 'luth' },
  ],
  [
    'roublard', 'Panoplie du Roublard', '🗡️', 'DEX', 'Cuir noir, lames fines et outils discrets : le matériel du cambrioleur.',
    { arme: 'dagues-jumelles', tete: 'capuche-de-voleur', torse: 'armure-de-cuir', mains: 'outils-de-voleur', bottes: 'souliers-de-velours', amulette: 'amulette-de-protection-contre-la-detection' },
  ],
  [
    'magicien', 'Panoplie du Magicien', '🔮', 'INT', 'Robes brodées de runes, bâton et grimoire : l’attirail de l’érudit des arcanes.',
    { arme: 'baton-du-mage', tete: 'chapeau-de-sorcier', torse: 'robe-d-archimage', mains: 'bracelets-de-defense', bottes: 'bottes-de-levitation', amulette: 'grimoire' },
  ],
];

// Bonus cumulés selon le nombre de pièces équipées (le palier atteint remplace le précédent), identiques pour les 7 classes :
// `pp` s'ajoute à la puissance, `ability` à la caractéristique du set (score d'aventure).
export const SET_BONUSES = [
  { pieces: 2, pp: 5, ability: 1 },
  { pieces: 4, pp: 12, ability: 3 },
  { pieces: 6, pp: 25, ability: 6 },
];
