import tracksJson from '@levelup/content/tracks.fr.json';
import { ABILITY_LABEL, TRACK_PROMOTE_HITS, effectiveRung, trackRungMinScore, type AbilityId, type TrackDef, type TrackState } from '@levelup/engine';
import { THEMES, type ThemeDef } from './themes';

/** Parcours de discipline (statiques, embarqués dans l'application). Voir docs/PARCOURS.md. */
export const TRACKS = tracksJson as unknown as TrackDef[];

const BY_ID = new Map(TRACKS.map((t) => [t.id, t]));

export const trackDef = (id: string): TrackDef | undefined => BY_ID.get(id);

export const tracksOfTheme = (themeId: string): TrackDef[] => TRACKS.filter((t) => t.theme === themeId);

/** Disciplines qui proposent au moins un parcours, dans l'ordre du catalogue. */
export const THEMES_WITH_TRACKS: ThemeDef[] = THEMES.filter((t) => TRACKS.some((x) => x.theme === t.id));

export { trackRungMinScore };

export interface TrackLock {
  locked: boolean;
  /** Échelon réellement proposé (plafonné par le score) */
  effectiveRung: number;
  /** Score requis pour débloquer l'échelon qui suit le dernier accessible */
  need: number;
  ability: AbilityId;
  /** « FOR 6 requis » */
  label: string;
  /** « Force 6 requis, tu es à 5 » */
  detail: string;
}

/** Verrou par score (règle du moteur) : la montée n'est pas bloquée, mais l'échelon proposé est plafonné. */
export function trackLock(def: TrackDef, state: Pick<TrackState, 'rung'>, scores: Record<AbilityId, number>): TrackLock {
  const score = scores[def.ability] ?? 0;
  const effective = effectiveRung(def, state, scores);
  const need = trackRungMinScore(effective + 1);
  return {
    locked: effective < Math.min(state.rung, def.rungs.length),
    effectiveRung: effective,
    need,
    ability: def.ability,
    label: `${def.ability} ${need} requis`,
    detail: `${ABILITY_LABEL[def.ability]} ${need} requis, tu es à ${score}`,
  };
}

export interface TrackProgress {
  rung: number;
  total: number;
  hits: number;
  needed: number;
  ratio: number;
  /** Dernier échelon du parcours */
  top: boolean;
}

export function trackProgress(def: TrackDef, state: TrackState): TrackProgress {
  const total = def.rungs.length;
  const hits = Math.min(Math.max(state.hits, 0), TRACK_PROMOTE_HITS);
  return { rung: state.rung, total, hits, needed: TRACK_PROMOTE_HITS, ratio: hits / TRACK_PROMOTE_HITS, top: state.rung >= total };
}

/**
 * Parcours à proposer à un joueur d'avant la refonte, déduits de ses anciens centres d'intérêt (`settings.interests`).
 * Clés : `theme:slug` (l'activité précise, qui est l'id de parcours `theme-slug`) ou `theme` seul (toute la discipline).
 * Les activités précises passent d'abord ; les disciplines entières complètent, un parcours par discipline à tour de rôle.
 */
export function suggestTracks(interests: readonly string[] | undefined, max = 3): TrackDef[] {
  const out: TrackDef[] = [];
  const add = (d: TrackDef | undefined): void => {
    if (d && out.length < max && !out.includes(d)) out.push(d);
  };
  const keys = interests ?? [];
  for (const k of keys) if (k.includes(':')) add(BY_ID.get(k.replace(':', '-')));
  const preciseThemes = new Set(keys.filter((k) => k.includes(':')).map((k) => k.split(':')[0]));
  const wholeThemes = keys.filter((k) => !k.includes(':') && !preciseThemes.has(k));
  for (let round = 0; out.length < max; round++) {
    let any = false;
    for (const t of wholeThemes) {
      const d = tracksOfTheme(t)[round];
      if (d) {
        any = true;
        add(d);
      }
    }
    if (!any) break;
  }
  return out;
}
