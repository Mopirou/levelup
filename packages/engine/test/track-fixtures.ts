import { buildRungTemplates, trackRungDifficulty, type AbilityId, type TrackDef, type XpShare } from '../src';

/** Parcours de test : 10 échelons, validations variées (simple / compteur / minuteur / étapes / journal). */
export function makeTrack(id: string, ability: AbilityId, secondary: XpShare[] = [], theme = 'sport'): TrackDef {
  return {
    id,
    theme,
    activity: id,
    label: `Parcours ${id}`,
    blurb: `Pourquoi ${id}`,
    ability,
    secondary,
    rungs: Array.from({ length: 10 }, (_, i) => {
      const rung = i + 1;
      const kind = rung % 5;
      return {
        rung,
        title: `${id} échelon ${rung}`,
        objective: `Objectif ${rung}`,
        tips: [`Astuce ${rung}`],
        validation:
          kind === 1
            ? { type: 'simple' as const }
            : kind === 2
              ? { type: 'counter' as const, target: rung * 5, unit: 'fois' }
              : kind === 3
                ? { type: 'timer' as const, minutes: rung * 5 }
                : kind === 4
                  ? { type: 'steps' as const, steps: ['a', 'b'] }
                  : { type: 'journal' as const },
        difficulty: trackRungDifficulty(rung),
      };
    }),
  };
}

export const TEST_TRACKS: TrackDef[] = [
  makeTrack('muscu-haut', 'FOR'),
  makeTrack('course-fond', 'CON', [{ ability: 'DEX', pct: 20 }]),
  makeTrack('lecture-fiction', 'INT', [], 'lecture'),
  makeTrack('yoga-doux', 'SAG'),
  makeTrack('cuisine-pain', 'CHA'),
];

export const TEST_RUNG_TEMPLATES = buildRungTemplates(TEST_TRACKS);
