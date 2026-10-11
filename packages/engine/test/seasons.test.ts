import { describe, expect, it } from 'vitest';
import {
  SEASON_ANCHOR,
  SEASON_DAYS,
  SEASON_FRAMES,
  SEASON_FRAME_DEFS,
  SEASON_MIN_SPAN_DAYS,
  frameStyleOf,
  parseFrameStyle,
  rankSeason,
  seasonBounds,
  seasonIndex,
  seasonIndexOfKey,
  seasonInfo,
  seasonQualifies,
  seasonReward,
  addDays,
  isoWeekday,
} from '../src';

describe('calendrier des saisons', () => {
  it('l’ancrage est un lundi et une saison dure 8 semaines', () => {
    expect(isoWeekday(SEASON_ANCHOR)).toBe(1);
    expect(SEASON_DAYS).toBe(56);
  });

  it('saison 1 : du lundi d’ancrage au dimanche de la 8e semaine', () => {
    const first = seasonInfo(SEASON_ANCHOR);
    expect(first).toMatchObject({ index: 1, key: 'S1', name: 'Saison 1', start: SEASON_ANCHOR, daysLeft: 56, week: 1 });
    expect(first.end).toBe(addDays(SEASON_ANCHOR, 55));
    expect(isoWeekday(first.end)).toBe(7);
    expect(first.progress).toBeCloseTo(1 / 56);
    const last = seasonInfo(first.end);
    expect(last).toMatchObject({ index: 1, daysLeft: 1, week: 8 });
    expect(last.progress).toBe(1);
  });

  it('le lendemain de la fin ouvre la saison suivante', () => {
    const next = seasonInfo(addDays(SEASON_ANCHOR, 56));
    expect(next).toMatchObject({ index: 2, key: 'S2', start: addDays(SEASON_ANCHOR, 56), daysLeft: 56, week: 1 });
    expect(seasonInfo(addDays(SEASON_ANCHOR, 56 * 3 + 20))).toMatchObject({ index: 4, week: 3 });
  });

  it('jours restants et semaine en cours au milieu de la saison', () => {
    const mid = seasonInfo(addDays(SEASON_ANCHOR, 17));
    expect(mid).toMatchObject({ index: 1, daysLeft: 56 - 17, week: 3 });
  });

  it('avant l’ancrage : saison 1', () => {
    expect(seasonIndex('2026-01-01')).toBe(1);
    expect(seasonInfo('2026-01-01')).toMatchObject({ index: 1, daysLeft: 56, week: 1 });
  });

  it('clés de saison et bornes', () => {
    expect(seasonIndexOfKey('S12')).toBe(12);
    expect(seasonIndexOfKey('S0')).toBeNull();
    expect(seasonIndexOfKey('saison1')).toBeNull();
    expect(seasonBounds('S2')).toEqual({ start: addDays(SEASON_ANCHOR, 56), end: addDays(SEASON_ANCHOR, 111) });
    expect(seasonBounds('nope')).toBeNull();
  });
});

describe('classement', () => {
  it('trie par puissance, rangs partagés à égalité, départage stable', () => {
    const r = rankSeason([
      { profileId: 'c', power: 100 },
      { profileId: 'a', power: 300 },
      { profileId: 'b', power: 100 },
      { profileId: 'd', power: 50 },
    ]);
    expect(r.map((x) => [x.profileId, x.rank])).toEqual([['a', 1], ['b', 2], ['c', 2], ['d', 4]]);
    expect(rankSeason([])).toEqual([]);
    expect(rankSeason([{ profileId: 'x', power: 9 }, { profileId: 'y', power: 9 }]).map((x) => x.rank)).toEqual([1, 1]);
  });

  it('une semaine de jeu suffit pour toucher la récompense', () => {
    expect(SEASON_MIN_SPAN_DAYS).toBe(6);
    expect(seasonQualifies('2026-10-05', '2026-10-05')).toBe(false);
    expect(seasonQualifies('2026-10-05', '2026-10-10')).toBe(false);
    expect(seasonQualifies('2026-10-05', '2026-10-11')).toBe(true);
  });
});

describe('récompense de fin de saison', () => {
  it('podium d’un classement d’au moins deux joueurs', () => {
    expect(seasonReward(1, 4)).toEqual({ frame: 'or', chest: 'or' });
    expect(seasonReward(2, 4)).toEqual({ frame: 'argent', chest: 'or' });
    expect(seasonReward(3, 4)).toEqual({ frame: 'bronze', chest: 'or' });
    expect(seasonReward(3, 3).frame).toBe('bronze');
  });

  it('les autres, les joueurs seuls et les non classés ont le cadre de laurier, tous ont le coffre d’or', () => {
    expect(seasonReward(4, 9)).toEqual({ frame: 'laurier', chest: 'or' });
    expect(seasonReward(1, 1)).toEqual({ frame: 'laurier', chest: 'or' });
    expect(seasonReward(null, 0)).toEqual({ frame: 'laurier', chest: 'or' });
    expect(seasonReward(0, 5).frame).toBe('laurier');
  });

  it('les cadres ont un libellé, un glyphe et une couleur', () => {
    for (const f of SEASON_FRAMES) {
      expect(SEASON_FRAME_DEFS[f].label).toMatch(/^Cadre/);
      expect(SEASON_FRAME_DEFS[f].glyph).not.toBe('');
      expect(SEASON_FRAME_DEFS[f].color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('format du cadre stocké', () => {
    expect(frameStyleOf('S2', 'argent')).toBe('S2:argent');
    expect(parseFrameStyle('S2:argent')).toEqual({ season: 'S2', frame: 'argent' });
    expect(parseFrameStyle('S2:platine')).toBeNull();
    expect(parseFrameStyle('or')).toBeNull();
    expect(parseFrameStyle(null)).toBeNull();
    expect(parseFrameStyle(undefined)).toBeNull();
  });
});
