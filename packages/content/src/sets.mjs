// Panoplies : 6 sets de 6 pièces (une par emplacement), un set par caractéristique. Les 12 autres objets du catalogue
// (2 par emplacement) restent « hors set ». Aucune image : un glyphe, un nom. Voir docs/DONJONS.md §9.
//
// Colonnes : [id, nom, glyphe, caractéristique, description, { emplacement: id d'objet }]
export default [
  [
    'titan', 'Panoplie du Titan', '🦾', 'FOR', 'Forgée pour ceux qui soulèvent le monde un effort après l’autre.',
    { arme: 'epee-du-sentier', tete: 'bandeau-du-guerrier', torse: 'armure-de-plates', mains: 'gantelets-de-force', bottes: 'sabots-du-bucheron', amulette: 'talisman-de-force' },
  ],
  [
    'ombre', 'Panoplie de l’Ombre', '🌒', 'DEX', 'Légère, silencieuse, toujours un pas devant.',
    { arme: 'dague-vive', tete: 'chapeau-de-voyageur', torse: 'tunique-du-voyageur', mains: 'gants-d-artisan', bottes: 'bottes-de-sept-lieues', amulette: 'breloque-agile' },
  ],
  [
    'rempart', 'Panoplie du Rempart', '🏰', 'CON', 'Rien ne la fait plier, et rien ne la fait reculer.',
    { arme: 'masse-du-rempart', tete: 'casque-de-fer', torse: 'cotte-de-mailles', mains: 'poignets-du-rempart', bottes: 'bottes-de-fer', amulette: 'amulette-de-vigueur' },
  ],
  [
    'erudit', 'Panoplie de l’Érudit', '📚', 'INT', 'Chaque pièce garde la trace d’une idée qui a fait ses preuves.',
    { arme: 'baton-des-sages', tete: 'diademe-du-savant', torse: 'veste-de-l-artisan', mains: 'mitaines-d-ecriture', bottes: 'chaussons-de-lecture', amulette: 'pendentif-du-sage' },
  ],
  [
    'aube', 'Panoplie de l’Aube', '🌄', 'SAG', 'Elle brille pour ceux qui recommencent chaque matin.',
    { arme: 'arc-de-l-aube', tete: 'capuche-du-veilleur', torse: 'robe-de-sagesse', mains: 'bracelets-de-calme', bottes: 'sandales-du-pelerin', amulette: 'medaillon-de-l-aube' },
  ],
  [
    'troubadour', 'Panoplie du Troubadour', '🎭', 'CHA', 'Faite pour rassembler : on la porte pour qu’on vous suive.',
    { arme: 'sceptre-d-eloquence', tete: 'couronne-de-lauriers', torse: 'manteau-d-orateur', mains: 'gants-de-velours', bottes: 'souliers-de-danse', amulette: 'collier-du-troubadour' },
  ],
];

// Bonus cumulés selon le nombre de pièces équipées (le palier atteint remplace le précédent) :
// `pp` s'ajoute à la puissance, `ability` à la caractéristique du set (score d'aventure).
export const SET_BONUSES = [
  { pieces: 2, pp: 5, ability: 1 },
  { pieces: 4, pp: 12, ability: 3 },
  { pieces: 6, pp: 25, ability: 6 },
];
