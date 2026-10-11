import { addDays, diffDays, endOfIsoWeek, isoWeek, startOfIsoWeek } from './dates';
import { ChestRarity } from './types';

// ───────────────────────── Raids d'amis (V2) : logique pure ─────────────────────────
//
// Un boss mondial par semaine ISO ; des équipes de 2 à 6 amis lui infligent des dégâts chaque jour, sans rien faire.
// Aucune lecture de base ici. Voir docs/DONJONS.md §8.

/** Taille d'une équipe : 2 à 6 membres (une équipe à 1 membre est « en formation » et ne peut pas gagner) */
export const RAID_MIN_MEMBERS = 2;
export const RAID_MAX_MEMBERS = 6;
/** PV du boss pour une équipe d'un membre ; `+15 %` par membre supplémentaire */
export const RAID_BASE_HP = 10_000;
export const RAID_HP_PER_MEMBER = 0.15;
/** Bonus de CHA du groupe : `+1 %` par point de CHA moyen, plafonné à `+30 %` */
export const RAID_CHA_STEP = 0.01;
export const RAID_CHA_CAP = 0.3;
/** Encouragement : `+5 %` de dégâts le jour même par ami, plafonné à `+25 %` (soit 5 coéquipiers) */
export const RAID_ENCOURAGE_STEP = 0.05;
export const RAID_ENCOURAGE_CAP = 0.25;
/** `FOR / 60` : même échelle que les donjons */
export const RAID_FOR_DIV = 60;
/** Victoire en moins de 4 jours (3 jours de jeu au plus) : coffre mythique */
export const RAID_FAST_DAYS = 4;
export const RAID_WIN_CHEST: ChestRarity = 'or';
export const RAID_FAST_CHEST: ChestRarity = 'mythique';

export interface RaidBossDef {
  id: string;
  name: string;
  glyph: string;
  blurb: string;
}

/** Les boss tournent d'une semaine à l'autre, les mêmes pour tous les joueurs. */
export const RAID_BOSSES: readonly RaidBossDef[] = [
  { id: 'hydre-des-brumes', name: 'L’Hydre des brumes', glyph: '🐉', blurb: 'Chaque tête abattue en réveille deux autres. Frappez ensemble, frappez chaque jour.' },
  { id: 'colosse-de-cendre', name: 'Le Colosse de cendre', glyph: '🗿', blurb: 'Une montagne qui marche. Il ne tombera pas en un jour, mais il tombera.' },
  { id: 'reine-des-ronces', name: 'La Reine des ronces', glyph: '🥀', blurb: 'Ses épines s’enfoncent dans les plus distraits. Les assidus la font plier.' },
  { id: 'veilleur-du-gouffre', name: 'Le Veilleur du gouffre', glyph: '👁️', blurb: 'Il voit chaque jour manqué. Il n’a jamais vu une troupe unie lui résister.' },
  { id: 'wyrm-de-givre', name: 'Le Wyrm de givre', glyph: '🐲', blurb: 'Son souffle fige les volontés. Le feu de la routine le fait reculer.' },
  { id: 'seigneur-des-os', name: 'Le Seigneur des os', glyph: '💀', blurb: 'Il ramasse les promesses oubliées. Reprenez-les-lui une à une.' },
  { id: 'kraken-des-marees', name: 'Le Kraken des marées', glyph: '🦑', blurb: 'Il revient chaque semaine avec la marée, plus affamé. Tenez bon.' },
  { id: 'chimere-ardente', name: 'La Chimère ardente', glyph: '🔥', blurb: 'Trois natures, une seule faiblesse : la constance de vos coups.' },
];

/** Clé lisible de la semaine ISO d'un jour : `2026-W41`. */
export function raidWeekKey(date: string): string {
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Lundi de la semaine ISO d'un jour de jeu. */
export const raidWeekStart = (date: string): string => startOfIsoWeek(date);
/** Dimanche de la semaine ISO d'un jour de jeu. */
export const raidWeekEnd = (date: string): string => endOfIsoWeek(date);

/** Boss de la semaine ISO d'un jour de jeu (le même pour tous les joueurs). */
export function raidBossFor(date: string): RaidBossDef {
  const { year, week } = isoWeek(date);
  return RAID_BOSSES[(year * 53 + week) % RAID_BOSSES.length];
}

/** PV du boss : `10 000 × (1 + 0,15 × (membres − 1))`, membres bornés entre 1 et 6. */
export function raidMaxHp(members: number): number {
  const n = Math.min(Math.max(Math.trunc(members) || 1, 1), RAID_MAX_MEMBERS);
  return Math.round(RAID_BASE_HP * (1 + RAID_HP_PER_MEMBER * (n - 1)));
}

/** Bonus de CHA du groupe : `+1 %` par point de CHA moyen des membres, plafonné à `+30 %`. */
export function raidChaBonus(chaScores: readonly number[]): number {
  if (!chaScores.length) return 0;
  const avg = chaScores.reduce((n, c) => n + Math.max(0, c), 0) / chaScores.length;
  return Math.min(RAID_CHA_CAP, avg * RAID_CHA_STEP);
}

/** Bonus des encouragements reçus le jour même : `+5 %` chacun, plafonné à `+25 %`. */
export function raidEncouragementBonus(count: number): number {
  return Math.min(RAID_ENCOURAGE_CAP, Math.max(0, Math.trunc(count) || 0) * RAID_ENCOURAGE_STEP);
}

export interface RaidDamageInput {
  /** Puissance du héros (PP) */
  pp: number;
  /** FOR d'aventure (objets équipés compris) */
  forScore: number;
  /** Bonus de CHA du groupe (0..0,30) */
  chaBonus: number;
  /** Capacités : +% de dégâts de raid (famille « raid »), 0 par défaut */
  spellBonusPct?: number;
}

/** Dégâts avant encouragements : `PP × (1 + FOR/60) × (1 + bonus CHA) × (1 + capacités)`. */
export function raidBaseDamage(i: RaidDamageInput): number {
  return Math.floor(Math.max(0, i.pp) * (1 + Math.max(0, i.forScore) / RAID_FOR_DIV) * (1 + Math.min(RAID_CHA_CAP, Math.max(0, i.chaBonus))) * (1 + Math.max(0, i.spellBonusPct ?? 0) / 100));
}

/** Dégâts du jour : dégâts de base × `(1 + encouragements)`. */
export function raidDamage(base: number, encouragements: number): number {
  return Math.floor(Math.max(0, base) * (1 + raidEncouragementBonus(encouragements)));
}

/** Premier jour où les dégâts cumulés atteignent les PV, `null` si le boss tient encore. */
export function raidVictoryDay(daily: readonly { date: string; damage: number }[], maxHp: number): string | null {
  const byDay = new Map<string, number>();
  for (const d of daily) byDay.set(d.date, (byDay.get(d.date) ?? 0) + d.damage);
  let total = 0;
  for (const date of [...byDay.keys()].sort()) {
    total += byDay.get(date)!;
    if (total >= maxHp) return date;
  }
  return null;
}

/** Jours de jeu écoulés quand le boss est tombé (1 = le lundi). */
export function raidDaysToKill(weekStart: string, victoryDay: string): number {
  return diffDays(victoryDay, weekStart) + 1;
}

/** Coffre d'une victoire : or, mythique si le boss est tombé en moins de 4 jours. */
export function raidRewardChest(daysToKill: number): ChestRarity {
  return daysToKill < RAID_FAST_DAYS ? RAID_FAST_CHEST : RAID_WIN_CHEST;
}

export type RaidOutcome = 'victory' | 'defeat' | 'void';

/**
 * Issue d'un raid.
 * - `victory` : le boss est tombé (dégâts cumulés ≥ PV) avec au moins 2 membres ;
 * - `void` : la semaine est finie et l'équipe n'a jamais compté 2 membres (rien ne se passe) ;
 * - `defeat` : la semaine est finie et le boss tient encore ;
 * - `null` : le raid est toujours en cours.
 */
export function raidOutcome(input: { joined: number; totalDamage: number; maxHp: number; weekOver: boolean }): RaidOutcome | null {
  if (input.joined >= RAID_MIN_MEMBERS && input.totalDamage >= input.maxHp) return 'victory';
  if (!input.weekOver) return null;
  return input.joined < RAID_MIN_MEMBERS ? 'void' : 'defeat';
}

/** La semaine du raid est terminée à ce jour de jeu (le lendemain du dimanche). */
export function raidWeekOver(weekStart: string, today: string): boolean {
  return today > addDays(weekStart, 6);
}
