import { addDays } from './dates';
import {
  AbilityId,
  Difficulty,
  QuestTemplate,
  TRACK_DEMOTE_MISSES,
  TRACK_PROMOTE_HITS,
  TrackDef,
  TrackState,
} from './types';

// ───────────────────────── Parcours de discipline : logique pure ─────────────────────────
//
// Aucune lecture de base ici : tout est calculé à partir d'un état de parcours (TrackState), de dates de jeu
// (YYYY-MM-DD) et des scores du joueur. Voir docs/PARCOURS.md pour les règles.

/** Nombre d'échelons d'un parcours */
export const TRACK_RUNGS = 10;

/** Forme minimale d'un parcours pour les calculs d'échelon : satisfaite par un `TrackDef` comme par un parcours déduit des gabarits. */
export interface TrackShape {
  ability: AbilityId;
  rungs: readonly { rung: number }[];
}

/** Score minimum (dans la caractéristique principale) pour accéder à un échelon : 1-4 → 0, 5-6 → 4, 7-8 → 6, 9-10 → 9. */
export function trackRungMinScore(rung: number): number {
  if (rung <= 4) return 0;
  if (rung <= 6) return 4;
  if (rung <= 8) return 6;
  return 9;
}

/** Difficulté (donc XP de base) d'un échelon : 1-3 facile, 4-6 modérée, 7-9 élevée, 10 expert. */
export function trackRungDifficulty(rung: number): Difficulty {
  if (rung <= 3) return 'easy';
  if (rung <= 6) return 'medium';
  if (rung <= 9) return 'high';
  return 'expert';
}

/** Identifiant du gabarit de l'échelon : `{trackId}-r{NN}` (NN sur 2 chiffres). */
export function rungTemplateId(trackId: string, rung: number): string {
  return `${trackId}-r${String(rung).padStart(2, '0')}`;
}

/**
 * Échelon réellement proposé : l'échelon courant, plafonné au plus haut échelon dont le score minimum est atteint
 * (et au nombre d'échelons du parcours). La montée n'est pas bloquée côté `hits`, seule la quête du jour est plafonnée.
 */
export function effectiveRung(def: TrackShape, state: Pick<TrackState, 'rung'>, scores: Record<AbilityId, number>): number {
  const score = scores[def.ability] ?? 0;
  for (let r = Math.max(Math.min(state.rung, def.rungs.length), 1); r > 1; r--) {
    if (score >= trackRungMinScore(r)) return r;
  }
  return 1;
}

/** Parcours déduits des gabarits d'échelon (`trackId` + `rung` renseignés) : caractéristique et nombre d'échelons. */
export function trackShapes(templates: readonly QuestTemplate[]): Map<string, TrackShape> {
  const byTrack = new Map<string, QuestTemplate[]>();
  for (const t of templates) {
    if (!t.trackId || t.rung == null || t.isActive === false) continue;
    const list = byTrack.get(t.trackId);
    if (list) list.push(t);
    else byTrack.set(t.trackId, [t]);
  }
  const out = new Map<string, TrackShape>();
  for (const [id, list] of byTrack) {
    list.sort((a, b) => a.rung! - b.rung!);
    out.set(id, { ability: list[0].ability, rungs: list.map((t) => ({ rung: t.rung! })) });
  }
  return out;
}

/**
 * Gabarits `quest_templates` d'un jeu de parcours (un par échelon). Sert au mode local et aux tests ;
 * le seed de la base (`scripts/gen-seed.mjs`) produit les mêmes gabarits.
 */
export function buildRungTemplates(defs: readonly TrackDef[]): QuestTemplate[] {
  const out: QuestTemplate[] = [];
  for (const d of defs) {
    for (const r of d.rungs) {
      out.push({
        id: rungTemplateId(d.id, r.rung),
        source: 'catalog',
        ability: d.ability,
        difficulty: r.difficulty,
        periods: ['daily'],
        title: r.title,
        flavor: d.blurb,
        objective: r.objective,
        tips: r.tips,
        validation: r.validation,
        tags: [],
        theme: d.theme,
        ...(d.secondary.length ? { secondary: d.secondary } : {}),
        isActive: true,
        trackId: d.id,
        rung: r.rung,
      });
    }
  }
  return out;
}

export interface MissResult {
  state: TrackState;
  /** Jours manqués constatés pendant le passage (croissant) */
  missed: string[];
  /** L'échelon a baissé */
  demoted: boolean;
}

/**
 * Jours manqués d'un parcours : jours de jeu écoulés (après `lastCheckedDate`, avant `today`) sans quête du parcours validée
 * et absents des jours de repos. Un parcours en pause ou jamais pointé ne compte rien.
 * `doneDays` : jours où une quête de ce parcours a été validée (`lastDoneDate` est toujours pris en compte).
 */
export function missedDays(state: TrackState, today: string, restDays: Iterable<string>, doneDays: Iterable<string> = []): string[] {
  return applyMisses(state, today, restDays, doneDays).missed;
}

/**
 * Applique les jours manqués : 4 jours manqués d'affilée font descendre d'un échelon (minimum 1) et remettent `hits` à 0.
 * - un jour de repos n'est pas un jour manqué et n'interrompt pas la série de jours manqués ;
 * - un jour validé la remet à zéro ;
 * - au plus une descente par passage : les séries suivantes de la même fenêtre sont absorbées (on ne sanctionne pas
 *   trois fois un joueur qui revient après un mois) ;
 * - `lastCheckedDate` avance jusqu'à hier, sauf si une série de jours manqués est en cours (moins de 4) : elle est alors
 *   recomptée au passage suivant, ce qui rend le résultat indépendant de la fréquence des appels.
 */
export function applyMisses(state: TrackState, today: string, restDays: Iterable<string>, doneDays: Iterable<string> = []): MissResult {
  const yesterday = addDays(today, -1);
  if (state.status !== 'active' || !state.lastCheckedDate || state.lastCheckedDate >= yesterday) {
    return { state, missed: [], demoted: false };
  }
  const rest = new Set(restDays);
  const done = new Set(doneDays);
  if (state.lastDoneDate) done.add(state.lastDoneDate);

  let rung = state.rung;
  let hits = state.hits;
  let penalized = false;
  let run = 0;
  let runStart = '';
  const missed: string[] = [];
  for (let day = addDays(state.lastCheckedDate, 1); day <= yesterday; day = addDays(day, 1)) {
    if (done.has(day)) {
      run = 0;
      continue;
    }
    if (rest.has(day)) continue;
    missed.push(day);
    if (run === 0) runStart = day;
    run++;
    if (run >= TRACK_DEMOTE_MISSES) {
      if (!penalized) {
        penalized = true;
        rung = Math.max(rung - 1, 1);
        hits = 0;
      }
      run = 0;
    }
  }
  const lastCheckedDate = run > 0 ? addDays(runStart, -1) : yesterday;
  return { state: { ...state, rung, hits, lastCheckedDate }, missed, demoted: rung < state.rung };
}

/**
 * Validation d'une quête du parcours le jour `day` : +1 jour validé ; à `TRACK_PROMOTE_HITS` on monte d'un échelon
 * (`hits` repart à 0, `bestRung` suit). Au dernier échelon, `hits` plafonne. Un parcours en pause ne bouge pas,
 * et une seconde validation le même jour ne compte pas.
 */
export function advanceOnCompletion(state: TrackState, day: string, maxRung: number = TRACK_RUNGS): TrackState {
  if (state.status !== 'active' || state.lastDoneDate === day) return state;
  let { rung, hits } = state;
  hits += 1;
  if (hits >= TRACK_PROMOTE_HITS) {
    if (rung < maxRung) {
      rung += 1;
      hits = 0;
    } else {
      hits = TRACK_PROMOTE_HITS;
    }
  }
  const lastDoneDate = !state.lastDoneDate || day > state.lastDoneDate ? day : state.lastDoneDate;
  return { ...state, rung, hits, bestRung: Math.max(state.bestRung, rung), lastDoneDate };
}

/**
 * Inverse de `advanceOnCompletion` pour l'annulation d'une validation faite le jour `day`.
 * `previousDoneDate` : dernier jour validé restant une fois cette quête annulée (null s'il n'y en a pas).
 * Si la validation avait fait monter (hits à 0), on redescend à l'échelon précédent avec `TRACK_PROMOTE_HITS - 1` ;
 * `bestRung` n'est abaissé que s'il valait exactement l'échelon atteint.
 */
export function revertCompletion(state: TrackState, day: string, previousDoneDate: string | null = null): TrackState {
  let { rung, hits, bestRung } = state;
  if (hits > 0) {
    hits -= 1;
  } else if (rung > 1) {
    if (bestRung === rung) bestRung = rung - 1;
    rung -= 1;
    hits = TRACK_PROMOTE_HITS - 1;
  }
  return { ...state, rung, hits, bestRung, lastDoneDate: state.lastDoneDate === day ? previousDoneDate : state.lastDoneDate };
}
