import { AbilityId, Difficulty, Period, ValidationType } from './types';

/**
 * Vocabulaire de l'interface (maquettes Figma). Les identifiants internes restent ceux de D&D (FOR, DEX…),
 * seul l'affichage change : Courage = Force, Vitalité = Constitution, etc.
 */
export const ABILITY_LABEL: Record<AbilityId, string> = {
  FOR: 'Courage',
  DEX: 'Créativité',
  CON: 'Vitalité',
  INT: 'Savoir',
  SAG: 'Équilibre',
  CHA: 'Liens',
};

export const ABILITY_DND_NAME: Record<AbilityId, string> = {
  FOR: 'Force',
  DEX: 'Dextérité',
  CON: 'Constitution',
  INT: 'Intelligence',
  SAG: 'Sagesse',
  CHA: 'Charisme',
};

export const ABILITY_SHORT: Record<AbilityId, string> = {
  FOR: 'FOR',
  DEX: 'DEX',
  CON: 'CON',
  INT: 'INT',
  SAG: 'SAG',
  CHA: 'CHA',
};

/** Une couleur par caractéristique (cahier des charges 10). */
export const ABILITY_COLOR: Record<AbilityId, string> = {
  FOR: '#c8553d',
  DEX: '#5f9e6e',
  CON: '#e0893d',
  INT: '#4a82b8',
  SAG: '#8a6bb8',
  CHA: '#d9ae3a',
};

export const ABILITY_TAGLINE: Record<AbilityId, string> = {
  FOR: 'Oser, soulever, tenir. La puissance du geste franc.',
  DEX: 'Créer, bricoler, jouer. La précision et la souplesse.',
  CON: 'Bouger, dormir, durer. L’endurance du quotidien.',
  INT: 'Lire, apprendre, comprendre. La mémoire et la curiosité.',
  SAG: 'Respirer, se poser, voir clair. L’attention à soi.',
  CHA: 'Parler, écouter, donner. La force du lien.',
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Facile',
  medium: 'Modérée',
  high: 'Audacieuse',
  expert: 'Légendaire',
};

export const DIFFICULTY_SWORDS: Record<Difficulty, number> = { easy: 1, medium: 2, high: 3, expert: 4 };

export const PERIOD_LABEL: Record<Period, string> = {
  daily: 'Quotidienne',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuelle',
  epic: 'Épique',
};

export const PERIOD_TAB_LABEL: Record<Period, string> = {
  daily: 'Jour',
  weekly: 'Semaine',
  monthly: 'Mois',
  epic: 'Épique',
};

export const PERIOD_SHORT: Record<Period, string> = { daily: 'J', weekly: 'S', monthly: 'M', epic: 'É' };

export const VALIDATION_LABEL: Record<ValidationType, string> = {
  simple: 'Simple',
  counter: 'Compteur',
  timer: 'Chronomètre',
  steps: 'Checklist',
  journal: 'Journal',
};

export const REACTION_LABEL = {
  bravo: 'Bravo, aventurier',
  inspirant: 'Inspirant',
  respect: 'Respect',
  rire: 'Rire',
} as const;
export type ReactionKind = keyof typeof REACTION_LABEL;
export const REACTION_KINDS = Object.keys(REACTION_LABEL) as ReactionKind[];
export const REACTION_EMOJI: Record<ReactionKind, string> = {
  bravo: '👏',
  inspirant: '✨',
  respect: '🫡',
  rire: '😄',
};
