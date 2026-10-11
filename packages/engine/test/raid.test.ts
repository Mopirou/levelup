import { describe, expect, it } from 'vitest';
import {
  RAID_BASE_HP,
  RAID_BOSSES,
  RAID_CHA_CAP,
  RAID_ENCOURAGE_CAP,
  RAID_MAX_MEMBERS,
  raidBaseDamage,
  raidBossFor,
  raidChaBonus,
  raidDamage,
  raidDaysToKill,
  raidEncouragementBonus,
  raidMaxHp,
  raidOutcome,
  raidRewardChest,
  raidVictoryDay,
  raidWeekEnd,
  raidWeekKey,
  raidWeekOver,
  raidWeekStart,
} from '../src';

describe('raids : règles pures', () => {
  it('semaine ISO : clé, lundi, dimanche', () => {
    expect(raidWeekKey('2026-10-14')).toBe('2026-W42');
    expect(raidWeekKey('2026-01-01')).toBe('2026-W01');
    expect(raidWeekStart('2026-10-14')).toBe('2026-10-12');
    expect(raidWeekEnd('2026-10-14')).toBe('2026-10-18');
    // Début d'année : le 1er janvier 2027 appartient à la semaine 53 de 2026
    expect(raidWeekKey('2027-01-01')).toBe('2026-W53');
  });

  it('le boss est le même toute la semaine, change la semaine suivante et tourne sur la liste', () => {
    expect(raidBossFor('2026-10-12')).toBe(raidBossFor('2026-10-18'));
    expect(raidBossFor('2026-10-19')).not.toBe(raidBossFor('2026-10-12'));
    const seen = new Set<string>();
    for (let w = 0; w < RAID_BOSSES.length; w++) seen.add(raidBossFor(`2026-${String(1 + Math.floor(w / 4)).padStart(2, '0')}-${String(5 + (w % 4) * 7).padStart(2, '0')}`).id);
    expect(seen.size).toBeGreaterThan(3);
    for (const b of RAID_BOSSES) expect(b.name.length).toBeGreaterThan(3);
  });

  it('PV : base × (1 + 0,15 × (membres − 1)), membres bornés entre 1 et 6', () => {
    expect(raidMaxHp(1)).toBe(RAID_BASE_HP);
    expect(raidMaxHp(2)).toBe(Math.round(RAID_BASE_HP * 1.15));
    expect(raidMaxHp(6)).toBe(Math.round(RAID_BASE_HP * 1.75));
    expect(raidMaxHp(9)).toBe(raidMaxHp(RAID_MAX_MEMBERS));
    expect(raidMaxHp(0)).toBe(RAID_BASE_HP);
    expect(raidMaxHp(Number.NaN)).toBe(RAID_BASE_HP);
  });

  it('bonus de CHA : 1 % par point moyen, plafonné à 30 %', () => {
    expect(raidChaBonus([])).toBe(0);
    expect(raidChaBonus([10, 20])).toBeCloseTo(0.15);
    expect(raidChaBonus([100, 100])).toBe(RAID_CHA_CAP);
    expect(raidChaBonus([-5, 5])).toBeCloseTo(0.025);
  });

  it('encouragements : 5 % chacun, plafonnés à 25 %', () => {
    expect(raidEncouragementBonus(0)).toBe(0);
    expect(raidEncouragementBonus(3)).toBeCloseTo(0.15);
    expect(raidEncouragementBonus(5)).toBe(RAID_ENCOURAGE_CAP);
    expect(raidEncouragementBonus(9)).toBe(RAID_ENCOURAGE_CAP);
    expect(raidEncouragementBonus(-2)).toBe(0);
    expect(raidEncouragementBonus(Number.NaN)).toBe(0);
  });

  it('dégâts : PP × (1 + FOR/60) × (1 + CHA) × (1 + encouragements)', () => {
    expect(raidBaseDamage({ pp: 600, forScore: 30, chaBonus: 0.2 })).toBe(Math.floor(600 * 1.5 * 1.2));
    expect(raidBaseDamage({ pp: 100, forScore: 0, chaBonus: 0 })).toBe(100);
    // Le bonus de CHA est plafonné même si l'appelant dépasse
    expect(raidBaseDamage({ pp: 100, forScore: 0, chaBonus: 5 })).toBe(130);
    expect(raidBaseDamage({ pp: -10, forScore: -5, chaBonus: -1 })).toBe(0);
    expect(raidDamage(1000, 2)).toBe(1100);
    expect(raidDamage(1000, 8)).toBe(1250);
    expect(raidDamage(-1, 0)).toBe(0);
  });

  it('victoire : premier jour où le cumul atteint les PV, jours écoulés, coffre', () => {
    const daily = [
      { date: '2026-10-13', damage: 400 },
      { date: '2026-10-12', damage: 500 },
      { date: '2026-10-12', damage: 300 },
      { date: '2026-10-15', damage: 900 },
    ];
    expect(raidVictoryDay(daily, 1000)).toBe('2026-10-13');
    expect(raidVictoryDay(daily, 1200)).toBe('2026-10-13');
    expect(raidVictoryDay(daily, 2000)).toBe('2026-10-15');
    expect(raidVictoryDay(daily, 5000)).toBeNull();
    expect(raidVictoryDay([], 1)).toBeNull();
    expect(raidDaysToKill('2026-10-12', '2026-10-12')).toBe(1);
    expect(raidDaysToKill('2026-10-12', '2026-10-18')).toBe(7);
    expect(raidRewardChest(1)).toBe('mythique');
    expect(raidRewardChest(3)).toBe('mythique');
    expect(raidRewardChest(4)).toBe('or');
    expect(raidRewardChest(7)).toBe('or');
  });

  it('issue : victoire à 2 membres au moins, void si jamais complète, défaite sinon', () => {
    expect(raidOutcome({ joined: 3, totalDamage: 100, maxHp: 100, weekOver: false })).toBe('victory');
    expect(raidOutcome({ joined: 3, totalDamage: 99, maxHp: 100, weekOver: false })).toBeNull();
    expect(raidOutcome({ joined: 3, totalDamage: 99, maxHp: 100, weekOver: true })).toBe('defeat');
    expect(raidOutcome({ joined: 1, totalDamage: 999, maxHp: 100, weekOver: false })).toBeNull();
    expect(raidOutcome({ joined: 1, totalDamage: 999, maxHp: 100, weekOver: true })).toBe('void');
  });

  it('la semaine est finie à partir du lundi suivant', () => {
    expect(raidWeekOver('2026-10-12', '2026-10-18')).toBe(false);
    expect(raidWeekOver('2026-10-12', '2026-10-19')).toBe(true);
  });
});
