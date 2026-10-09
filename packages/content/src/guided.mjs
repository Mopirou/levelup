// Quêtes guidées par discipline. Chaque activité donne 4 quêtes, une par palier :
//   palier 1 = journée (chronomètre), 2 = semaine, 3 = mois, 4 = épique (compteurs de minutes cumulées).
// L’XP d’une quête est répartie entre une caractéristique principale et des secondaires (part en %).
// Thème : { id, label, blurb, primary, secondary: [[caractéristique, %]], physical, time: [jour min, semaine min, mois h, épique h], activities }
// Activité : [nom, action (infinitif), pourquoi, déroulé conseillé, conseil technique, objectif final]

export default [
  {
    id: 'danse', label: 'Danse', blurb: 'Coordination, rythme et plaisir de bouger avec les autres.',
    primary: 'DEX', secondary: [['CHA', 30], ['FOR', 10]], physical: true, time: [20, 90, 6, 25],
    activities: [
      ['Salsa', 'danser la salsa (pas de base, tours et déplacements)', 'La salsa travaille le rythme, les appuis et le plaisir de danser à deux.', 'Déroulé conseillé : 3 minutes d’échauffement, pas de base, puis enchaînement de figures et retour au calme.', 'Garde les genoux souples et compte les temps à voix haute.', 'enchaîner une chorégraphie de 3 minutes sans t’arrêter'],
      ['Hip-hop', 'danser le hip-hop (isolations, grooves et enchaînements)', 'Le hip-hop développe la coordination et l’expression personnelle.', 'Déroulé conseillé : échauffement des articulations, grooves de base, apprentissage d’un enchaînement de 8 temps.', 'Travaille d’abord le rythme du buste, puis ajoute les bras.', 'apprendre et présenter un enchaînement de 2 minutes'],
      ['Valse', 'danser la valse (pas de base à trois temps et déplacements)', 'La valse est une danse de couple qui exerce posture, guidage et fluidité.', 'Déroulé conseillé : posture et pas de base, rotations, puis danse sur un morceau entier.', 'Reste grand, épaules basses, et laisse la musique guider tes pas.', 'danser une valse complète avec un partenaire'],
      ['Danse contemporaine', 'pratiquer la danse contemporaine (travail au sol, élan et fluidité)', 'Cette danse libère le mouvement et travaille l’équilibre et la souplesse.', 'Déroulé conseillé : échauffement au sol, déplacements dans l’espace, improvisation guidée.', 'Respire dans chaque mouvement et ne cherche pas la vitesse.', 'composer une courte improvisation de 3 minutes'],
      ['Zumba', 'suivre un cours de zumba (chorégraphies rythmées et cardio)', 'La zumba mêle danse et cardio : on bouge sans penser à l’effort.', 'Déroulé conseillé : échauffement, enchaînement de chansons à rythmes différents, retour au calme.', 'Suis le rythme avant de chercher l’exactitude des pas.', 'suivre un cours complet de 45 minutes sans pause'],
    ],
  },
  {
    id: 'musculation', label: 'Musculation', blurb: 'Gagner en force avec des séances structurées.',
    primary: 'FOR', secondary: [['CON', 20]], physical: true, time: [30, 120, 8, 30],
    activities: [
      ['Muscu haut du corps', 'faire une séance de musculation du haut du corps (pectoraux, épaules, bras)', 'Un haut du corps solide facilite pousser, tirer et porter.', 'Déroulé conseillé : échauffement des épaules, 4 exercices en 3 séries, étirements.', 'Garde les omoplates serrées et contrôle chaque descente.', 'augmenter de 20 % la charge ou les répétitions de départ'],
      ['Jambes et fessiers', 'faire une séance de musculation des jambes et des fessiers', 'Les jambes sont les plus gros muscles : les travailler fait progresser tout le corps.', 'Déroulé conseillé : échauffement, squats, fentes, soulevé de terre léger, étirements.', 'Pousse avec les talons et garde le dos neutre.', 'réaliser une série de squats avec 20 % de charge en plus'],
      ['Dos et tirage', 'faire une séance de dos et de tirage (rowing, tractions, élastiques)', 'Un dos fort corrige la posture et protège les épaules.', 'Déroulé conseillé : échauffement, rowings, tirages, travail de gainage, étirements.', 'Tire avec les coudes plutôt qu’avec les mains.', 'réussir 5 tractions ou une série de rowings plus lourde'],
      ['Corps entier haltères', 'suivre une séance corps entier avec haltères', 'Une séance corps entier est la plus efficace quand on manque de temps.', 'Déroulé conseillé : échauffement, 6 exercices en circuit, 3 tours, étirements.', 'Choisis une charge qui te laisse deux répétitions en réserve.', 'compléter un circuit de 45 minutes avec des charges croissantes'],
      ['Kettlebell', 'suivre une séance de kettlebell (swings, goblet squats, développés)', 'Le kettlebell combine force, explosivité et cardio.', 'Déroulé conseillé : mobilité des hanches, swings, goblet squats, développés, retour au calme.', 'Le mouvement part des hanches, pas des bras.', 'enchaîner 100 swings en moins de 10 minutes'],
    ],
  },
  {
    id: 'pilates', label: 'Pilates', blurb: 'Gainage, contrôle et souplesse du centre du corps.',
    primary: 'DEX', secondary: [['FOR', 30], ['SAG', 20]], physical: true, time: [20, 90, 6, 25],
    activities: [
      ['Pilates débutant', 'suivre un cours de pilates sur tapis pour débutants', 'Le pilates apprend à contrôler son centre et à respirer pendant l’effort.', 'Déroulé conseillé : respiration, bascule du bassin, cent, roll-up, étirements.', 'Expire à l’effort et garde le ventre rentré sans crisper.', 'réaliser une séance complète de 30 minutes avec fluidité'],
      ['Pilates gainage', 'suivre un cours de pilates centré sur le gainage', 'Un centre fort stabilise toute la colonne et le bassin.', 'Déroulé conseillé : planches, séries de gainage latéral, relevés de jambes, retour au calme.', 'Allonge la colonne plutôt que de la cambrer.', 'tenir 2 minutes de planche avec une bonne posture'],
      ['Pilates dos et posture', 'suivre un cours de pilates pour le dos et la posture', 'Le pilates soulage le dos et améliore le maintien.', 'Déroulé conseillé : mobilité de la colonne, renforcement dorsal, étirements du dos.', 'Mobilise vertèbre par vertèbre, lentement.', 'enchaîner une séance de dos de 25 minutes sans douleur'],
      ['Pilates jambes et fessiers', 'suivre un cours de pilates pour les jambes et les fessiers', 'Les exercices lents de pilates sculptent les jambes sans impact.', 'Déroulé conseillé : ponts, séries sur le côté, cercles de jambes, étirements.', 'Garde le bassin stable pendant que la jambe travaille.', 'tenir un enchaînement de 20 minutes de jambes et fessiers'],
      ['Pilates avec ballon', 'suivre un cours de pilates avec petit ballon ou swiss ball', 'Le ballon instable renforce l’équilibre et les muscles profonds.', 'Déroulé conseillé : assise active, ponts sur ballon, gainage, étirements.', 'Reste lent : l’instabilité est le travail.', 'tenir une séance de 30 minutes avec le ballon'],
    ],
  },
  {
    id: 'yoga', label: 'Yoga', blurb: 'Souplesse, équilibre et respiration.',
    primary: 'DEX', secondary: [['SAG', 40], ['CON', 10]], physical: true, time: [20, 100, 6, 25],
    activities: [
      ['Yoga doux', 'suivre un cours de yoga doux (postures lentes, respiration)', 'Le yoga doux détend le corps et le mental sans forcer.', 'Déroulé conseillé : respiration, salutation au soleil lente, postures au sol, relaxation finale.', 'Ne force jamais une posture : la limite est la gêne, pas la douleur.', 'suivre un cours complet de 45 minutes sans interruption'],
      ['Yoga vinyasa', 'suivre un cours de yoga vinyasa (enchaînements dynamiques)', 'Le vinyasa relie mouvement et respiration dans un flux continu.', 'Déroulé conseillé : échauffement, salutations au soleil, postures debout, relaxation.', 'Relie chaque mouvement à une inspiration ou une expiration.', 'enchaîner 6 salutations au soleil de façon fluide'],
      ['Yoga du dos', 'suivre un cours de yoga pour le dos et la nuque', 'Le yoga soulage les tensions accumulées devant l’écran.', 'Déroulé conseillé : mobilité de la nuque, torsions, postures du chat et de l’enfant, relaxation.', 'Allonge la colonne avant de la tourner.', 'faire 20 minutes de yoga du dos sans tension'],
      ['Yin yoga', 'suivre un cours de yin yoga (postures tenues plusieurs minutes)', 'Tenir longtemps assouplit les tissus profonds.', 'Déroulé conseillé : 5 à 6 postures tenues 3 minutes chacune, avec respiration lente.', 'Relâche-toi un peu plus à chaque expiration.', 'tenir une posture 5 minutes en restant détendu'],
      ['Yoga équilibres', 'suivre un cours de yoga axé sur les équilibres (arbre, guerrier, aigle)', 'Les postures d’équilibre développent la concentration et la stabilité.', 'Déroulé conseillé : échauffement, postures d’équilibre debout, retour au calme.', 'Fixe un point devant toi pour rester stable.', 'tenir l’arbre 1 minute de chaque côté'],
    ],
  },
  {
    id: 'cuisine', label: 'Cuisine', blurb: 'Apprendre à cuisiner pour mieux manger et partager.',
    primary: 'CON', secondary: [['INT', 30], ['CHA', 20]], physical: false, time: [35, 120, 8, 30],
    activities: [
      ['Pâtes fraîches', 'cuisiner des pâtes fraîches maison, de la pâte à la sauce', 'Faire des pâtes fraîches demande de la technique et donne des repas à partager.', 'Déroulé conseillé : préparer la pâte, la laisser reposer, l’étaler, la couper, la cuire et la sauce.', 'Laisse la pâte reposer 30 minutes pour qu’elle soit élastique.', 'préparer un repas complet de pâtes maison pour 4 personnes'],
      ['Pain maison', 'faire son pain maison (pétrissage, pousse et cuisson)', 'Le pain apprend la patience et le geste du pétrissage.', 'Déroulé conseillé : pétrir, laisser pousser, façonner, cuire et laisser refroidir.', 'Respecte les temps de repos : la pâte fait le travail.', 'réussir un pain maison avec une belle croûte et une mie aérée'],
      ['Cuisine du monde', 'cuisiner un plat d’une autre cuisine (thaï, indienne, mexicaine, libanaise)', 'Découvrir d’autres cuisines élargit le goût et les techniques.', 'Déroulé conseillé : choisir une recette, préparer les ingrédients, cuisiner, goûter et ajuster.', 'Prépare tous les ingrédients avant d’allumer le feu.', 'préparer un menu complet d’une même cuisine pour des invités'],
      ['Batch cooking', 'faire un batch cooking : préparer plusieurs repas pour la semaine', 'Préparer à l’avance évite les repas improvisés et trop gras.', 'Déroulé conseillé : planifier le menu, faire les courses, cuire en série, ranger en boîtes.', 'Cuis les bases (riz, légumes, protéines) en grande quantité.', 'préparer les repas de 5 jours en une seule session'],
      ['Pâtisserie', 'réaliser une pâtisserie maison (gâteau, tarte ou biscuits)', 'La pâtisserie demande de la précision et donne de quoi partager.', 'Déroulé conseillé : peser les ingrédients, préparer la pâte, cuire, laisser refroidir, décorer.', 'Pèse tes ingrédients : en pâtisserie, la précision compte.', 'réussir un entremets ou un gâteau de fête à partager'],
    ],
  },
  {
    id: 'botanique', label: 'Botanique', blurb: 'Apprendre à connaître et à cultiver les plantes.',
    primary: 'INT', secondary: [['SAG', 30], ['CON', 20]], physical: false, time: [25, 100, 6, 25],
    activities: [
      ['Plantes d’intérieur', 'entretenir tes plantes d’intérieur (arrosage, lumière, rempotage)', 'Les plantes d’intérieur apportent calme et air plus sain.', 'Déroulé conseillé : observer chaque plante, arroser selon ses besoins, nettoyer les feuilles, rempoter si besoin.', 'Arrose quand la terre est sèche sur 2 cm, pas selon un calendrier.', 'faire pousser et entretenir 5 plantes en bonne santé'],
      ['Potager', 'travailler ton potager (semis, désherbage, arrosage, récolte)', 'Cultiver ses légumes apprend la patience et améliore l’alimentation.', 'Déroulé conseillé : préparer le sol, semer ou repiquer, arroser, désherber, récolter.', 'Arrose tôt le matin pour limiter l’évaporation.', 'récolter et cuisiner une première production de ton potager'],
      ['Herbes aromatiques', 'cultiver des herbes aromatiques (basilic, menthe, thym, persil)', 'Des herbes fraîches à portée de main améliorent les repas.', 'Déroulé conseillé : semer ou bouturer, arroser, pincer les tiges, récolter et cuisiner.', 'Pince les tiges pour que la plante se ramifie.', 'cultiver 4 herbes différentes et les utiliser dans des repas'],
      ['Reconnaître les arbres', 'apprendre à reconnaître les arbres et plantes de ton quartier', 'Savoir nommer ce qui nous entoure change le regard sur la nature.', 'Déroulé conseillé : balade avec une application d’identification, notes et dessins, fiche de synthèse.', 'Observe feuilles, écorce et fruits avant de chercher le nom.', 'identifier 25 espèces d’arbres et de plantes de ta région'],
      ['Compost et sol', 'étudier et pratiquer le compostage et la santé du sol', 'Un sol vivant est la base de toute culture durable.', 'Déroulé conseillé : lire un guide, monter un composteur, alterner matières vertes et brunes, retourner.', 'Équilibre déchets humides et secs pour éviter les odeurs.', 'obtenir un compost mûr et l’utiliser dans ton potager ou tes pots'],
    ],
  },
  {
    id: 'course', label: 'Course à pied', blurb: 'Construire son souffle et son endurance.',
    primary: 'CON', secondary: [['FOR', 20], ['SAG', 10]], physical: true, time: [30, 120, 8, 30],
    activities: [
      ['Footing facile', 'courir à allure facile, en pouvant parler', 'Le footing en aisance respiratoire construit la base de l’endurance.', 'Déroulé conseillé : 5 minutes de marche rapide, footing, 5 minutes de marche, étirements.', 'Si tu ne peux plus parler, ralentis.', 'courir 5 km sans t’arrêter'],
      ['Fractionné', 'faire une séance de fractionné (alternance de courses rapides et lentes)', 'Le fractionné améliore la vitesse et le cardio en peu de temps.', 'Déroulé conseillé : échauffement, 6 séries de 1 minute rapide et 1 minute lente, retour au calme.', 'Garde la même allure sur toutes les séries.', 'courir 6 séries de 2 minutes rapides sans perdre le rythme'],
      ['Préparation 10 km', 'suivre une séance de préparation 10 km', 'Un plan progressif amène à une distance sans se blesser.', 'Déroulé conseillé : échauffement, bloc d’allure régulière, retour au calme, étirements.', 'Augmente la durée de 10 % par semaine, pas plus.', 'courir 10 km à allure régulière'],
      ['Côtes et dénivelé', 'courir en côte et sur terrain varié', 'Les côtes renforcent les jambes et le souffle.', 'Déroulé conseillé : échauffement, 5 montées de 1 minute, descente en marchant, footing de récupération.', 'Raccourcis la foulée en montée et penche-toi légèrement.', 'courir un parcours de 8 km avec 200 m de dénivelé'],
      ['Marche-course', 'alterner marche et course (méthode pour débutants)', 'Alterner marche et course permet de progresser sans s’épuiser.', 'Déroulé conseillé : 5 minutes de marche, alternance 1 minute de course et 2 minutes de marche, retour au calme.', 'Allonge peu à peu les phases de course.', 'courir 20 minutes d’affilée sans marcher'],
    ],
  },
  {
    id: 'natation', label: 'Natation', blurb: 'Un sport complet et sans impact.',
    primary: 'CON', secondary: [['FOR', 25], ['DEX', 15]], physical: true, time: [30, 120, 8, 30],
    activities: [
      ['Crawl', 'nager le crawl (respiration, battements, bras)', 'Le crawl développe le souffle et muscle tout le corps.', 'Déroulé conseillé : échauffement, éducatifs, séries de 100 m, retour au calme.', 'Expire dans l’eau et tourne la tête pour inspirer.', 'nager 400 m de crawl sans t’arrêter'],
      ['Brasse', 'nager la brasse (coordination bras-jambes, glisse)', 'La brasse est la nage la plus accessible, idéale pour progresser.', 'Déroulé conseillé : échauffement, séries de 50 m, éducatifs, retour au calme.', 'Allonge la glisse après chaque mouvement.', 'nager 800 m de brasse en continu'],
      ['Dos crawlé', 'nager le dos crawlé', 'Cette nage soulage le dos et renforce les épaules.', 'Déroulé conseillé : échauffement, battements de jambes, séries de 50 m, retour au calme.', 'Garde la tête immobile et les hanches hautes.', 'nager 400 m de dos crawlé sans t’arrêter'],
      ['Endurance en piscine', 'nager en endurance (séries longues à allure régulière)', 'Les longues séries construisent le souffle.', 'Déroulé conseillé : échauffement, séries de 200 m, récupération courte, retour au calme.', 'Compte tes longueurs pour garder un rythme.', 'nager 1 500 m en 45 minutes'],
      ['Aquagym', 'suivre un cours d’aquagym', 'L’eau soutient les articulations tout en offrant une résistance.', 'Déroulé conseillé : échauffement, exercices de cardio, renforcement, étirements dans l’eau.', 'Garde de l’eau jusqu’aux épaules pour la résistance.', 'suivre un cours complet de 45 minutes avec plein de dynamisme'],
    ],
  },
  {
    id: 'arts-martiaux', label: 'Arts martiaux', blurb: 'Force, précision du geste et maîtrise de soi.',
    primary: 'FOR', secondary: [['DEX', 40], ['SAG', 20]], physical: true, time: [30, 120, 8, 30],
    activities: [
      ['Boxe', 'suivre un cours de boxe (garde, déplacements, enchaînements)', 'La boxe travaille le cardio, la coordination et la confiance.', 'Déroulé conseillé : corde à sauter, boxe dans le vide, sac de frappe, gainage.', 'Garde les mains hautes et le menton rentré.', 'enchaîner 3 rounds de 3 minutes sur un sac'],
      ['Judo', 'suivre un cours de judo (chutes, saisies, projections)', 'Le judo apprend à tomber, à garder son équilibre et à respecter l’autre.', 'Déroulé conseillé : échauffement, chutes, mouvements de base, randori léger.', 'Apprends à chuter avant d’apprendre à projeter.', 'réussir une projection de base proprement'],
      ['Karaté', 'suivre un cours de karaté (katas, techniques de base)', 'Le karaté travaille la précision, la discipline et la concentration.', 'Déroulé conseillé : échauffement, techniques de base, kata, relaxation.', 'Cherche la précision avant la puissance.', 'exécuter un kata complet de mémoire'],
      ['Taï-chi', 'pratiquer le taï-chi (mouvements lents et respiration)', 'Le taï-chi développe l’équilibre et la sérénité par la lenteur.', 'Déroulé conseillé : respiration, séquence de mouvements lents, étirements doux.', 'Garde les genoux souples et le poids bien réparti.', 'enchaîner une forme de 24 mouvements'],
      ['Self-défense', 'suivre un cours de self-défense (esquives, dégagements, vigilance)', 'La self-défense donne confiance et réflexes.', 'Déroulé conseillé : échauffement, esquives, dégagements, mises en situation, retour au calme.', 'Apprends d’abord à éviter, puis à te protéger.', 'enchaîner une séquence de 5 techniques sous pression'],
    ],
  },
  {
    id: 'escalade', label: 'Escalade', blurb: 'Force du corps, précision des appuis et lecture de voie.',
    primary: 'FOR', secondary: [['DEX', 40], ['SAG', 15]], physical: true, time: [40, 150, 8, 30],
    activities: [
      ['Bloc débutant', 'grimper en bloc sur des voies faciles à moyennes', 'Le bloc apprend les appuis et la lecture d’un passage.', 'Déroulé conseillé : échauffement, voies faciles, voies moyennes, étirements.', 'Pousse avec les jambes, garde les bras tendus.', 'réussir 10 voies de niveau moyen'],
      ['Escalade technique', 'travailler la technique d’escalade (pieds, hanches, équilibre)', 'Une bonne technique économise la force.', 'Déroulé conseillé : traversée de bloc, exercices de pieds silencieux, voies de difficulté croissante.', 'Place les pieds avec précision avant de monter.', 'réussir une voie d’un niveau supérieur'],
      ['Grimpe en voie', 'grimper en voie (assurage, endurance, enchaînement)', 'La grimpe en voie développe l’endurance et la confiance.', 'Déroulé conseillé : échauffement, 3 voies de difficulté croissante, retour au calme.', 'Respire et repose-toi sur les bonnes prises.', 'enchaîner 3 voies de suite sans tomber'],
      ['Renfo pour grimpeurs', 'faire du renforcement pour l’escalade (tractions, gainage, doigts)', 'Un renforcement ciblé améliore les performances et prévient les blessures.', 'Déroulé conseillé : échauffement, tractions, gainage, travail des doigts progressif.', 'Évite de forcer sur les doigts sans échauffement.', 'réussir 5 tractions et 1 minute de planche'],
      ['Souplesse du grimpeur', 'travailler la souplesse et la mobilité pour l’escalade', 'Une grande amplitude permet de poser les pieds plus haut.', 'Déroulé conseillé : mobilité des hanches, étirements des jambes, des épaules et du dos.', 'Respire lentement dans chaque étirement.', 'faire le grand écart facial ou lever le pied à hauteur de la taille'],
    ],
  },
  {
    id: 'musique', label: 'Musique', blurb: 'Apprendre un instrument, de l’oreille aux doigts.',
    primary: 'DEX', secondary: [['INT', 40], ['SAG', 10]], physical: false, time: [25, 120, 8, 30],
    activities: [
      ['Guitare', 'apprendre la guitare (accords, rythmes, morceaux)', 'La guitare est un instrument accessible qui récompense la régularité.', 'Déroulé conseillé : échauffement des doigts, accords, rythme, apprentissage d’un morceau.', 'Joue lentement et monte en vitesse seulement quand c’est propre.', 'jouer un morceau complet de mémoire'],
      ['Piano', 'apprendre le piano (lecture, gammes, morceaux)', 'Le piano entraîne les deux mains et la lecture musicale.', 'Déroulé conseillé : gammes, exercices à deux mains, travail d’un morceau, lecture à vue.', 'Travaille chaque main séparément avant de les réunir.', 'jouer un morceau de niveau débutant avec les deux mains'],
      ['Ukulélé', 'apprendre le ukulélé (accords et chansons simples)', 'Le ukulélé permet de jouer des morceaux dès la première semaine.', 'Déroulé conseillé : accords de base, rythme, une chanson simple chantée.', 'Change d’accord en gardant le rythme constant.', 'jouer et chanter 3 chansons de bout en bout'],
      ['Batterie ou percussions', 'travailler la batterie ou les percussions (rythmes et coordination)', 'La batterie développe la coordination des quatre membres.', 'Déroulé conseillé : échauffement des poignets, rythmes de base, jeu sur un morceau.', 'Compte à voix haute et reste régulier.', 'jouer un morceau complet avec un rythme stable'],
      ['Chant et solfège', 'travailler le chant et le solfège (voix, justesse, lecture)', 'Chanter juste et lire la musique développe l’oreille.', 'Déroulé conseillé : échauffement vocal, gammes, lecture rythmique, travail d’une chanson.', 'Chante debout, sans tension dans les épaules.', 'chanter un morceau en public ou devant des proches'],
    ],
  },
  {
    id: 'theatre', label: 'Théâtre et prise de parole', blurb: 'S’exprimer avec aisance et présence.',
    primary: 'CHA', secondary: [['DEX', 20], ['SAG', 20]], physical: false, time: [25, 100, 6, 25],
    activities: [
      ['Improvisation', 'pratiquer l’improvisation théâtrale (jeux de scène, écoute, répartie)', 'L’impro apprend à écouter et à rebondir sans préparation.', 'Déroulé conseillé : échauffement, jeux de groupe, scènes courtes, débrief.', 'Accepte toujours la proposition de ton partenaire.', 'participer à une séance d’impro de 1 heure en public'],
      ['Éloquence', 'travailler l’éloquence (structure, voix, gestes)', 'Parler clairement donne du poids à ce qu’on dit.', 'Déroulé conseillé : échauffement de la voix, structure d’un discours, enregistrement et réécoute.', 'Fais des pauses plutôt que des « euh ».', 'prononcer un discours de 5 minutes devant un public'],
      ['Chant', 'travailler le chant (respiration, justesse, interprétation)', 'La voix est le premier instrument de communication.', 'Déroulé conseillé : respiration, échauffement vocal, travail d’un morceau, interprétation.', 'Respire par le ventre et garde la gorge détendue.', 'chanter un morceau complet devant un public'],
      ['Lecture à voix haute', 'travailler la lecture à voix haute (diction, rythme, émotion)', 'Lire à voix haute entraîne l’articulation et l’expression.', 'Déroulé conseillé : échauffement des lèvres, lecture d’un texte, enregistrement, correction.', 'Articule en exagérant, puis relâche.', 'lire une nouvelle de 10 minutes de façon vivante'],
      ['Théâtre', 'suivre un cours de théâtre (jeu, texte, corps)', 'Le théâtre développe la présence et l’expression des émotions.', 'Déroulé conseillé : échauffement corporel, travail de scène, répétitions, retour collectif.', 'Joue la situation, pas le texte.', 'jouer une scène de 5 minutes devant un public'],
    ],
  },
  {
    id: 'dessin', label: 'Dessin et peinture', blurb: 'Observer, composer et exprimer.',
    primary: 'DEX', secondary: [['SAG', 30], ['INT', 20]], physical: false, time: [30, 120, 8, 30],
    activities: [
      ['Dessin d’observation', 'dessiner d’après modèle (objets, visages, paysages)', 'Dessiner ce qu’on voit apprend à regarder.', 'Déroulé conseillé : esquisses rapides, proportions, ombres, finitions.', 'Commence par les formes générales avant les détails.', 'réaliser un portrait ou une nature morte aboutie'],
      ['Aquarelle', 'peindre à l’aquarelle (lavis, dégradés, transparences)', 'L’aquarelle apprend à accepter l’imprévu.', 'Déroulé conseillé : préparation du papier, lavis, dégradés, détails.', 'Travaille du clair au foncé et laisse sécher entre les couches.', 'peindre un paysage complet à l’aquarelle'],
      ['Croquis urbain', 'faire des croquis de scènes urbaines sur le vif', 'Croquer vite entraîne l’œil et la main.', 'Déroulé conseillé : repérage, croquis de 5 minutes, compositions plus longues.', 'Ne gomme pas : accepte le trait.', 'remplir un carnet de 20 croquis'],
      ['Peinture acrylique', 'peindre à l’acrylique (couleurs, mélanges, textures)', 'L’acrylique sèche vite et permet de corriger.', 'Déroulé conseillé : préparer la toile, mélanger les couleurs, peindre en couches, finitions.', 'Mélange tes couleurs plutôt que d’utiliser les tubes bruts.', 'réaliser un tableau complet sur toile'],
      ['Calligraphie', 'pratiquer la calligraphie (lettres, ligatures, rythme)', 'La calligraphie demande de la précision et du calme.', 'Déroulé conseillé : tenue de la plume, lettres de base, mots, mise en page.', 'Respire et écris lentement.', 'calligraphier une page complète avec une belle mise en page'],
    ],
  },
  {
    id: 'langues', label: 'Langues', blurb: 'Apprendre à comprendre et à parler une autre langue.',
    primary: 'INT', secondary: [['CHA', 30]], physical: false, time: [20, 100, 8, 30],
    activities: [
      ['Anglais', 'travailler l’anglais (vocabulaire, écoute, expression)', 'L’anglais ouvre l’accès à des contenus et à des rencontres du monde entier.', 'Déroulé conseillé : révision du vocabulaire, écoute d’un audio, phrases à voix haute.', 'Parle à voix haute, même seul.', 'tenir une conversation de 15 minutes en anglais'],
      ['Espagnol', 'travailler l’espagnol (vocabulaire, écoute, expression)', 'L’espagnol est parlé par des centaines de millions de personnes.', 'Déroulé conseillé : révision du vocabulaire, écoute, phrases à voix haute.', 'Répète les sons à voix haute pour fixer la prononciation.', 'tenir une conversation de 10 minutes en espagnol'],
      ['Italien', 'travailler l’italien (vocabulaire, écoute, expression)', 'L’italien est une langue proche du français et agréable à apprendre.', 'Déroulé conseillé : vocabulaire, écoute, phrases à voix haute.', 'Appuie-toi sur les mots ressemblants pour avancer vite.', 'tenir une conversation de 10 minutes en italien'],
      ['Allemand', 'travailler l’allemand (vocabulaire, grammaire, expression)', 'L’allemand est utile pour le travail et les voyages.', 'Déroulé conseillé : vocabulaire, grammaire, écoute, phrases à voix haute.', 'Apprends chaque nom avec son article.', 'tenir une conversation de 10 minutes en allemand'],
      ['Langue des signes', 'apprendre la langue des signes (alphabet, vocabulaire de base)', 'Apprendre les signes ouvre la communication avec les personnes sourdes.', 'Déroulé conseillé : alphabet, vocabulaire thématique, petits dialogues.', 'Utilise ton visage : l’expression fait partie de la langue.', 'tenir une conversation de base de 5 minutes en signes'],
    ],
  },
  {
    id: 'programmation', label: 'Programmation', blurb: 'Apprendre à créer avec du code.',
    primary: 'INT', secondary: [['DEX', 20]], physical: false, time: [30, 120, 10, 40],
    activities: [
      ['Python débutant', 'apprendre Python (variables, boucles, fonctions)', 'Python est un langage simple pour apprendre à programmer.', 'Déroulé conseillé : lire une leçon, faire les exercices, écrire un petit programme.', 'Tape le code toi-même plutôt que de le copier.', 'écrire un programme de 100 lignes qui résout un vrai problème'],
      ['HTML et CSS', 'apprendre HTML et CSS (structure, styles, mise en page)', 'HTML et CSS permettent de créer ses propres pages web.', 'Déroulé conseillé : lire une leçon, reproduire un exemple, modifier et créer.', 'Teste dans le navigateur après chaque modification.', 'publier une page web complète en ligne'],
      ['JavaScript', 'apprendre JavaScript (variables, fonctions, DOM)', 'JavaScript rend les pages web interactives.', 'Déroulé conseillé : leçon, exercices, mini-projet.', 'Utilise la console du navigateur pour tester.', 'créer une petite application interactive'],
      ['Algorithmique', 'travailler l’algorithmique (problèmes, structures de données)', 'Résoudre des problèmes entraîne à penser comme un programmeur.', 'Déroulé conseillé : lire l’énoncé, planifier sur papier, coder, tester.', 'Écris la solution en français avant de coder.', 'résoudre 30 exercices d’algorithmique'],
      ['Automatiser avec un script', 'écrire des scripts pour automatiser des tâches', 'Automatiser fait gagner du temps toute l’année.', 'Déroulé conseillé : choisir une tâche répétitive, planifier, écrire, tester.', 'Commence par une tâche simple : renommer des fichiers.', 'automatiser 3 tâches de ta vie quotidienne'],
    ],
  },
  {
    id: 'lecture-ecriture', label: 'Lecture et écriture', blurb: 'Nourrir son esprit et mettre ses idées en mots.',
    primary: 'INT', secondary: [['SAG', 40]], physical: false, time: [25, 120, 8, 30],
    activities: [
      ['Roman', 'lire un roman', 'Lire un roman entraîne la concentration et l’empathie.', 'Déroulé conseillé : s’installer au calme, lire sans interruption, noter une phrase marquante.', 'Pose ton téléphone dans une autre pièce.', 'terminer 2 romans entiers'],
      ['Essai ou documentaire', 'lire un essai ou un livre documentaire', 'Les essais donnent du recul sur un sujet.', 'Déroulé conseillé : lecture, notes en marge, résumé en 5 lignes.', 'Souligne puis reformule avec tes mots.', 'terminer 2 essais et rédiger un résumé de chacun'],
      ['Écriture créative', 'écrire de la fiction (scènes, personnages, dialogues)', 'Écrire de la fiction apprend à construire une histoire.', 'Déroulé conseillé : échauffement par une phrase, écriture libre, relecture.', 'Écris d’abord, corrige plus tard.', 'écrire une nouvelle de 3 000 mots'],
      ['Journal de bord', 'tenir un journal de bord (événements, émotions, projets)', 'Écrire régulièrement aide à comprendre ce qu’on vit.', 'Déroulé conseillé : date, événements, émotions, intentions pour demain.', 'Écris à la même heure chaque jour.', 'remplir un journal sans interruption pendant 30 jours'],
      ['Poésie', 'lire et écrire de la poésie', 'La poésie affine le regard et le goût des mots.', 'Déroulé conseillé : lire quelques poèmes, écrire un court texte, relire à voix haute.', 'Choisis un thème simple : une saison, un lieu, une émotion.', 'écrire et recopier un recueil de 10 poèmes'],
    ],
  },
  {
    id: 'meditation', label: 'Méditation et respiration', blurb: 'Apaiser l’esprit et apprendre à rester présent.',
    primary: 'SAG', secondary: [['CON', 20]], physical: false, time: [15, 70, 5, 20],
    activities: [
      ['Méditation de pleine conscience', 'méditer en pleine conscience (respiration, sensations, pensées)', 'La pleine conscience entraîne l’attention et calme le stress.', 'Déroulé conseillé : installation, respiration, retour à l’attention, clôture douce.', 'Reviens à la respiration chaque fois que tu t’évades.', 'méditer 20 minutes sans interruption'],
      ['Cohérence cardiaque', 'pratiquer la cohérence cardiaque (6 respirations par minute)', 'Ce rythme respiratoire apaise le cœur et l’anxiété.', 'Déroulé conseillé : s’installer, inspirer 5 secondes, expirer 5 secondes, pendant 5 minutes.', 'Respire par le nez et garde les épaules basses.', 'pratiquer 3 fois par jour pendant 2 semaines'],
      ['Scan corporel', 'faire un scan corporel guidé (relâcher chaque zone du corps)', 'Le scan corporel aide à repérer et relâcher les tensions.', 'Déroulé conseillé : allongé, parcourir le corps des pieds à la tête, relâcher.', 'Ne cherche pas à changer : observe d’abord.', 'faire un scan complet de 30 minutes sans t’endormir'],
      ['Méditation de bienveillance', 'pratiquer la méditation de bienveillance (envoyer des vœux aux autres et à soi)', 'Cette méditation développe la compassion et l’apaisement.', 'Déroulé conseillé : s’installer, se souhaiter du bien, puis à un proche, à un inconnu.', 'Choisis des phrases simples et sincères.', 'tenir une pratique quotidienne de bienveillance pendant 30 jours'],
      ['Respiration profonde', 'pratiquer la respiration profonde (abdominale, 4-7-8, alternée)', 'Respirer lentement active le système nerveux qui calme le corps.', 'Déroulé conseillé : s’installer, respiration abdominale, respiration 4-7-8, retour au calme.', 'Allonge l’expiration pour plus de calme.', 'réaliser une séance de respiration de 15 minutes sans effort'],
    ],
  },
  {
    id: 'bricolage', label: 'Bricolage et artisanat', blurb: 'Fabriquer, réparer et créer de ses mains.',
    primary: 'DEX', secondary: [['INT', 30], ['FOR', 10]], physical: false, time: [40, 150, 10, 30],
    activities: [
      ['Menuiserie simple', 'réaliser un petit projet de menuiserie (découpe, assemblage, finition)', 'Fabriquer un objet en bois apprend la précision.', 'Déroulé conseillé : plan, découpe, ponçage, assemblage, finition.', 'Mesure deux fois, coupe une fois.', 'fabriquer un meuble ou un objet utile terminé'],
      ['Couture', 'coudre à la main ou à la machine (ourlets, réparations, créations)', 'La couture permet de réparer et de créer ses vêtements.', 'Déroulé conseillé : choisir un projet, préparer le tissu, coudre, finitions.', 'Épingle ton tissu avant de piquer.', 'confectionner un vêtement ou un accessoire fini'],
      ['Réparation', 'réparer des objets de la maison (robinet, prise, meuble, vélo)', 'Savoir réparer fait économiser et évite le gaspillage.', 'Déroulé conseillé : diagnostic, tutoriel, outils, réparation, test.', 'Photographie avant de démonter pour savoir remonter.', 'réparer 5 objets de la maison'],
      ['Modélisme', 'construire une maquette ou un modèle réduit', 'Le modélisme demande minutie et patience.', 'Déroulé conseillé : lire le plan, préparer les pièces, assembler, peindre.', 'Teste l’assemblage à sec avant de coller.', 'terminer une maquette complexe'],
      ['Tricot ou crochet', 'tricoter ou crocheter (mailles, motifs, projets)', 'Le tricot calme et développe la dextérité des doigts.', 'Déroulé conseillé : choix du motif, échantillon, travail en rangs, finitions.', 'Compte tes mailles à chaque rang.', 'terminer un vêtement ou une couverture'],
    ],
  },
  {
    id: 'randonnee', label: 'Randonnée', blurb: 'Marcher longtemps, dehors, à son rythme.',
    primary: 'CON', secondary: [['SAG', 30], ['FOR', 20]], physical: true, time: [60, 180, 10, 30],
    activities: [
      ['Rando facile', 'faire une randonnée facile sur sentier', 'La randonnée facile entretient l’endurance et le moral.', 'Déroulé conseillé : préparer le sac, partir à rythme régulier, pauses courtes, retour.', 'Emporte de l’eau, une collation et une couche chaude.', 'enchaîner 5 randonnées de 2 heures'],
      ['Marche en dénivelé', 'marcher en montée et descente sur sentier varié', 'Le dénivelé renforce les jambes et le cœur.', 'Déroulé conseillé : échauffement, montée à rythme régulier, descente en contrôle, étirements.', 'Raccourcis le pas en montée et utilise des bâtons.', 'monter 500 m de dénivelé en une sortie'],
      ['Randonnée en forêt', 'marcher en forêt en observant la nature', 'La forêt apaise et fait diminuer le stress.', 'Déroulé conseillé : marche lente, pauses d’observation, silence.', 'Repère les bruits, les odeurs et la lumière.', 'faire 5 sorties en forêt de 1 heure'],
      ['Marche nordique', 'pratiquer la marche nordique avec bâtons', 'Les bâtons font travailler le haut du corps en plus des jambes.', 'Déroulé conseillé : échauffement, marche active avec bâtons, retour au calme.', 'Pousse sur les bâtons comme pour ski de fond.', 'faire 10 km de marche nordique'],
      ['Randonnée à la journée', 'faire une grande randonnée à la journée', 'Une longue marche apprend à gérer l’effort et la logistique.', 'Déroulé conseillé : préparer l’itinéraire, partir tôt, pauses régulières, retour avant la nuit.', 'Prévois un plan B si la météo change.', 'effectuer une randonnée de 20 km en une journée'],
    ],
  },
  {
    id: 'cyclisme', label: 'Cyclisme', blurb: 'Endurance et plaisir de rouler.',
    primary: 'CON', secondary: [['FOR', 30], ['SAG', 10]], physical: true, time: [40, 150, 10, 35],
    activities: [
      ['Vélo de route', 'rouler à vélo de route à allure régulière', 'Le vélo de route est l’un des meilleurs sports d’endurance.', 'Déroulé conseillé : échauffement à vélo, bloc d’allure régulière, retour au calme.', 'Garde un pédalage fluide et une cadence régulière.', 'rouler 60 km en une sortie'],
      ['VTT', 'faire du VTT sur sentier', 'Le VTT travaille l’équilibre et le cardio en pleine nature.', 'Déroulé conseillé : échauffement, sentiers, passages techniques, retour.', 'Regarde loin devant, pas à ta roue.', 'rouler 25 km de sentier avec du dénivelé'],
      ['Vélo d’appartement', 'faire une séance de vélo d’appartement (intervalles, endurance)', 'Le vélo d’appartement permet de s’entraîner par tous les temps.', 'Déroulé conseillé : échauffement, intervalles, retour au calme.', 'Varie la résistance plutôt que la vitesse.', 'tenir 45 minutes à effort régulier'],
      ['Vélo au quotidien', 'faire du vélo pour tes trajets quotidiens', 'Utiliser le vélo au quotidien est la façon la plus simple de rouler plus.', 'Déroulé conseillé : préparer le vélo, itinéraire sécurisé, trajet, entretien rapide.', 'Équipe-toi : casque, éclairage, antivol.', 'faire 20 trajets de plus de 15 minutes à vélo'],
      ['Sortie longue à vélo', 'faire une longue sortie à vélo', 'Les sorties longues construisent l’endurance.', 'Déroulé conseillé : itinéraire, ravitaillement, allure régulière, retour.', 'Mange et bois avant d’avoir faim ou soif.', 'rouler 100 km en une journée'],
    ],
  },
  {
    id: 'strategie', label: 'Jeux de stratégie', blurb: 'Réfléchir vite, anticiper et décider.',
    primary: 'INT', secondary: [['DEX', 40]], physical: false, time: [30, 120, 8, 30],
    activities: [
      ['Échecs', 'jouer aux échecs (parties, problèmes tactiques, ouvertures)', 'Les échecs entraînent l’anticipation et la patience.', 'Déroulé conseillé : problèmes tactiques, une partie, analyse.', 'Joue à ton rythme et analyse tes erreurs.', 'jouer 50 parties et gagner 20 fois'],
      ['Go', 'jouer au go (règles, formes, territoire)', 'Le go est un jeu profond à partir de règles très simples.', 'Déroulé conseillé : règles, problèmes de vie et de mort, partie sur petit plateau.', 'Commence sur un plateau 9×9.', 'finir 20 parties sur plateau 13×13'],
      ['Jeux de société stratégiques', 'jouer à des jeux de société de stratégie', 'Ces jeux entraînent la planification et les négociations.', 'Déroulé conseillé : choisir un jeu, apprendre les règles, jouer une partie, débriefer.', 'Joue avec des joueurs plus expérimentés.', 'jouer 10 parties de jeux différents'],
      ['Sudoku et logique', 'résoudre des grilles de sudoku et de logique', 'La logique entraîne la concentration et l’esprit de déduction.', 'Déroulé conseillé : grilles faciles, grilles moyennes, grilles difficiles.', 'Note les candidats possibles dans chaque case.', 'résoudre 10 grilles difficiles'],
      ['Jeux de réflexes', 'pratiquer des jeux de réflexes et de rapidité', 'La rapidité de réaction s’entraîne comme un muscle.', 'Déroulé conseillé : échauffement, séries de jeux de réflexes, repos.', 'Garde les yeux reposés et fais des pauses.', 'battre ton meilleur score de départ de 30 %'],
    ],
  },
  {
    id: 'sommeil', label: 'Sommeil et récupération', blurb: 'Dormir mieux et mieux récupérer.',
    primary: 'CON', secondary: [['SAG', 30]], physical: false, time: [15, 60, 4, 15],
    activities: [
      ['Rituel du soir', 'suivre un rituel du soir apaisant (lumière douce, étirements, lecture)', 'Un rituel stable prépare le corps à s’endormir.', 'Déroulé conseillé : écrans éteints, lumière douce, étirements, lecture calme, coucher.', 'Garde les mêmes horaires et le même ordre.', 'tenir ton rituel pendant 30 soirs de suite'],
      ['Sieste récupératrice', 'faire une sieste courte (10 à 20 minutes)', 'Une sieste courte restaure l’énergie sans gêner la nuit.', 'Déroulé conseillé : s’installer au calme, régler une alarme, se reposer, se lever doucement.', 'Ne dépasse pas 20 minutes pour ne pas gêner ton sommeil.', 'faire une sieste de 20 minutes chaque jour pendant 2 semaines'],
      ['Respiration pour dormir', 'pratiquer des respirations pour s’endormir (4-7-8, relaxation)', 'Respirer lentement aide à s’endormir plus vite.', 'Déroulé conseillé : allongé, respiration lente, relâchement progressif.', 'N’essaie pas de dormir : relâche simplement.', 't’endormir en moins de 15 minutes 10 nuits de suite'],
      ['Étirements du soir', 'faire des étirements doux du soir', 'Détendre le corps facilite l’endormissement.', 'Déroulé conseillé : nuque, épaules, dos, hanches, jambes, respiration.', 'Reste dans l’inconfort léger, jamais dans la douleur.', 'tenir une routine de 10 minutes chaque soir pendant 30 jours'],
      ['Chambre propice au sommeil', 'préparer ta chambre pour mieux dormir (obscurité, fraîcheur, silence)', 'Un bon environnement améliore la qualité du sommeil.', 'Déroulé conseillé : aérer, régler la température, supprimer les lumières, ranger.', 'Vise 18 °C et une obscurité complète.', 'dormir 7 heures ou plus pendant 20 nuits de suite'],
    ],
  },
  {
    id: 'nutrition', label: 'Nutrition et santé', blurb: 'Comprendre ce qu’on mange et mieux manger.',
    primary: 'CON', secondary: [['INT', 40]], physical: false, time: [30, 120, 8, 25],
    activities: [
      ['Lire les étiquettes', 'apprendre à lire les étiquettes alimentaires et comparer des produits', 'Comprendre les étiquettes aide à faire de meilleurs choix.', 'Déroulé conseillé : choisir 5 produits, comparer sucres, sel et additifs, noter.', 'Regarde la liste des ingrédients avant le tableau nutritionnel.', 'comparer 30 produits et en choisir des meilleurs'],
      ['Planifier ses repas', 'planifier les repas de la semaine (menu, courses, listes)', 'Planifier évite les achats impulsifs et les repas déséquilibrés.', 'Déroulé conseillé : faire le menu, vérifier le placard, établir la liste de courses.', 'Prévois des repas simples pour les soirs fatigués.', 'planifier tes repas pendant 4 semaines'],
      ['Assiette équilibrée', 'composer des assiettes équilibrées (légumes, protéines, féculents)', 'Une assiette bien composée donne de l’énergie durable.', 'Déroulé conseillé : choisir les aliments, composer l’assiette, manger lentement.', 'Remplis la moitié de l’assiette de légumes.', 'composer 50 assiettes équilibrées'],
      ['Hydratation', 'organiser son hydratation (eau, thé, tisanes) et réduire les boissons sucrées', 'Bien s’hydrater améliore l’énergie et la concentration.', 'Déroulé conseillé : fixer un objectif, préparer une bouteille, suivre sa consommation.', 'Bois un verre à chaque pause.', 'boire 1,5 L d’eau chaque jour pendant 30 jours'],
      ['Manger en pleine conscience', 'pratiquer la pleine conscience en mangeant (repas lent, sans écran)', 'Manger lentement aide à reconnaître la satiété.', 'Déroulé conseillé : s’installer à table, regarder, sentir, mâcher lentement.', 'Pose les couverts entre les bouchées.', 'tenir 25 repas en pleine conscience'],
    ],
  },
  {
    id: 'entraide', label: 'Entraide et bénévolat', blurb: 'Donner du temps et créer des liens.',
    primary: 'CHA', secondary: [['SAG', 30]], physical: false, time: [40, 150, 10, 30],
    activities: [
      ['Aide à un voisin', 'aider un voisin ou un proche (courses, bricolage, accompagnement)', 'L’entraide de proximité crée de la confiance.', 'Déroulé conseillé : proposer, convenir d’une tâche, aider, prendre des nouvelles.', 'Propose une aide précise plutôt qu’un « dis-moi si tu as besoin ».', 'aider 5 personnes différentes de ton entourage'],
      ['Bénévolat associatif', 'faire du bénévolat dans une association', 'Le bénévolat donne du sens et élargit le cercle.', 'Déroulé conseillé : accueil, mission, échange avec l’équipe, bilan.', 'Choisis une cause qui te parle.', 'tenir une mission régulière pendant 3 mois'],
      ['Cuisine solidaire', 'participer à un repas solidaire ou à une distribution alimentaire', 'Partager un repas rapproche les gens.', 'Déroulé conseillé : préparation, service, échanges, rangement.', 'Parle avec les personnes que tu accueilles.', 'participer à 8 repas solidaires'],
      ['Soutien scolaire', 'faire du soutien scolaire ou de l’aide aux devoirs', 'Transmettre un savoir renforce la confiance de chacun.', 'Déroulé conseillé : préparer la séance, expliquer, faire pratiquer, bilan.', 'Pose des questions plutôt que de donner la réponse.', 'accompagner un élève sur 10 séances'],
      ['Visite et écoute', 'rendre visite à une personne isolée ou âgée', 'Une visite régulière brise l’isolement.', 'Déroulé conseillé : prévenir, rendre visite, écouter, proposer un moment commun.', 'Écoute sans conseiller.', 'rendre visite à une personne chaque semaine pendant 2 mois'],
    ],
  },
  {
    id: 'mobilite', label: 'Mobilité et stretching', blurb: 'Gagner en souplesse et en liberté de mouvement.',
    primary: 'DEX', secondary: [['CON', 40]], physical: true, time: [15, 80, 5, 20],
    activities: [
      ['Étirements complets', 'faire une séance d’étirements complets, du cou aux pieds', 'Des étirements réguliers soulagent les tensions et améliorent l’amplitude.', 'Déroulé conseillé : échauffement léger, étirements de chaque zone, respiration.', 'Tiens chaque étirement 30 secondes sans rebondir.', 'toucher tes pieds jambes tendues'],
      ['Mobilité des hanches', 'travailler la mobilité des hanches (rotations, fentes profondes)', 'Des hanches mobiles soulagent le dos et les genoux.', 'Déroulé conseillé : échauffement, rotations, fentes profondes, étirements.', 'Reste dans une amplitude confortable.', 'tenir l’accroupi profond 2 minutes'],
      ['Mobilité des épaules', 'travailler la mobilité des épaules (cercles, étirements, élastiques)', 'Des épaules souples permettent de lever les bras sans tension.', 'Déroulé conseillé : cercles, étirements de pectoraux, travail avec élastique.', 'Garde les côtes rentrées pendant les élévations.', 'lever les bras au-dessus de la tête sans cambrer'],
      ['Mobilité du dos', 'travailler la mobilité du dos et de la colonne', 'Un dos mobile réduit les douleurs liées à la sédentarité.', 'Déroulé conseillé : chat-vache, rotations, étirements, relaxation.', 'Bouge lentement avec la respiration.', 'enchaîner une séance de 20 minutes sans gêne'],
      ['Grand écart', 'travailler la souplesse en vue du grand écart', 'Le grand écart est un objectif motivant pour progresser en souplesse.', 'Déroulé conseillé : échauffement, étirements des ischios et adducteurs, postures tenues.', 'Progresse un peu chaque jour plutôt que de forcer.', 'atteindre un grand écart facial ou latéral'],
    ],
  },
];
