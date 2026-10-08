import { describe, expect, it } from 'vitest';
import {
  addDays,
  canDeclareRest,
  computeBestStreak,
  computeStreak,
  daysLeft,
  diffDays,
  gameDate,
  inspirationAfterStreak,
  isoWeek,
  lastAcceptDate,
  listDays,
  msUntilReset,
  periodBounds,
} from '../src';

describe('périodes', () => {
  it('semaine ISO du lundi au dimanche', () => {
    expect(periodBounds('weekly', '2026-10-08')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(periodBounds('weekly', '2026-10-05')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
    expect(periodBounds('weekly', '2026-10-11')).toEqual({ start: '2026-10-05', end: '2026-10-11' });
  });
  it('mois et trimestre', () => {
    expect(periodBounds('monthly', '2026-02-14')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodBounds('monthly', '2028-02-14').end).toBe('2028-02-29');
    expect(periodBounds('epic', '2026-10-08')).toEqual({ start: '2026-10-01', end: '2026-12-31' });
    expect(periodBounds('epic', '2026-05-08')).toEqual({ start: '2026-04-01', end: '2026-06-30' });
  });
  it('jour', () => {
    expect(periodBounds('daily', '2026-10-08')).toEqual({ start: '2026-10-08', end: '2026-10-08' });
  });
  it('arithmétique de dates et semaine ISO', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(diffDays('2026-10-08', '2026-10-01')).toBe(7);
    expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 });
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 });
    expect(listDays('2026-10-01', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(daysLeft('2026-10-11', '2026-10-08')).toBe(4);
  });
  it('acceptation tardive (RG-08)', () => {
    expect(lastAcceptDate('weekly', '2026-10-05', '2026-10-11')).toBe('2026-10-09');
    expect(lastAcceptDate('monthly', '2026-10-01', '2026-10-31')).toBe('2026-10-24');
  });
});

describe('date de jeu et reset', () => {
  const tz = 'Europe/Paris';
  it('une action à 1 h du matin compte pour la veille', () => {
    // 2026-10-08 01:00 Paris = 2026-10-07 23:00 UTC
    expect(gameDate(Date.UTC(2026, 9, 7, 23, 0), tz, 4)).toBe('2026-10-07');
    expect(gameDate(Date.UTC(2026, 9, 8, 3, 0), tz, 4)).toBe('2026-10-08');
  });
  it('indépendant du passage à l’heure d’hiver (RG-04)', () => {
    // 25 octobre 2026 : retour à l’heure d’hiver ; 12 h locales -> toujours le 25
    expect(gameDate(Date.UTC(2026, 9, 25, 11, 0), tz, 4)).toBe('2026-10-25');
    expect(gameDate(Date.UTC(2026, 9, 26, 11, 0), tz, 4)).toBe('2026-10-26');
  });
  it('compte à rebours jusqu’au reset', () => {
    // 20 h 18 locale (UTC+2) -> 4 h : 7 h 42
    const now = Date.UTC(2026, 9, 8, 18, 18);
    expect(msUntilReset(now, tz, 4)).toBe((7 * 60 + 42) * 60000);
  });
});

describe('série, repos, inspiration', () => {
  it('série continue même si aujourd’hui n’est pas fini', () => {
    const r = computeStreak(['2026-10-05', '2026-10-06', '2026-10-07'], [], '2026-10-08');
    expect(r).toEqual({ current: 3, doneToday: false });
  });
  it('compte aujourd’hui quand validé', () => {
    expect(computeStreak(['2026-10-07', '2026-10-08'], [], '2026-10-08').current).toBe(2);
  });
  it('un jour manquant casse la série', () => {
    expect(computeStreak(['2026-10-05', '2026-10-07'], [], '2026-10-08').current).toBe(1);
  });
  it('un jour de repos ne casse pas la série (RG-02)', () => {
    expect(computeStreak(['2026-10-05', '2026-10-07'], ['2026-10-06'], '2026-10-08').current).toBe(2);
  });
  it('meilleure série avec repos', () => {
    expect(computeBestStreak(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-09'], ['2026-10-03'])).toBe(3);
    expect(computeBestStreak([], [])).toBe(0);
  });
  it('un seul repos par semaine ISO', () => {
    expect(canDeclareRest(['2026-10-06'], '2026-10-08')).toBe(false);
    expect(canDeclareRest(['2026-10-06'], '2026-10-13')).toBe(true);
    expect(canDeclareRest([], '2026-10-08')).toBe(true);
  });
  it('inspiration tous les 7 jours, max 3 (RG-11)', () => {
    expect(inspirationAfterStreak(6, 7, 0)).toEqual({ inspiration: 1, gained: true, overflow: false });
    expect(inspirationAfterStreak(6, 7, 3)).toEqual({ inspiration: 3, gained: false, overflow: true });
    expect(inspirationAfterStreak(7, 7, 1).gained).toBe(false);
    expect(inspirationAfterStreak(7, 8, 1).gained).toBe(false);
  });
});
