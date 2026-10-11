import type { AbilityId } from './types';

/**
 * Migration des 8 anciennes classes vers les 7 classes D&D (docs/CLASSES.md §4).
 * Les mêmes tables sont appliquées en SQL par supabase/migrations/20261016000001_classes.sql
 * (un test de la base vérifie que les deux restent identiques).
 */

/** Ancienne classe → nouvelle classe. */
export const LEGACY_CLASS_MAP: Readonly<Record<string, string>> = {
  eclaireur: 'guerrier',
  rassembleur: 'paladin',
  aventurier: 'rodeur',
  explorateur: 'clerc',
  troubadour: 'barde',
  artisan: 'roublard',
  erudit: 'magicien',
  gardien: 'clerc',
};

/** Anciennes voies : caractéristique d'affinité (sert à vérifier la table de correspondance). */
export const LEGACY_PATH_ABILITY: Readonly<Record<string, AbilityId>> = {
  'eclaireur-sentier': 'SAG',
  'eclaireur-bastion': 'INT',
  'aventurier-ombre': 'SAG',
  'aventurier-tempete': 'CON',
  'artisan-inventeur': 'INT',
  'artisan-maitre': 'CHA',
  'troubadour-conteur': 'INT',
  'troubadour-meneur': 'CON',
  'rassembleur-feu': 'DEX',
  'rassembleur-roc': 'FOR',
  'erudit-savant': 'INT',
  'erudit-ermite': 'SAG',
  'gardien-guerisseur': 'CON',
  'gardien-protecteur': 'FOR',
  'explorateur-druide': 'INT',
  'explorateur-nomade': 'FOR',
};

/** Ancienne voie → voie équivalente de la nouvelle classe (même caractéristique si possible, sinon la première voie). */
export const LEGACY_PATH_MAP: Readonly<Record<string, string>> = {
  'eclaireur-sentier': 'guerrier-champion',
  'eclaireur-bastion': 'guerrier-champion',
  'aventurier-ombre': 'rodeur-chasseur',
  'aventurier-tempete': 'rodeur-belluaire',
  'artisan-inventeur': 'roublard-voleur',
  'artisan-maitre': 'roublard-voleur',
  'troubadour-conteur': 'barde-savoir',
  'troubadour-meneur': 'barde-vaillance',
  'rassembleur-feu': 'paladin-devotion',
  'rassembleur-roc': 'paladin-vengeance',
  'erudit-savant': 'magicien-evocation',
  'erudit-ermite': 'magicien-abjuration',
  'gardien-guerisseur': 'clerc-vie',
  'gardien-protecteur': 'clerc-vie',
  'explorateur-druide': 'clerc-savoir',
  'explorateur-nomade': 'clerc-vie',
};

/** Titres honorifiques qui citaient une ancienne classe. */
export const LEGACY_TITLE_MAP: Readonly<Record<string, string>> = {
  Rassembleur: 'Cœur de la compagnie',
};

export interface LegacyClassFields {
  classId: string;
  pathId?: string | null;
  titleEquipped?: string | null;
  classNotice?: boolean;
  classChanged?: boolean;
}

/** Vrai si l'identifiant est celui d'une ancienne classe. */
export const isLegacyClassId = (classId: string): boolean => Object.prototype.hasOwnProperty.call(LEGACY_CLASS_MAP, classId);

/**
 * Convertit un personnage d'ancienne classe (classe, voie, titre) ; l'indicateur « Ta classe a évolué » est levé.
 * Renvoie `null` si le personnage n'a rien à migrer. Idempotent : un personnage déjà migré est laissé tel quel.
 */
export function migrateLegacyClass<T extends LegacyClassFields>(c: T): T | null {
  const legacyClass = isLegacyClassId(c.classId);
  const legacyPath = !!c.pathId && Object.prototype.hasOwnProperty.call(LEGACY_PATH_MAP, c.pathId);
  const legacyTitle = !!c.titleEquipped && Object.prototype.hasOwnProperty.call(LEGACY_TITLE_MAP, c.titleEquipped);
  if (!legacyClass && !legacyPath && !legacyTitle) return null;
  return {
    ...c,
    classId: legacyClass ? LEGACY_CLASS_MAP[c.classId] : c.classId,
    pathId: legacyPath ? LEGACY_PATH_MAP[c.pathId as string] : c.pathId ?? null,
    titleEquipped: legacyTitle ? LEGACY_TITLE_MAP[c.titleEquipped as string] : c.titleEquipped ?? null,
    classNotice: legacyClass ? true : c.classNotice ?? false,
    classChanged: c.classChanged ?? false,
  };
}
