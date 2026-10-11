// Équipement : 48 modèles d'objets (8 par emplacement). Aucune image : chaque objet est un glyphe (emoji), un nom et une rareté
// donnée au tirage. `ability` est la caractéristique augmentée (bonus d'aventure). Voir docs/DONJONS.md §6.
//
// Colonnes : [id, emplacement, caractéristique, nom, glyphe, description]
export default [
  // ───── Armes
  ['epee-du-sentier', 'arme', 'FOR', 'Épée du sentier', '⚔️', 'Une lame honnête, forgée pour ceux qui avancent un pas après l’autre.'],
  ['dague-vive', 'arme', 'DEX', 'Dague vive', '🗡️', 'Légère et rapide, elle récompense les gestes précis.'],
  ['baton-des-sages', 'arme', 'INT', 'Bâton des sages', '🪄', 'Il s’éclaire quand on réfléchit avant d’agir.'],
  ['arc-de-l-aube', 'arme', 'SAG', 'Arc de l’aube', '🏹', 'Il ne rate jamais ceux qui savent attendre le bon moment.'],
  ['sceptre-d-eloquence', 'arme', 'CHA', 'Sceptre d’éloquence', '🔱', 'Les foules se taisent quand on le brandit.'],
  ['masse-du-rempart', 'arme', 'CON', 'Masse du rempart', '🔨', 'Lourde à porter, plus lourde encore à encaisser.'],
  ['hache-du-forgeron', 'arme', 'FOR', 'Hache du forgeron', '🪓', 'Chaque coup raconte des heures d’entraînement.'],
  ['fleuret-leger', 'arme', 'DEX', 'Fleuret léger', '🤺', 'Une pointe fine pour des appuis parfaits.'],

  // ───── Casques et couvre-chefs
  ['casque-de-fer', 'tete', 'CON', 'Casque de fer', '⛑️', 'Il en a vu d’autres, et il tient toujours.'],
  ['chapeau-de-voyageur', 'tete', 'DEX', 'Chapeau de voyageur', '🎩', 'Un chapeau qui aime le grand air et les chemins de traverse.'],
  ['couronne-de-lauriers', 'tete', 'CHA', 'Couronne de lauriers', '👑', 'Offerte à celui qui a su rassembler.'],
  ['diademe-du-savant', 'tete', 'INT', 'Diadème du savant', '🎓', 'Il scintille à chaque nouvelle idée.'],
  ['capuche-du-veilleur', 'tete', 'SAG', 'Capuche du veilleur', '🥷', 'Sous sa capuche, on entend mieux ce qui compte.'],
  ['bandeau-du-guerrier', 'tete', 'FOR', 'Bandeau du guerrier', '🏴', 'Noué serré, il retient la sueur et le doute.'],
  ['heaume-du-gardien', 'tete', 'CON', 'Heaume du gardien', '🪖', 'Un heaume qui n’a jamais cédé.'],
  ['lunettes-d-erudit', 'tete', 'INT', 'Lunettes d’érudit', '👓', 'Elles lisent entre les lignes.'],

  // ───── Torses
  ['cotte-de-mailles', 'torse', 'CON', 'Cotte de mailles', '🛡️', 'Des milliers d’anneaux, pour une seule certitude : tenir bon.'],
  ['tunique-du-voyageur', 'torse', 'DEX', 'Tunique du voyageur', '👕', 'Souple et légère, elle suit tous les mouvements.'],
  ['armure-de-plates', 'torse', 'FOR', 'Armure de plates', '🦺', 'Pour qui porte sa force avec fierté.'],
  ['robe-de-sagesse', 'torse', 'SAG', 'Robe de sagesse', '👘', 'Elle apaise tout ce qui la touche.'],
  ['manteau-d-orateur', 'torse', 'CHA', 'Manteau d’orateur', '🧥', 'Un manteau qui donne envie de prendre la parole.'],
  ['veste-de-l-artisan', 'torse', 'INT', 'Veste de l’artisan', '🥼', 'Pleine de poches, pleine de solutions.'],
  ['plastron-de-cuir', 'torse', 'CON', 'Plastron de cuir', '🥋', 'Éprouvé par mille entraînements.'],
  ['cape-du-conteur', 'torse', 'CHA', 'Cape du conteur', '🧣', 'Elle claque au vent quand l’histoire commence.'],

  // ───── Gants
  ['gantelets-de-force', 'mains', 'FOR', 'Gantelets de force', '🧤', 'Ils serrent plus fort qu’on ne l’imagine.'],
  ['gants-d-artisan', 'mains', 'DEX', 'Gants d’artisan', '✋', 'Un tour de main hérité de générations d’ateliers.'],
  ['bracelets-de-calme', 'mains', 'SAG', 'Bracelets de calme', '📿', 'Un souffle, un grain, un instant de paix.'],
  ['mitaines-d-ecriture', 'mains', 'INT', 'Mitaines d’écriture', '✍️', 'Elles laissent les doigts libres pour la plume.'],
  ['poignets-du-rempart', 'mains', 'CON', 'Poignets du rempart', '🤲', 'Rien ne les fait plier.'],
  ['gants-de-velours', 'mains', 'CHA', 'Gants de velours', '🤝', 'Pour les poignées de main qui scellent les amitiés.'],
  ['poings-d-acier', 'mains', 'FOR', 'Poings d’acier', '🥊', 'Une garde solide, une volonté plus solide encore.'],
  ['anneau-de-vivacite', 'mains', 'DEX', 'Anneau de vivacité', '💍', 'Il rend chaque geste plus vif.'],

  // ───── Bottes
  ['bottes-de-sept-lieues', 'bottes', 'DEX', 'Bottes de sept lieues', '🥾', 'Elles avalent les kilomètres sans fatigue.'],
  ['sandales-du-pelerin', 'bottes', 'SAG', 'Sandales du pèlerin', '🩴', 'Elles connaissent le chemin, même sans carte.'],
  ['bottes-de-fer', 'bottes', 'CON', 'Bottes de fer', '👢', 'Elles ancrent leur porteur dans la terre.'],
  ['souliers-de-danse', 'bottes', 'CHA', 'Souliers de danse', '👞', 'Impossible de les porter sans sourire.'],
  ['chaussons-de-lecture', 'bottes', 'INT', 'Chaussons de lecture', '🧦', 'Pour les longues soirées avec un bon livre.'],
  ['sabots-du-bucheron', 'bottes', 'FOR', 'Sabots du bûcheron', '🪵', 'Solides comme le chêne qu’ils ont vu tomber.'],
  ['bottines-de-sentier', 'bottes', 'CON', 'Bottines de sentier', '🥿', 'Elles tiennent la distance, saison après saison.'],
  ['baskets-du-coureur', 'bottes', 'DEX', 'Baskets du coureur', '👟', 'Légères, fidèles, toujours prêtes à partir.'],

  // ───── Amulettes
  ['pendentif-du-sage', 'amulette', 'INT', 'Pendentif du sage', '🔮', 'Il murmure la réponse à ceux qui cherchent.'],
  ['talisman-de-force', 'amulette', 'FOR', 'Talisman de force', '🧿', 'Il chauffe quand l’effort se fait sentir.'],
  ['medaillon-de-l-aube', 'amulette', 'SAG', 'Médaillon de l’aube', '🌅', 'Il brille chaque matin où l’on recommence.'],
  ['collier-du-troubadour', 'amulette', 'CHA', 'Collier du troubadour', '📯', 'Les chansons y sont gravées.'],
  ['amulette-de-vigueur', 'amulette', 'CON', 'Amulette de vigueur', '❤️', 'Elle bat au rythme de ton endurance.'],
  ['breloque-agile', 'amulette', 'DEX', 'Breloque agile', '🍀', 'Un porte-bonheur pour les pieds légers.'],
  ['sautoir-d-erudit', 'amulette', 'INT', 'Sautoir d’érudit', '📜', 'Il porte la mémoire de mille lectures.'],
  ['sceau-du-gardien', 'amulette', 'SAG', 'Sceau du gardien', '🪬', 'Il veille sur ceux qui veillent sur les autres.'],
];
