// Les 7 classes classiques de D&D (voir docs/CLASSES.md). Source de `data/classes.fr.json` (npm run gen).
//
// Identifiants FIXES : ils sont aussi ceux des objets et des capacités de classe, et de la migration SQL
// (supabase/migrations/20261016000001_classes.sql). Ne pas les renommer.
//
// Chaque classe a 2 caractéristiques de maîtrise (bonus de maîtrise du moteur) et 2 voies (niveau 3), dont la
// caractéristique d'affinité varie. `favoredQuests` : 3 titres de quêtes du catalogue qui collent au style de la classe.
export default [
  {
    id: 'guerrier',
    name: 'Guerrier',
    icon: '⚔️',
    masteries: ['FOR', 'CON'],
    profile: 'Combattant robuste : endurance, sport, régularité',
    description:
      'Maître des armes et de l’effort, le guerrier encaisse autant qu’il frappe. Pour les sportifs et les réguliers : salle, cardio, endurance. Tu progresses surtout en Force et en Constitution.',
    favoredQuests: ['Séances de force, 3 dans la semaine', 'Endurance, 3 séances dans la semaine', 'Pompes, 40 aujourd’hui'],
    paths: [
      {
        id: 'guerrier-champion',
        name: 'Voie du Champion',
        ability: 'FOR',
        title: 'Champion de l’arène',
        description: 'Le champion vise la perfection physique, coup après coup. Ta voie ajoute une affinité Force : chaque effort de force te rapporte un petit supplément d’XP.',
      },
      {
        id: 'guerrier-chevalier',
        name: 'Voie du Chevalier',
        ability: 'CHA',
        title: 'Chevalier de la compagnie',
        description: 'Le chevalier se bat pour entraîner les autres derrière lui. Ta voie ajoute une affinité Charisme : tes quêtes sociales te rapportent un petit supplément d’XP.',
      },
    ],
  },
  {
    id: 'paladin',
    name: 'Paladin',
    icon: '🔨',
    masteries: ['FOR', 'CHA'],
    profile: 'Combattant sacré : force et présence au service des autres',
    description:
      'Lié par un serment, le paladin allie la puissance du guerrier à la présence d’un meneur. Pour ceux qui s’entraînent et qui entraînent les autres. Tu progresses surtout en Force et en Charisme.',
    favoredQuests: ['Pompes et dips, 30 de chaque', 'Aider un voisin ou un proche', 'Une activité à plusieurs'],
    paths: [
      {
        id: 'paladin-devotion',
        name: 'Serment de Dévotion',
        ability: 'SAG',
        title: 'Lame de lumière',
        description: 'Honnêteté, courage, compassion : tu tiens ta parole. Ta voie ajoute une affinité Sagesse : tes moments de calme te rapportent un petit supplément d’XP.',
      },
      {
        id: 'paladin-vengeance',
        name: 'Serment de Vengeance',
        ability: 'FOR',
        title: 'Bras de la justice',
        description: 'Tu poursuis ton but avec une obstination farouche. Ta voie ajoute une affinité Force : tes séances de force te rapportent un petit supplément d’XP.',
      },
    ],
  },
  {
    id: 'rodeur',
    name: 'Rôdeur',
    icon: '🏹',
    masteries: ['DEX', 'SAG'],
    profile: 'Chasseur et protecteur de la nature : agilité et attention',
    description:
      'Pisteur des terres sauvages, le rôdeur observe, s’adapte et frappe avec précision. Pour les amoureux de nature, d’agilité et de grands espaces. Tu progresses surtout en Dextérité et en Sagesse.',
    favoredQuests: ['Parcours d’agilité, 5 tours', 'Un moment dans la nature, sans écran', 'Nature, 2 sorties dans la semaine'],
    paths: [
      {
        id: 'rodeur-chasseur',
        name: 'Voie du Chasseur',
        ability: 'FOR',
        title: 'Traqueur de grands fauves',
        description: 'Tu t’attaques aux défis les plus costauds. Ta voie ajoute une affinité Force : tes efforts physiques te rapportent un petit supplément d’XP.',
      },
      {
        id: 'rodeur-belluaire',
        name: 'Voie du Maître des bêtes',
        ability: 'CON',
        title: 'Ami des sentiers',
        description: 'Ton compagnon animal et toi, vous allez loin. Ta voie ajoute une affinité Constitution : tes sorties longues te rapportent un petit supplément d’XP.',
      },
    ],
  },
  {
    id: 'clerc',
    name: 'Clerc',
    icon: '🌿',
    masteries: ['SAG', 'CON'],
    profile: 'Soigneur divin : résilience et sérénité',
    description:
      'Canal d’un pouvoir plus grand que lui, le clerc soigne, protège et garde son calme. Pour ceux qui prennent soin des autres et d’eux-mêmes : sommeil, méditation, nature. Tu progresses surtout en Sagesse et en Constitution.',
    favoredQuests: ['Méditation, 15 minutes', 'Trois gratitudes', 'Coucher régulier, 5 nuits sur 7'],
    paths: [
      {
        id: 'clerc-vie',
        name: 'Domaine de la Vie',
        ability: 'CON',
        title: 'Main qui apaise',
        description: 'Tes soins sont plus puissants que ceux de n’importe qui. Ta voie ajoute une affinité Constitution : ta vitalité te rapporte un petit supplément d’XP.',
      },
      {
        id: 'clerc-savoir',
        name: 'Domaine du Savoir',
        ability: 'INT',
        title: 'Archiviste de la foi',
        description: 'Tu cherches la vérité dans les textes anciens. Ta voie ajoute une affinité Intelligence : tes quêtes d’étude te rapportent un petit supplément d’XP.',
      },
    ],
  },
  {
    id: 'barde',
    name: 'Barde',
    icon: '🎵',
    masteries: ['CHA', 'DEX'],
    profile: 'Charismatique polyvalent : social et créativité',
    description:
      'Conteur, musicien, âme de la fête : le barde tisse la magie par la parole et la musique. Pour les artistes et les sociables qui aiment la scène. Tu progresses surtout en Charisme et en Dextérité.',
    favoredQuests: ['Préparer et dire un court exposé', 'Jonglage, 10 cascades', 'Danse libre, 2 morceaux'],
    paths: [
      {
        id: 'barde-vaillance',
        name: 'Collège de la Vaillance',
        ability: 'FOR',
        title: 'Chantre des batailles',
        description: 'Tu chantes sur le champ de bataille et tu t’y tiens. Ta voie ajoute une affinité Force : tes efforts physiques te rapportent un petit supplément d’XP.',
      },
      {
        id: 'barde-savoir',
        name: 'Collège du Savoir',
        ability: 'INT',
        title: 'Mémoire vivante',
        description: 'Tu collectionnes les histoires et les secrets. Ta voie ajoute une affinité Intelligence : tes quêtes d’apprentissage te rapportent un petit supplément d’XP.',
      },
    ],
  },
  {
    id: 'roublard',
    name: 'Roublard',
    icon: '🗡️',
    masteries: ['DEX', 'INT'],
    profile: 'Agile et rusé : débrouille, précision, ingéniosité',
    description:
      'Discret, précis, jamais à court d’idées : le roublard résout les problèmes par l’astuce plutôt que par la force. Pour les bricoleurs, les stratèges et ceux qui apprennent en faisant. Tu progresses surtout en Dextérité et en Intelligence.',
    favoredQuests: ['Geste précis, 4 séances', 'Trois raccourcis clavier', 'Programmation, 3 exercices'],
    paths: [
      {
        id: 'roublard-voleur',
        name: 'Voie du Voleur',
        ability: 'CHA',
        title: 'Fine lame de la guilde',
        description: 'Tu as la main leste et la langue bien pendue. Ta voie ajoute une affinité Charisme : tes quêtes sociales te rapportent un petit supplément d’XP.',
      },
      {
        id: 'roublard-assassin',
        name: 'Voie de l’Assassin',
        ability: 'SAG',
        title: 'Patience de l’ombre',
        description: 'Tu observes longtemps pour ne frapper qu’une fois. Ta voie ajoute une affinité Sagesse : tes moments d’attention te rapportent un petit supplément d’XP.',
      },
    ],
  },
  {
    id: 'magicien',
    name: 'Magicien',
    icon: '🔮',
    masteries: ['INT', 'CON'],
    profile: 'Érudit lanceur de sorts : apprentissage et discipline',
    description:
      'Étudiant éternel des arcanes, le magicien tire sa puissance de ses livres et de sa persévérance. Pour les lecteurs, les curieux et ceux qui apprennent sans cesse. Tu progresses surtout en Intelligence et en Constitution.',
    favoredQuests: ['Lecture, 20 pages', 'Cours en ligne, 2 leçons', 'Écrans coupés avant dormir, 5 soirs'],
    paths: [
      {
        id: 'magicien-evocation',
        name: 'Voie de l’Évocation',
        ability: 'INT',
        title: 'Maître des éclairs',
        description: 'Tu canalises ton savoir en puissance brute. Ta voie ajoute une affinité Intelligence : tes quêtes d’étude te rapportent un petit supplément d’XP.',
      },
      {
        id: 'magicien-abjuration',
        name: 'Voie de l’Abjuration',
        ability: 'SAG',
        title: 'Rempart des arcanes',
        description: 'Tu protèges plus que tu ne détruis, par le calme et la mesure. Ta voie ajoute une affinité Sagesse : tes moments de calme te rapportent un petit supplément d’XP.',
      },
    ],
  },
];
