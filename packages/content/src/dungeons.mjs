// Donjons : un par thème de parcours (discipline), 5 salles puis un boss. L'ordre de la liste fixe les paliers :
// 4 donjons par palier, débloqués au niveau 3 × palier (plafonné au niveau 20). Voir docs/DONJONS.md §7.
//
// Colonnes : [thème, nom, glyphe, boss, [5 monstres]] — monstres et boss s'écrivent avec leur article.
const DUNGEONS = [
  ['randonnee', 'Sentier des Brumes', '🥾', 'le Géant des Cimes', ['un Corbeau moqueur', 'une Ronce vorace', 'un Sanglier boueux', 'un Loup des éboulis', 'un Esprit de la brume']],
  ['danse', 'Salle des Miroirs', '💃', 'la Reine du Bal Maudit', ['un Valet maladroit', 'une Marionnette folle', 'un Cavalier sans visage', 'une Danseuse fantôme', 'un Maître de ballet spectral']],
  ['yoga', 'Temple des Souffles', '🧘', 'le Dragon du Lotus', ['un Moineau agité', 'une Pensée parasite', 'un Singe bavard', 'un Gardien du seuil', 'un Serpent d’orage']],
  ['cuisine', 'Cuisines Infernales', '🍳', 'le Chef des Casseroles', ['un Rat de cave', 'un Couteau volant', 'une Soupe vivante', 'un Marmiton rancunier', 'un Four hurlant']],

  ['mobilite', 'Gorges des Raideurs', '🤸', 'le Titan Rouillé', ['une Poulie grinçante', 'un Nœud de muscles', 'un Golem de rouille', 'un Mur de courbatures', 'une Chimère contractée']],
  ['nutrition', 'Jardins Gloutons', '🥗', 'l’Ogre du Buffet', ['un Pigeon pillard', 'une Carotte mutante', 'un Gobelin sucré', 'une Grande Faim', 'un Spectre du grignotage']],
  ['sommeil', 'Royaume des Rêves', '🌙', 'le Marchand d’Insomnies', ['une Chauve-souris insomniaque', 'un Cauchemar tapi', 'un Lutin des soupirs', 'une Horloge affolée', 'un Spectre des écrans']],
  ['botanique', 'Forêt des Racines', '🌿', 'l’Arbre-Monde', ['un Pissenlit rebelle', 'une Liane étrangleuse', 'un Champignon hargneux', 'un Loup-garou des fougères', 'une Dryade furieuse']],

  ['course', 'Piste des Vents', '🏃', 'le Cerbère du Marathon', ['un Lièvre arrogant', 'un Lévrier de brume', 'un Centaure essoufflé', 'une Harpie du dernier kilomètre', 'un Mur invisible']],
  ['dessin', 'Atelier des Teintes', '🎨', 'le Peintre Sans Visage', ['une Tache rebelle', 'un Pinceau enragé', 'un Croquis vivant', 'un Golem de fusain', 'un Spectre de la toile blanche']],
  ['musique', 'Salle des Échos', '🎵', 'le Chef d’Orchestre Fantôme', ['un Diapason fou', 'une Corde vengeresse', 'un Tambour des profondeurs', 'une Sirène désaccordée', 'un Barde sans âme']],
  ['lecture-ecriture', 'Bibliothèque Interdite', '📚', 'le Grand Censeur', ['un Ver de papier', 'une Page blanche hantée', 'un Grimoire mordeur', 'un Scribe fantôme', 'un Gardien des index']],

  ['pilates', 'Studio des Équilibres', '⚖️', 'le Funambule Noir', ['un Tapis glissant', 'un Ballon rebelle', 'un Ressort affolé', 'un Gardien du centre', 'un Spectre de la posture']],
  ['natation', 'Grottes Immergées', '🏊', 'le Kraken des Profondeurs', ['une Méduse nerveuse', 'un Crabe pinçant', 'une Murène sournoise', 'un Banc de piranhas', 'une Sirène des abysses']],
  ['cyclisme', 'Col des Géants', '🚴', 'le Dragon du Col Maudit', ['un Chien de ferme hargneux', 'un Virage traître', 'un Vent de face', 'un Cyclope des lacets', 'un Spectre du brouillard']],
  ['langues', 'Tour de Babel', '🗣️', 'le Seigneur des Idiomes', ['un Perroquet malicieux', 'un Faux-ami sournois', 'un Verbe irrégulier', 'un Golem de grammaire', 'un Sphinx des conjugaisons']],

  ['meditation', 'Montagne du Silence', '🏔️', 'l’Ermite du Vide', ['un Souffle volage', 'une Pensée envahissante', 'un Moine bavard', 'un Écho tenace', 'un Fantôme d’inquiétude']],
  ['bricolage', 'Forge Oubliée', '🔧', 'le Colosse de Rouille', ['un Clou rebelle', 'une Scie dentue', 'un Étau vorace', 'un Automate détraqué', 'un Marteau-pilon']],
  ['entraide', 'Village Assiégé', '🤝', 'le Seigneur de l’Indifférence', ['un Brigand égoïste', 'une Tempête de misère', 'un Corbeau du doute', 'un Garde sourd', 'un Spectre de solitude']],
  ['strategie', 'Échiquier Géant', '♟️', 'le Roi Noir', ['un Pion hargneux', 'un Cavalier piégeux', 'un Fou retors', 'une Tour implacable', 'une Dame cruelle']],

  ['theatre', 'Théâtre des Ombres', '🎭', 'le Souffleur Maudit', ['un Trac dévorant', 'un Accessoire hanté', 'un Critique mordant', 'un Fantôme de l’opéra', 'une Voix du public']],
  ['culture', 'Musée des Âges', '🏛️', 'le Conservateur Éternel', ['une Statue sceptique', 'une Momie érudite', 'un Vase maudit', 'un Gardien de fresques', 'un Chevalier d’armure vide']],
  ['escalade', 'Falaise du Vertige', '🧗', 'le Gardien du Sommet', ['un Rocher branlant', 'une Chauve-souris des fissures', 'un Aigle jaloux', 'un Vertige rampant', 'un Éboulement vivant']],
  ['programmation', 'Labyrinthe du Code', '💻', 'le Bug Originel', ['un Point-virgule manquant', 'une Boucle infinie', 'un Gobelin des dépendances', 'un Golem de spaghetti', 'un Démon de la production']],

  ['musculation', 'Arène de Fonte', '🏋️', 'le Colosse de Fonte', ['un Haltère fou', 'un Sac de sable vivant', 'un Golem de plaques', 'un Minotaure du squat', 'un Titan de barres']],
  ['arts-martiaux', 'Dojo des Cent Combats', '🥋', 'le Maître Sans Nom', ['un Disciple fougueux', 'un Ninja des ombres', 'un Moine guerrier', 'un Samouraï fantôme', 'un Dragon de jade']],
];

/** Donjons par palier. */
export const DUNGEONS_PER_TIER = 4;
/** Niveau requis par palier : 3 × palier (plafonné à MAX_LEVEL) */
export const UNLOCK_PER_TIER = 3;
export const MAX_LEVEL = 20;

/**
 * Construit les donjons à partir des disciplines (thèmes de parcours) : un par thème, dans l'ordre de `DUNGEONS`.
 * `themes` = `[{ id, label }]` (voir `guided.mjs`). Lève une erreur si un thème n'a pas de donjon ou inversement.
 */
export function buildDungeons(themes) {
  const seen = new Set();
  const out = DUNGEONS.map(([theme, name, glyph, boss, rooms], i) => {
    const t = themes.find((x) => x.id === theme);
    if (!t) throw new Error(`donjon ${name}: thème inconnu « ${theme} »`);
    if (seen.has(theme)) throw new Error(`donjon ${name}: thème en double « ${theme} »`);
    seen.add(theme);
    if (rooms.length !== 5) throw new Error(`donjon ${name}: ${rooms.length} salles (attendu 5)`);
    const tier = Math.floor(i / DUNGEONS_PER_TIER) + 1;
    return {
      id: `dj-${theme}`,
      theme,
      name,
      glyph,
      blurb: `${name} met à l’épreuve ta discipline en ${t.label.toLowerCase()}.`,
      tier,
      unlockLevel: Math.min(MAX_LEVEL, UNLOCK_PER_TIER * tier),
      rooms,
      boss,
    };
  });
  for (const t of themes) if (!seen.has(t.id)) throw new Error(`discipline « ${t.id} » sans donjon`);
  return out;
}
