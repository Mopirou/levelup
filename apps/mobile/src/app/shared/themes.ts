import themesJson from '@levelup/content/themes.fr.json';
import { ABILITY_LABEL, xpShares, type AbilityId, type Difficulty } from '@levelup/engine';

/** Disciplines des quêtes guidées (danse, cuisine…). */
export interface ThemeDef {
  id: string;
  label: string;
  blurb: string;
  ability: AbilityId;
  secondary: { ability: AbilityId; pct: number }[];
  activities: string[];
}

export const THEMES = themesJson as unknown as ThemeDef[];

export const themeLabel = (id?: string | null): string => THEMES.find((t) => t.id === id)?.label ?? '';

/** « Dextérité 60 % · Charisme 30 % · Force 10 % » */
export const sharesText = (primary: AbilityId, secondary?: readonly { ability: AbilityId; pct: number }[]): string =>
  xpShares(primary, secondary).map((s) => `${ABILITY_LABEL[s.ability]} ${s.pct} %`).join(' · ');

/** Les quêtes guidées suivent quatre paliers, un par période. */
export const TIER_LABEL: Record<Difficulty, string> = {
  easy: 'Niveau 1 · Journée',
  medium: 'Niveau 2 · Semaine',
  high: 'Niveau 3 · Mois',
  expert: 'Niveau 4 · Épique',
};
