import { addDays, diffDays } from './dates';
import { ChestRarity } from './types';

// ───────────────────────── Saisons : logique pure ─────────────────────────
//
// Une saison dure 8 semaines (56 jours), calculée depuis une date d'ancrage (un lundi) : aucune table de saisons, aucun
// cron. Le classement compare la puissance (PP) entre amis qui l'acceptent (opt-in du classement hebdomadaire). La
// récompense de fin de saison (cadre de portrait + coffre d'or) est distribuée par évaluation paresseuse.
// Voir docs/DONJONS.md §9.

/** Lundi de départ de la saison 1 */
export const SEASON_ANCHOR = '2026-09-28';
export const SEASON_WEEKS = 8;
export const SEASON_DAYS = SEASON_WEEKS * 7;
/** Jours de jeu minimum entre la première et la dernière synchronisation pour toucher la récompense (une semaine) */
export const SEASON_MIN_SPAN_DAYS = 6;
/** Coffre donné à tous les participants */
export const SEASON_CHEST: ChestRarity = 'or';

export type SeasonFrame = 'or' | 'argent' | 'bronze' | 'laurier';
export const SEASON_FRAMES: readonly SeasonFrame[] = ['or', 'argent', 'bronze', 'laurier'] as const;

/** Libellé, glyphe et couleur de chaque cadre de portrait de fin de saison. */
export const SEASON_FRAME_DEFS: Record<SeasonFrame, { label: string; glyph: string; color: string }> = {
  or: { label: 'Cadre d’or', glyph: '🥇', color: '#d4af37' },
  argent: { label: 'Cadre d’argent', glyph: '🥈', color: '#aab4bd' },
  bronze: { label: 'Cadre de bronze', glyph: '🥉', color: '#b0703a' },
  laurier: { label: 'Cadre de laurier', glyph: '🌿', color: '#4fa072' },
};

export interface SeasonInfo {
  /** Numéro de la saison (1 = première) */
  index: number;
  /** Clé stable : `S1`, `S2`… */
  key: string;
  name: string;
  /** Premier et dernier jour de jeu (le dernier est un dimanche) */
  start: string;
  end: string;
  /** Jours de jeu restants, aujourd'hui compris (1 le dernier jour) */
  daysLeft: number;
  /** Semaine en cours dans la saison (1..8) */
  week: number;
  /** Fraction écoulée de la saison, aujourd'hui compris (0..1) */
  progress: number;
}

export const seasonKeyOf = (index: number): string => `S${index}`;

/** Numéro de la saison d'un jour de jeu (1 pour toute date avant ou pendant la première saison). */
export function seasonIndex(date: string): number {
  return Math.max(1, Math.floor(diffDays(date, SEASON_ANCHOR) / SEASON_DAYS) + 1);
}

/** Numéro d'une clé de saison (`S3` -> 3), `null` si la clé est invalide. */
export function seasonIndexOfKey(key: string): number | null {
  const m = /^S(\d+)$/.exec(key);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 ? n : null;
}

/** Informations sur la saison en cours un jour de jeu donné. */
export function seasonInfo(date: string): SeasonInfo {
  const index = seasonIndex(date);
  const start = addDays(SEASON_ANCHOR, (index - 1) * SEASON_DAYS);
  const end = addDays(start, SEASON_DAYS - 1);
  const elapsed = Math.min(Math.max(diffDays(date, start), 0), SEASON_DAYS - 1);
  return {
    index,
    key: seasonKeyOf(index),
    name: `Saison ${index}`,
    start,
    end,
    daysLeft: SEASON_DAYS - elapsed,
    week: Math.floor(elapsed / 7) + 1,
    progress: (elapsed + 1) / SEASON_DAYS,
  };
}

/** Dates de début et de fin d'une saison par sa clé, `null` si la clé est invalide. */
export function seasonBounds(key: string): { start: string; end: string } | null {
  const index = seasonIndexOfKey(key);
  if (!index) return null;
  const start = addDays(SEASON_ANCHOR, (index - 1) * SEASON_DAYS);
  return { start, end: addDays(start, SEASON_DAYS - 1) };
}

export interface SeasonScoreLike {
  profileId: string;
  power: number;
}

export interface SeasonRankRow extends SeasonScoreLike {
  /** Rang à égalité : deux joueurs de même puissance partagent le rang (1, 1, 3…) */
  rank: number;
}

/** Classe les joueurs par puissance décroissante (départage stable par identifiant), rangs partagés en cas d'égalité. */
export function rankSeason(rows: readonly SeasonScoreLike[]): SeasonRankRow[] {
  const sorted = [...rows].sort((a, b) => b.power - a.power || a.profileId.localeCompare(b.profileId));
  const out: SeasonRankRow[] = [];
  for (const [i, r] of sorted.entries()) out.push({ ...r, rank: i > 0 && out[i - 1].power === r.power ? out[i - 1].rank : i + 1 });
  return out;
}

/** Un joueur a-t-il assez joué dans la saison (une semaine entre sa première et sa dernière synchronisation) ? */
export function seasonQualifies(firstDay: string, lastDay: string): boolean {
  return diffDays(lastDay, firstDay) >= SEASON_MIN_SPAN_DAYS;
}

export interface SeasonReward {
  frame: SeasonFrame;
  chest: ChestRarity;
}

/**
 * Récompense d'un joueur qui a assez joué : coffre d'or pour tous, cadre d'or / d'argent / de bronze pour le podium d'un
 * classement d'au moins deux joueurs, cadre de laurier pour les autres (et pour qui n'est pas classé).
 */
export function seasonReward(rank: number | null, participants: number): SeasonReward {
  const podium: SeasonFrame[] = ['or', 'argent', 'bronze'];
  const frame: SeasonFrame = rank !== null && participants >= 2 && rank >= 1 && rank <= 3 ? podium[rank - 1] : 'laurier';
  return { frame, chest: SEASON_CHEST };
}

/** Cadre de portrait stocké (`S1:or`), `null` si la valeur est vide ou invalide. */
export function parseFrameStyle(value: string | null | undefined): { season: string; frame: SeasonFrame } | null {
  const m = /^(S\d+):(\w+)$/.exec(value ?? '');
  return m && (SEASON_FRAMES as readonly string[]).includes(m[2]) ? { season: m[1], frame: m[2] as SeasonFrame } : null;
}

export const frameStyleOf = (season: string, frame: SeasonFrame): string => `${season}:${frame}`;
