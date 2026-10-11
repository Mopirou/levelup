/**
 * Migration des anciens modèles d'objets (48, avant la V4) vers les modèles de classe (docs/CLASSES.md §4) : même emplacement, même
 * caractéristique. Les mêmes tables sont appliquées en SQL par supabase/migrations/20261017000001_spells.sql (un test vérifie qu'elles restent identiques).
 * Sert aux données locales (mode sans compte) : aucun objet n'est perdu, rareté, niveau et état équipé sont conservés.
 */
export const LEGACY_ITEM_MAP: Readonly<Record<string, string>> = {
  'epee-du-sentier': 'espadon',
  'dague-vive': 'arc-long',
  'baton-des-sages': 'baton-du-mage',
  'arc-de-l-aube': 'masse-d-armes',
  'sceptre-d-eloquence': 'sceptre-de-heraut',
  'masse-du-rempart': 'gourdin-de-voyageur',
  'hache-du-forgeron': 'marteau-de-guerre',
  'fleuret-leger': 'rapiere',
  'casque-de-fer': 'heaume',
  'chapeau-de-voyageur': 'chapeau-de-voyageur',
  'couronne-de-lauriers': 'heaume-de-brillance',
  'diademe-du-savant': 'capuche-de-voleur',
  'capuche-du-veilleur': 'capuchon-de-pisteur',
  'bandeau-du-guerrier': 'bandeau-de-combattant',
  'heaume-du-gardien': 'mitre',
  'lunettes-d-erudit': 'chapeau-de-sorcier',
  'cotte-de-mailles': 'robe-consacree',
  'tunique-du-voyageur': 'armure-de-cuir-cloute',
  'armure-de-plates': 'harnois',
  'robe-de-sagesse': 'manteau-de-pelerin',
  'manteau-d-orateur': 'pourpoint-de-velours',
  'veste-de-l-artisan': 'veste-d-erudit',
  'plastron-de-cuir': 'robe-d-archimage',
  'cape-du-conteur': 'pourpoint-de-velours',
  'gantelets-de-force': 'gants-de-travail',
  'gants-d-artisan': 'gants-de-nage-et-d-escalade',
  'bracelets-de-calme': 'mitaines-de-benediction',
  'mitaines-d-ecriture': 'outils-de-voleur',
  'poignets-du-rempart': 'anneau-de-protection',
  'gants-de-velours': 'gantelets-de-serment',
  'poings-d-acier': 'gantelets-de-puissance-d-ogre',
  'anneau-de-vivacite': 'gants-de-menestrel',
  'bottes-de-sept-lieues': 'bottes-de-danse',
  'sandales-du-pelerin': 'bottes-elfiques',
  'bottes-de-fer': 'bottes-de-marche-et-de-saut',
  'souliers-de-danse': 'bottes-d-apparat',
  'chaussons-de-lecture': 'pantoufles-d-erudit',
  'sabots-du-bucheron': 'sabatons-benis',
  'bottines-de-sentier': 'sandales-de-pelerin',
  'baskets-du-coureur': 'souliers-de-velours',
  'pendentif-du-sage': 'amulette-de-protection-contre-la-detection',
  'talisman-de-force': 'talisman-de-force',
  'medaillon-de-l-aube': 'medaillon-de-pensees',
  'collier-du-troubadour': 'reliquaire',
  'amulette-de-vigueur': 'amulette-de-sante',
  'breloque-agile': 'pierre-de-chance',
  'sautoir-d-erudit': 'grimoire',
  'sceau-du-gardien': 'symbole-sacre',
};

/** Remplace les anciens identifiants de modèle par les nouveaux (les autres objets sont rendus tels quels). */
export function migrateLegacyItems<T extends { templateId: string }>(items: readonly T[]): T[] {
  return items.map((i) => (LEGACY_ITEM_MAP[i.templateId] && LEGACY_ITEM_MAP[i.templateId] !== i.templateId ? { ...i, templateId: LEGACY_ITEM_MAP[i.templateId] } : i));
}
