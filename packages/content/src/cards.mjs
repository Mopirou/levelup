// Collection « Bestiaire & Reliques » : 60 cartes à collectionner, tirées dans les coffres (aucun effet de jeu : le plaisir de les trouver).
// 32 créatures et 28 objets magiques célèbres de D&D, avec les noms français usuels. Aucune image : un glyphe et un nom.
// Répartition par rareté : 16 communes, 14 peu communes, 12 rares, 10 épiques, 8 légendaires.
// La rareté d'une carte est celle de l'objet qu'elle remplace dans le coffre (voir docs/COLLECTION.md).
//
// Colonnes : [id, type (bestiaire | relique), rareté, nom, glyphe, description]
export default [
  // ───── Communes (16)
  ['gobelin', 'bestiaire', 'commun', 'Gobelin', '👺', 'Petit, vif, jamais seul. Il adore tout ce qui brille, surtout ce qui n’est pas à lui.'],
  ['kobold', 'bestiaire', 'commun', 'Kobold', '🦎', 'Il pose des pièges partout et s’en sort toujours avec un grand sourire.'],
  ['squelette', 'bestiaire', 'commun', 'Squelette', '💀', 'Il marche au pas, obéit sans discuter et n’a plus rien à perdre.'],
  ['zombie', 'bestiaire', 'commun', 'Zombie', '🧟', 'Lent mais obstiné : il finit toujours par arriver.'],
  ['rat-geant', 'bestiaire', 'commun', 'Rat géant', '🐀', 'Les caves de toutes les auberges en abritent au moins un.'],
  ['loup', 'bestiaire', 'commun', 'Loup', '🐺', 'Il chasse en meute et déteste être pris de haut.'],
  ['araignee-geante', 'bestiaire', 'commun', 'Araignée géante', '🕷️', 'Elle tisse sa toile entre deux arbres et attend patiemment.'],
  ['strige', 'bestiaire', 'commun', 'Strige', '🦟', 'Un moustique grand comme un chat, avec beaucoup trop d’appétit.'],
  ['potion-de-soins', 'relique', 'commun', 'Potion de soins', '🧪', 'Le goût est horrible, l’effet est parfait. L’aventurier prudent en garde toujours une.'],
  ['corde-de-chanvre', 'relique', 'commun', 'Corde de chanvre', '🪢', 'Quinze mètres de corde : la solution à un nombre étonnant de problèmes.'],
  ['torche', 'relique', 'commun', 'Torche', '🔥', 'Éclaire le couloir, effraie les rats et enflamme parfois les rideaux.'],
  ['rations-de-voyage', 'relique', 'commun', 'Rations de voyage', '🍖', 'Dures, salées, et pourtant on les attend avec impatience.'],
  ['des-pipes', 'relique', 'commun', 'Dés pipés', '🎲', 'Ils tombent toujours du bon côté. Mieux vaut ne pas se faire prendre.'],
  ['sac-a-dos', 'relique', 'commun', 'Sac à dos', '🎒', 'On y met tout, on y retrouve rien, et on le porte fièrement.'],
  ['pied-de-biche', 'relique', 'commun', 'Pied-de-biche', '🔧', 'Plus fiable qu’un sort pour ouvrir une porte coincée.'],
  ['dague', 'relique', 'commun', 'Dague', '🗡️', 'Discrète, légère, toujours à portée de main.'],

  // ───── Peu communes (14)
  ['ours-hibou', 'bestiaire', 'peu_commun', 'Ours-hibou', '🦉', 'Mi-ours, mi-hibou, entièrement mauvais caractère.'],
  ['cube-gelatineux', 'bestiaire', 'peu_commun', 'Cube gélatineux', '🟦', 'Il nettoie les couloirs du donjon en avalant tout sur son passage, aventuriers compris.'],
  ['harpie', 'bestiaire', 'peu_commun', 'Harpie', '🦅', 'Son chant est si beau qu’on oublie de regarder où l’on met les pieds.'],
  ['gnoll', 'bestiaire', 'peu_commun', 'Gnoll', '🐕', 'Un rire qui glace le sang, et une faim qui ne s’arrête jamais.'],
  ['ombre', 'bestiaire', 'peu_commun', 'Ombre', '👥', 'On la prend pour la sienne jusqu’au moment où elle bouge toute seule.'],
  ['rouilleur', 'bestiaire', 'peu_commun', 'Rouilleur', '🪲', 'Il dévore le métal. Les guerriers en armure le redoutent plus qu’un dragon.'],
  ['ogre', 'bestiaire', 'peu_commun', 'Ogre', '👹', 'Pas très malin, mais le gourdin fait le reste.'],
  ['sac-sans-fond', 'relique', 'peu_commun', 'Sac sans fond', '👝', 'Il contient bien plus qu’il n’en a l’air. Ne jamais y mettre un autre sac sans fond.'],
  ['cape-elfique', 'relique', 'peu_commun', 'Cape elfique', '🧥', 'Elle se fond dans le décor, et son porteur avec.'],
  ['baguette-de-detection-de-la-magie', 'relique', 'peu_commun', 'Baguette de détection de la magie', '🪄', 'Elle brille dès qu’un objet enchanté se trouve à proximité. Très pratique chez un brocanteur.'],
  ['anneau-de-saut', 'relique', 'peu_commun', 'Anneau de saut', '💍', 'Franchir un ravin devient une simple formalité.'],
  ['potion-de-croissance', 'relique', 'peu_commun', 'Potion de croissance', '🍄', 'Une gorgée, et la porte semble soudain bien basse.'],
  ['carquois-d-ehlonna', 'relique', 'peu_commun', 'Carquois d’Ehlonna', '🏹', 'Trois compartiments, et toujours la bonne flèche au bon moment.'],
  ['lanterne-a-capote', 'relique', 'peu_commun', 'Lanterne à capote', '🏮', 'Une lueur chaude pour traverser les couloirs les plus sombres.'],

  // ───── Rares (12)
  ['mimique', 'bestiaire', 'rare', 'Mimique', '🧰', 'Ce coffre a l’air magnifique. Ne l’ouvre surtout pas… ou fais-le quand même.'],
  ['basilic', 'bestiaire', 'rare', 'Basilic', '🐍', 'Son regard pétrifie : l’aventurier avisé avance à reculons.'],
  ['minotaure', 'bestiaire', 'rare', 'Minotaure', '🐂', 'Il garde son labyrinthe et connaît chaque couloir par cœur.'],
  ['manticore', 'bestiaire', 'rare', 'Manticore', '🦂', 'Un visage d’homme, un corps de lion, une queue pleine de pointes. Un mauvais voisin.'],
  ['golem-de-pierre', 'bestiaire', 'rare', 'Golem de pierre', '🗿', 'Il ne dort jamais, ne mange jamais, et ne discute jamais non plus.'],
  ['troll', 'bestiaire', 'rare', 'Troll', '🧌', 'Coupe-lui un bras : il en repousse un autre. Le feu règle souvent le problème.'],
  ['griffon', 'bestiaire', 'rare', 'Griffon', '🦁', 'Fier, rapide, fidèle : une monture de rêve pour qui sait s’en faire respecter.'],
  ['boule-de-cristal', 'relique', 'rare', 'Boule de cristal', '🔮', 'On y voit tout, sauf ce qu’on cherchait vraiment.'],
  ['trou-portatif', 'relique', 'rare', 'Trou portatif', '🕳️', 'Un trou noir qu’on pose par terre et qu’on range ensuite dans sa poche.'],
  ['bottes-de-vitesse', 'relique', 'rare', 'Bottes de vitesse', '🥾', 'Un claquement de talons, et le monde ralentit autour de toi.'],
  ['baguette-de-projectiles-magiques', 'relique', 'rare', 'Baguette de projectiles magiques', '✨', 'Trois traits lumineux qui ne ratent jamais leur cible.'],
  ['lame-de-flamme', 'relique', 'rare', 'Lame de flamme', '🔥', 'Une épée qui s’embrase au mot de commande. Les marchands de bois la détestent.'],

  // ───── Épiques (10)
  ['vampire', 'bestiaire', 'epique', 'Vampire', '🧛', 'Élégant, patient, et toujours à la recherche d’une invitation.'],
  ['hydre', 'bestiaire', 'epique', 'Hydre', '🐉', 'Trancher une tête n’a jamais été une bonne idée.'],
  ['golem-de-fer', 'bestiaire', 'epique', 'Golem de fer', '🤖', 'Un colosse forgé pour obéir, et pour ne jamais s’arrêter.'],
  ['geant-du-givre', 'bestiaire', 'epique', 'Géant du givre', '🧊', 'Il vit dans un palais de glace et trouve la chaleur de la taverne insupportable.'],
  ['jeune-dragon-rouge', 'bestiaire', 'epique', 'Jeune dragon rouge', '🐲', 'Encore petit pour un dragon, mais déjà largement assez grand pour toi.'],
  ['flagelleur-mental', 'bestiaire', 'epique', 'Flagelleur mental', '🦑', 'Ses tentacules cherchent des idées à dévorer. Il aime surtout les plus brillantes.'],
  ['baton-du-pouvoir', 'relique', 'epique', 'Bâton du pouvoir', '🔱', 'Un bâton d’archimage : chaque sort qui en sort frappe plus fort.'],
  ['cor-de-valhalla', 'relique', 'epique', 'Cor de Valhalla', '🎺', 'Une sonnerie suffit à convoquer des guerriers venus d’un autre monde.'],
  ['bouteille-d-efrit', 'relique', 'epique', 'Bouteille d’éfrit', '🍾', 'Bouchon fermé, un génie de feu s’impatiente à l’intérieur. Vaut mieux qu’il soit de bonne humeur.'],
  ['lame-de-chance', 'relique', 'epique', 'Lame de chance', '🍀', 'On dit qu’elle porte bonheur à celui qui la tient. Elle exauce même un souhait, parfois.'],

  // ───── Légendaires (8)
  ['tarasque', 'bestiaire', 'legendaire', 'Tarasque', '🦖', 'Une montagne de griffes et de rage. Les villages l’appellent un cataclysme.'],
  ['tyrannoeil', 'bestiaire', 'legendaire', 'Tyrannœil', '👁️', 'Dix yeux, dix rayons, et une fierté démesurée : il se croit toujours le plus grand.'],
  ['liche', 'bestiaire', 'legendaire', 'Liche', '☠️', 'Un mage si attaché à la vie qu’il a refusé d’en sortir. Son phylactère est bien caché.'],
  ['dragon-rouge-ancien', 'bestiaire', 'legendaire', 'Dragon rouge ancien', '🔴', 'Il dort sur une montagne d’or et n’a rien oublié, jamais, de personne.'],
  ['jeu-du-destin', 'relique', 'legendaire', 'Jeu du destin', '🃏', 'Tire une carte, change ta vie. Tire-en une deuxième si tu es téméraire.'],
  ['epee-vorpale', 'relique', 'legendaire', 'Épée vorpale', '⚔️', 'Elle tranche tout ce qui est trop sûr de sa tête.'],
  ['sphere-d-annihilation', 'relique', 'legendaire', 'Sphère d’annihilation', '⚫', 'Une boule de néant parfaite. Ne la touche pas. Vraiment.'],
  ['anneau-de-souhaits', 'relique', 'legendaire', 'Anneau de souhaits', '💫', 'Ton vœu le plus fou, exaucé. Formule-le avec soin : les génies adorent les détails.'],
];
