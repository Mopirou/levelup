// Sorts et capacités de classe (V4) : 8 par classe D&D (2 communes, 2 peu communes, 2 rares, 1 épique, 1 légendaire) = 56.
// Noms français du SRD 5e / des règles officielles (aidedd.org). Aucune image : un glyphe et un nom.
// Chaque capacité convertit les points d'effet de sa rareté (3 / 5 / 8 / 12 / 18) dans UNE famille d'effet :
//   xp      -> +N % d'XP sur la caractéristique `ability` (ou sur toutes les maîtrises de la classe pour `all`, points partagés)
//   stat    -> +floor(N / 4) au score d'aventure de `ability`
//   raid    -> +N % de dégâts de raid
//   gold    -> +N % d'or d'expédition
//   chest   -> décale la rareté de l'objet d'un coffre de N / 4 points
//   dungeon -> +N / 2 % de CON effective en donjon
// Voir docs/CLASSES.md §3.2 et §3.3.
//
// Colonnes : [id, classe, rareté, famille, caractéristique, nom, glyphe, description]
export default [
  // ───── Guerrier (FOR, CON)
  ['second-souffle', 'guerrier', 'commun', 'dungeon', 'CON', 'Second souffle', '💨', 'Une grande inspiration, et la fatigue recule d’un pas.'],
  ['style-de-combat', 'guerrier', 'commun', 'stat', 'FOR', 'Style de combat', '🥋', 'Une façon de se battre travaillée mille fois, jusqu’au réflexe.'],
  ['critique-ameliore', 'guerrier', 'peu_commun', 'xp', 'FOR', 'Critique amélioré', '🎯', 'Tes meilleurs efforts comptent double quand tu vises juste.'],
  ['athlete-accompli', 'guerrier', 'peu_commun', 'xp', 'FOR', 'Athlète accompli', '🏃', 'Courir, grimper, sauter : tout devient entraînement.'],
  ['fougue', 'guerrier', 'rare', 'raid', 'FOR', 'Fougue', '⚡', 'Un sursaut d’énergie pour frapper deux fois plus fort quand il le faut.'],
  ['attaque-supplementaire', 'guerrier', 'rare', 'stat', 'FOR', 'Attaque supplémentaire', '🗡️', 'Un geste de plus à chaque assaut : la force devient méthode.'],
  ['inflexible', 'guerrier', 'epique', 'xp', 'FOR', 'Inflexible', '🧱', 'Un échec ne compte jamais deux fois : tu te relèves et tu recommences.'],
  ['triple-attaque-supplementaire', 'guerrier', 'legendaire', 'raid', 'FOR', 'Triple attaque supplémentaire', '🌪️', 'Trois coups pour le prix d’un : les boss sentent le vent tourner.'],

  // ───── Paladin (FOR, CHA)
  ['imposition-des-mains', 'paladin', 'commun', 'dungeon', 'CON', 'Imposition des mains', '🤲', 'Un contact chaleureux referme les plaies et redonne du courage.'],
  ['sens-divin', 'paladin', 'commun', 'stat', 'CHA', 'Sens divin', '👁️', 'Tu perçois ce qui est juste, et les autres le sentent en ta présence.'],
  ['benediction', 'paladin', 'peu_commun', 'xp', 'CHA', 'Bénédiction', '🕊️', 'Une prière brève, et chaque effort compte un peu plus.'],
  ['protection-contre-le-mal-et-le-bien', 'paladin', 'peu_commun', 'xp', 'CHA', 'Protection contre le mal et le bien', '🛡️', 'Un cercle de lumière tient les mauvaises influences à distance.'],
  ['chatiment-divin', 'paladin', 'rare', 'raid', 'FOR', 'Châtiment divin', '☀️', 'Chaque coup du paladin s’illumine d’une énergie radieuse.'],
  ['aura-de-protection', 'paladin', 'rare', 'dungeon', 'CON', 'Aura de protection', '💠', 'Une lueur protège le paladin et tous ceux qui marchent à ses côtés.'],
  ['frappes-radiantes', 'paladin', 'epique', 'xp', 'CHA', 'Frappes radiantes', '✨', 'Tes engagements brillent de l’intérieur et se voient de loin.'],
  ['nimbe-sacre', 'paladin', 'legendaire', 'raid', 'FOR', 'Nimbe sacré', '😇', 'Un halo de lumière solaire consume les ténèbres autour de toi.'],

  // ───── Rôdeur (DEX, SAG)
  ['marque-du-chasseur', 'rodeur', 'commun', 'raid', 'DEX', 'Marque du chasseur', '🎯', 'Une proie désignée, et chaque flèche sait où aller.'],
  ['ennemi-jure', 'rodeur', 'commun', 'stat', 'DEX', 'Ennemi juré', '🐺', 'À force d’étudier tes adversaires, tu les devances.'],
  ['fin-explorateur', 'rodeur', 'peu_commun', 'xp', 'SAG', 'Fin explorateur', '🧭', 'Les terrains inconnus ne te perdent plus : tu y trouves des leçons.'],
  ['passage-sans-trace', 'rodeur', 'peu_commun', 'xp', 'SAG', 'Passage sans trace', '🍂', 'Tu avances en silence et tu observes mieux que personne.'],
  ['proie-du-chasseur', 'rodeur', 'rare', 'chest', 'SAG', 'Proie du chasseur', '🦌', 'Un bon chasseur rentre toujours avec un beau butin.'],
  ['tactiques-defensives', 'rodeur', 'rare', 'dungeon', 'CON', 'Tactiques défensives', '🪵', 'Tu sais te replier, te couvrir et revenir plus fort.'],
  ['voile-de-la-nature', 'rodeur', 'epique', 'xp', 'SAG', 'Voile de la nature', '🌿', 'La forêt te couvre, et ta patience porte ses fruits.'],
  ['tueur-implacable', 'rodeur', 'legendaire', 'gold', 'DEX', 'Tueur implacable', '🏔️', 'Rien n’échappe à ta traque, et chaque expédition ramène un trésor.'],

  // ───── Clerc (SAG, CON)
  ['flamme-sacree', 'clerc', 'commun', 'stat', 'SAG', 'Flamme sacrée', '🔥', 'Une flamme venue du ciel éclaire ton esprit et affine ton discernement.'],
  ['soins', 'clerc', 'commun', 'dungeon', 'CON', 'Soins', '💚', 'Un toucher, un mot, et les blessures se referment.'],
  ['arme-spirituelle', 'clerc', 'peu_commun', 'xp', 'SAG', 'Arme spirituelle', '🔱', 'Une lame de lumière combat pour toi pendant que tu médites.'],
  ['mot-de-guerison', 'clerc', 'peu_commun', 'xp', 'SAG', 'Mot de guérison', '🗣️', 'Un mot doux suffit parfois à remettre quelqu’un debout.'],
  ['esprits-gardiens', 'clerc', 'rare', 'dungeon', 'CON', 'Esprits gardiens', '👼', 'Des esprits veillent sur toi et tiennent les monstres à distance.'],
  ['frappes-benies', 'clerc', 'rare', 'raid', 'SAG', 'Frappes bénies', '🌟', 'Chaque coup porte la force de ta foi.'],
  ['resurrection', 'clerc', 'epique', 'xp', 'SAG', 'Résurrection', '🌅', 'Rien n’est perdu : chaque matin ramène un nouveau départ.'],
  ['intervention-divine', 'clerc', 'legendaire', 'dungeon', 'CON', 'Intervention divine', '🙌', 'Quand tout semble perdu, ton dieu répond à l’appel.'],

  // ───── Barde (CHA, DEX)
  ['moquerie-cruelle', 'barde', 'commun', 'raid', 'CHA', 'Moquerie cruelle', '😈', 'Une raillerie bien tournée et le boss perd ses moyens.'],
  ['inspiration-bardique', 'barde', 'commun', 'stat', 'CHA', 'Inspiration bardique', '🎶', 'Une mélodie qui donne envie de se dépasser.'],
  ['fou-rire-de-tasha', 'barde', 'peu_commun', 'xp', 'CHA', 'Fou rire de Tasha', '🤣', 'Le rire détend, rassemble, et rend tout plus facile.'],
  ['contre-charme', 'barde', 'peu_commun', 'xp', 'CHA', 'Contre-charme', '🎼', 'Une mélodie chasse la peur et remet les amis sur pied.'],
  ['suggestion', 'barde', 'rare', 'gold', 'CHA', 'Suggestion', '💬', 'Un mot bien choisi, et le marchand baisse ses prix.'],
  ['motif-hypnotique', 'barde', 'rare', 'chest', 'CHA', 'Motif hypnotique', '🌀', 'Un tourbillon de couleurs fascine, et le hasard te sourit.'],
  ['mot-de-pouvoir-etourdissant', 'barde', 'epique', 'xp', 'CHA', 'Mot de pouvoir étourdissant', '💥', 'Une parole si forte qu’elle te fait avancer sans réfléchir.'],
  ['mot-de-pouvoir-mortel', 'barde', 'legendaire', 'raid', 'CHA', 'Mot de pouvoir mortel', '☠️', 'Un seul mot, murmuré au bon moment, achève le boss.'],

  // ───── Roublard (DEX, INT)
  ['attaque-sournoise', 'roublard', 'commun', 'raid', 'DEX', 'Attaque sournoise', '🗡️', 'Frapper là où ça fait mal, quand personne ne regarde.'],
  ['expertise', 'roublard', 'commun', 'stat', 'INT', 'Expertise', '🔍', 'Un talent travaillé jusqu’à la maîtrise.'],
  ['ruse', 'roublard', 'peu_commun', 'xp', 'INT', 'Ruse', '🦊', 'Un détour malin vaut mieux qu’un effort brut.'],
  ['esquive-instinctive', 'roublard', 'peu_commun', 'xp', 'INT', 'Esquive instinctive', '🌀', 'Tu sens le coup venir et tu apprends de chaque esquive.'],
  ['savoir-faire', 'roublard', 'rare', 'gold', 'INT', 'Savoir-faire', '🪙', 'Tu sais toujours où se cache la meilleure affaire.'],
  ['esquive-totale', 'roublard', 'rare', 'dungeon', 'CON', 'Esquive totale', '💨', 'Les pièges ne t’effleurent même plus.'],
  ['assassinat', 'roublard', 'epique', 'xp', 'INT', 'Assassinat', '🥷', 'Une préparation minutieuse rend chaque effort décisif.'],
  ['coup-de-chance', 'roublard', 'legendaire', 'chest', 'DEX', 'Coup de chance', '🎲', 'Quand tout dérape, le dé tombe toujours de ton côté.'],

  // ───── Magicien (INT, CON)
  ['projectile-magique', 'magicien', 'commun', 'raid', 'INT', 'Projectile magique', '🌠', 'Trois traits de force pure qui ne ratent jamais leur cible.'],
  ['lumiere', 'magicien', 'commun', 'stat', 'INT', 'Lumière', '💡', 'Une petite lueur pour y voir plus clair, au propre comme au figuré.'],
  ['mains-brulantes', 'magicien', 'peu_commun', 'xp', 'INT', 'Mains brûlantes', '🤲', 'La curiosité te brûle les doigts et nourrit ton apprentissage.'],
  ['bouclier', 'magicien', 'peu_commun', 'dungeon', 'CON', 'Bouclier', '🔮', 'Une barrière d’énergie arcanique dévie les coups avant qu’ils ne t’atteignent.'],
  ['boule-de-feu', 'magicien', 'rare', 'raid', 'INT', 'Boule de feu', '🔥', 'Une explosion qui fait trembler le plus grand des boss.'],
  ['eclair', 'magicien', 'rare', 'xp', 'INT', 'Éclair', '⚡', 'Une idée soudaine qui illumine toute une leçon.'],
  ['mur-de-force', 'magicien', 'epique', 'dungeon', 'CON', 'Mur de force', '🧊', 'Une paroi invisible que rien ne traverse.'],
  ['souhait', 'magicien', 'legendaire', 'xp', 'all', 'Souhait', '🌌', 'Le plus puissant des sorts : il nourrit toutes tes maîtrises.'],
];
