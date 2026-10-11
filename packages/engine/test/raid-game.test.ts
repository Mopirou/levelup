import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MemoryStore,
  RAID_MAX_MEMBERS,
  autoRaidHit,
  completeQuestAction,
  createCharacter,
  createRaidTeam,
  emptyRaidState,
  encourageRaid,
  ensureQuests,
  getRaidState,
  heroCombatStats,
  inviteToRaid,
  joinRaidTeam,
  leaveRaidTeam,
  raidBaseDamage,
  raidBossFor,
  raidChaBonus,
  raidDamage,
  raidMaxHp,
  startTrack,
  type QuestTemplate,
  type RaidState,
  type ServerContext,
} from '../src';
import { TEST_RUNG_TEMPLATES } from './track-fixtures';

const catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'quests.fr.json'), 'utf8')).map(
  (q: QuestTemplate) => ({ ...q, source: 'catalog' }),
) as QuestTemplate[];

// 2026-10-12 est un lundi : la semaine du raid va du 12 au 18.
const at = (day: number, hour = 9) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+02:00`;
const date = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;
let counter = 0;

const heroInput = (name: string, scores = { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 }) => ({
  name,
  classId: 'guerrier',
  scores,
  portraitId: 'p1',
  frameColor: '#2f5a47',
  timezone: 'Europe/Paris',
});

const IDS = ['u-lea', 'u-bob', 'u-cat', 'u-dan', 'u-eve', 'u-fay', 'u-gus', 'u-stranger'];
const [LEA, BOB, CAT, DAN, EVE, FAY, GUS, STRANGER] = IDS;

async function world(n = IDS.length) {
  const store = new MemoryStore([...catalog, ...TEST_RUNG_TEMPLATES]);
  let nowMs = Date.parse(at(12));
  const ctx: ServerContext = { store, now: () => nowMs, uuid: () => `raid-${++counter}` };
  for (const id of IDS.slice(0, n)) expect((await createCharacter(ctx, id, heroInput(id.slice(2)))).ok).toBe(true);
  // Tous les joueurs sont amis de Lea, sauf l'inconnu.
  for (const id of IDS.slice(1, 7)) store.addFriendship(LEA, id);
  return { store, ctx, setNow: (iso: string) => (nowMs = Date.parse(iso)) };
}
type W = Awaited<ReturnType<typeof world>>;

const state = async (w: W, id: string): Promise<RaidState> => {
  const r = await getRaidState(w.ctx, id);
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
};
const err = (r: { ok: boolean; error?: string }, code: string) => {
  expect(r.ok).toBe(false);
  expect(r.error).toBe(code);
};

/** Équipe de Lea avec les `joined` premiers amis (hors Lea) déjà joints. */
async function team(w: W, joined: number) {
  ok(await createRaidTeam(w.ctx, LEA));
  for (const id of IDS.slice(1, 1 + joined)) {
    ok(await inviteToRaid(w.ctx, LEA, { profileId: id }));
    const s = await state(w, id);
    ok(await joinRaidTeam(w.ctx, id, { teamId: s.invitations[0].teamId }));
  }
  return (await state(w, LEA)).team!;
}

describe('raids : état et équipe', () => {
  it('sans personnage : no-character partout', async () => {
    const store = new MemoryStore(catalog);
    const ctx: ServerContext = { store, now: () => Date.parse(at(12)), uuid: () => `x-${++counter}` };
    for (const r of [
      await getRaidState(ctx, 'nobody'),
      await createRaidTeam(ctx, 'nobody'),
      await inviteToRaid(ctx, 'nobody', { profileId: 'x' }),
      await joinRaidTeam(ctx, 'nobody', { teamId: 'x' }),
      await leaveRaidTeam(ctx, 'nobody'),
      await encourageRaid(ctx, 'nobody', { profileId: 'x' }),
    ]) err(r, 'no-character');
    expect(await autoRaidHit(ctx, 'nobody')).toBeNull();
  });

  it('sans équipe : le boss de la semaine, des règles, rien d’autre', async () => {
    const w = await world(2);
    const s = await state(w, LEA);
    expect(s).toMatchObject({ available: true, today: date(12), week: '2026-W42', weekStart: date(12), weekEnd: date(18), team: null, invitations: [], hit: null, lastResult: null });
    expect(s.boss).toBe(raidBossFor(date(12)));
    expect(s.rules).toMatchObject({ minMembers: 2, maxMembers: 6, encourageStep: 0.05, encourageCap: 0.25, chaCap: 0.3, fastDays: 4, winChest: 'or', fastChest: 'mythique' });
    expect(emptyRaidState(date(12))).toMatchObject({ available: false, team: null });
  });

  it('créer une équipe : le chef frappe tout de suite, une seule fois par jour', async () => {
    const w = await world(2);
    const r = ok(await createRaidTeam(w.ctx, LEA));
    const t = r.state.team!;
    expect(t).toMatchObject({ status: 'forming', leaderId: LEA, weekStart: date(12), maxHp: raidMaxHp(1), daysLeft: 7, reward: null });
    expect(t.members).toHaveLength(1);
    expect(t.members[0]).toMatchObject({ profileId: LEA, isLeader: true, isMe: true, hitToday: true });
    const stats = await heroCombatStats(w.store, LEA, (await w.store.getCharacter(LEA))!);
    const expected = raidBaseDamage({ pp: stats.power, forScore: stats.scores.FOR, chaBonus: raidChaBonus([stats.scores.CHA]) });
    expect(r.state.hit).toMatchObject({ date: date(12), damage: expected, baseDamage: expected, encouragements: 0, victory: false });
    expect(t.damage).toBe(expected);
    expect(t.members[0].damageToday).toBe(expected);
    // Relecture : idempotent, pas de second coup
    const again = await state(w, LEA);
    expect(again.hit).toBeNull();
    expect(again.team!.damage).toBe(expected);
    // Une seconde équipe est refusée
    err(await createRaidTeam(w.ctx, LEA), 'already-active');
  });

  it('le lendemain, un nouveau coup ; le même jour, jamais deux', async () => {
    const w = await world(2);
    ok(await createRaidTeam(w.ctx, LEA));
    const d1 = (await state(w, LEA)).team!.damage;
    w.setNow(at(13));
    const s2 = await state(w, LEA);
    expect(s2.hit).toMatchObject({ date: date(13) });
    expect(s2.team!.damage).toBe(d1 + s2.hit!.damage);
    expect(s2.team!.members[0].damageWeek).toBe(s2.team!.damage);
    expect((await state(w, LEA)).hit).toBeNull();
  });

  it('inviter : amis uniquement, le chef seulement, une notification par invitation', async () => {
    const w = await world();
    ok(await createRaidTeam(w.ctx, LEA));
    err(await inviteToRaid(w.ctx, LEA, { profileId: STRANGER }), 'not-friends');
    err(await inviteToRaid(w.ctx, LEA, { profileId: LEA }), 'invalid');
    err(await inviteToRaid(w.ctx, LEA, { profileId: '' }), 'invalid');
    err(await inviteToRaid(w.ctx, LEA, { profileId: 'ghost' }), 'not-friends');
    w.store.addFriendship(LEA, 'u-nochar');
    err(await inviteToRaid(w.ctx, LEA, { profileId: 'u-nochar' }), 'not-found');
    // Le non-chef ne peut pas inviter
    ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    const bobTeam = (await state(w, BOB)).invitations[0].teamId;
    err(await inviteToRaid(w.ctx, BOB, { profileId: CAT }), 'no-team');
    ok(await joinRaidTeam(w.ctx, BOB, { teamId: bobTeam }));
    err(await inviteToRaid(w.ctx, BOB, { profileId: CAT }), 'forbidden');
    // Ré-inviter : pas de seconde notification
    ok(await inviteToRaid(w.ctx, LEA, { profileId: CAT }));
    ok(await inviteToRaid(w.ctx, LEA, { profileId: CAT }));
    expect(w.store.notifications.filter((n) => n.type === 'raid_invite' && n.userId === CAT)).toHaveLength(1);
    expect(w.store.notifications.find((n) => n.type === 'raid_invite')!.payload).toMatchObject({ from: LEA, username: 'lea', team: bobTeam });
    // Un membre déjà joint dans l'équipe : rien à faire
    const again = ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    expect(again.state.team!.members).toHaveLength(2);
    // Invité dans une autre équipe : refus
    const w2 = await world();
    ok(await createRaidTeam(w2.ctx, BOB));
    w2.store.addFriendship(BOB, CAT);
    ok(await createRaidTeam(w2.ctx, CAT));
    err(await inviteToRaid(w2.ctx, BOB, { profileId: CAT }), 'already-active');
  });

  it('rejoindre : invitation requise, équipe de la semaine, un seul raid par joueur', async () => {
    const w = await world();
    ok(await createRaidTeam(w.ctx, LEA));
    const teamId = (await state(w, LEA)).team!.id;
    err(await joinRaidTeam(w.ctx, BOB, { teamId }), 'forbidden');
    err(await joinRaidTeam(w.ctx, BOB, { teamId: 'nope' }), 'not-found');
    err(await joinRaidTeam(w.ctx, BOB, { teamId: '' }), 'not-found');
    ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    const inv = (await state(w, BOB)).invitations;
    expect(inv).toHaveLength(1);
    expect(inv[0]).toMatchObject({ teamId, leaderId: LEA, leaderName: 'lea', members: 1 });
    const joined = ok(await joinRaidTeam(w.ctx, BOB, { teamId }));
    expect(joined.state.team!.members.map((m) => m.profileId).sort()).toEqual([BOB, LEA]);
    expect(joined.state.team!.status).toBe('active');
    expect(joined.state.team!.maxHp).toBe(raidMaxHp(2));
    expect(joined.state.hit).not.toBeNull();
    expect(joined.state.invitations).toEqual([]);
    // Idempotent
    ok(await joinRaidTeam(w.ctx, BOB, { teamId }));
    // Invité dans une deuxième équipe alors qu'on est déjà joint : refus
    const w2 = await world();
    ok(await createRaidTeam(w2.ctx, LEA));
    w2.store.addFriendship(BOB, CAT);
    ok(await createRaidTeam(w2.ctx, CAT));
    const catTeam = (await state(w2, CAT)).team!.id;
    ok(await inviteToRaid(w2.ctx, LEA, { profileId: BOB }));
    const leaTeam = (await state(w2, LEA)).team!.id;
    ok(await joinRaidTeam(w2.ctx, BOB, { teamId: leaTeam }));
    // Une invitation tardive d'une autre équipe ne peut plus être acceptée
    await w2.store.insertRaidMember({ teamId: catTeam, profileId: BOB, weekStart: date(12), status: 'invited', invitedBy: CAT, createdAt: 'x', joinedAt: null });
    err(await joinRaidTeam(w2.ctx, BOB, { teamId: catTeam }), 'already-active');
  });

  it('rejoindre : l’amitié avec le chef est revérifiée, et une équipe d’une autre semaine est fermée', async () => {
    const w = await world();
    ok(await createRaidTeam(w.ctx, LEA));
    const teamId = (await state(w, LEA)).team!.id;
    ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    w.store.friendPairs.clear();
    err(await joinRaidTeam(w.ctx, BOB, { teamId }), 'not-friends');
    expect((await state(w, BOB)).invitations).toEqual([]);
    // Semaine suivante : l'invitation d'avant n'est plus rejoignable
    w.store.addFriendship(LEA, CAT);
    ok(await inviteToRaid(w.ctx, LEA, { profileId: CAT }));
    w.setNow(at(19));
    err(await joinRaidTeam(w.ctx, CAT, { teamId }), 'raid-closed');
    expect((await state(w, CAT)).invitations).toEqual([]);
  });

  it('6 membres au plus : la 7e personne est refusée à l’invitation comme à l’arrivée', async () => {
    const w = await world();
    const t = await team(w, 5);
    expect(t.members).toHaveLength(RAID_MAX_MEMBERS);
    expect(t.maxHp).toBe(raidMaxHp(6));
    err(await inviteToRaid(w.ctx, LEA, { profileId: GUS }), 'team-full');
    // Invitation posée hors moteur : l'arrivée est refusée
    w.store.addFriendship(LEA, GUS);
    expect(await w.store.insertRaidMember({ teamId: t.id, profileId: GUS, weekStart: date(12), status: 'invited', invitedBy: LEA, createdAt: 'x', joinedAt: null })).toBe('ok');
    err(await joinRaidTeam(w.ctx, GUS, { teamId: t.id }), 'team-full');
    expect(await w.store.joinRaidMember(t.id, GUS, 'x')).toBe('full');
    expect(await w.store.insertRaidMember({ teamId: t.id, profileId: STRANGER, weekStart: date(12), status: 'joined', invitedBy: LEA, createdAt: 'x', joinedAt: 'x' })).toBe('not-friend');
    w.store.addFriendship(LEA, STRANGER);
    expect(await w.store.insertRaidMember({ teamId: t.id, profileId: STRANGER, weekStart: date(12), status: 'joined', invitedBy: LEA, createdAt: 'x', joinedAt: 'x' })).toBe('full');
  });

  it('le magasin garde ses garde-fous : doublons, semaines, équipes inconnues', async () => {
    const w = await world();
    const t = await team(w, 1);
    const base = { teamId: t.id, weekStart: date(12), status: 'invited' as const, invitedBy: LEA, createdAt: 'x', joinedAt: null };
    expect(await w.store.insertRaidMember({ ...base, profileId: BOB })).toBe('duplicate');
    expect(await w.store.insertRaidMember({ ...base, profileId: CAT, weekStart: date(19) })).toBe('conflict');
    expect(await w.store.insertRaidMember({ ...base, teamId: 'ghost', profileId: CAT })).toBe('conflict');
    expect(await w.store.joinRaidMember('ghost', CAT, 'x')).toBe('conflict');
    expect(await w.store.joinRaidMember(t.id, BOB, 'x')).toBe('duplicate');
    // Un joueur déjà joint ailleurs cette semaine ne peut pas rejoindre / être ajouté
    w.store.addFriendship(BOB, DAN);
    const other = { id: 'other-team', weekStart: date(12), leaderId: DAN, createdAt: 'x', resolvedAt: null, outcome: null, maxHp: null, totalDamage: null, victoryDay: null };
    expect(await w.store.insertRaidTeam(other, { teamId: 'other-team', profileId: DAN, weekStart: date(12), status: 'joined', invitedBy: DAN, createdAt: 'x', joinedAt: 'x' })).toBe(true);
    expect(await w.store.insertRaidMember({ teamId: 'other-team', profileId: BOB, weekStart: date(12), status: 'joined', invitedBy: DAN, createdAt: 'x', joinedAt: 'x' })).toBe('conflict');
    expect(await w.store.insertRaidMember({ teamId: 'other-team', profileId: CAT, weekStart: date(12), status: 'joined', invitedBy: DAN, createdAt: 'x', joinedAt: 'x' })).toBe('not-friend');
    w.store.addFriendship(DAN, BOB);
    expect(await w.store.insertRaidMember({ teamId: 'other-team', profileId: BOB, weekStart: date(12), status: 'invited', invitedBy: DAN, createdAt: 'x', joinedAt: null })).toBe('ok');
    expect(await w.store.joinRaidMember('other-team', BOB, 'x')).toBe('conflict');
    // Le chef qui crée une seconde équipe la même semaine : refusé
    expect(await w.store.insertRaidTeam({ ...other, id: 'third' }, { teamId: 'third', profileId: DAN, weekStart: date(12), status: 'joined', invitedBy: DAN, createdAt: 'x', joinedAt: 'x' })).toBe(false);
    expect(await w.store.getRaidTeam('third')).toBeNull();
    expect(await w.store.areFriends(LEA, LEA)).toBe(false);
  });
});

describe('raids : dégâts, CHA et encouragements', () => {
  it('chaque membre frappe avec sa propre puissance et le CHA moyen du groupe', async () => {
    const w = await world();
    // Bob est un orateur (CHA élevé), Lea un guerrier
    await w.store.saveCharacter(BOB, { ...(await w.store.getCharacter(BOB))!, baseScores: { FOR: 2, DEX: 2, CON: 2, INT: 2, SAG: 2, CHA: 20 } });
    await w.store.saveCharacter(LEA, { ...(await w.store.getCharacter(LEA))!, baseScores: { FOR: 20, DEX: 2, CON: 2, INT: 2, SAG: 2, CHA: 2 } });
    ok(await createRaidTeam(w.ctx, LEA));
    ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    const sBob = ok(await joinRaidTeam(w.ctx, BOB, { teamId: (await state(w, BOB)).invitations[0].teamId }));
    const stats = async (id: string) => heroCombatStats(w.store, id, (await w.store.getCharacter(id))!);
    const [a, b] = [await stats(LEA), await stats(BOB)];
    const cha = raidChaBonus([a.scores.CHA, b.scores.CHA]);
    expect(cha).toBeGreaterThan(0.05);
    expect(sBob.state.hit).toMatchObject({ chaBonus: cha, baseDamage: raidBaseDamage({ pp: b.power, forScore: b.scores.FOR, chaBonus: cha }) });
    // Lea a frappé seule (CHA 2) avant l'arrivée de Bob : son coup du jour n'est pas rejoué
    const lea = (await state(w, LEA)).team!.members.find((m) => m.isMe)!;
    expect(lea.damageToday).toBe(raidBaseDamage({ pp: a.power, forScore: a.scores.FOR, chaBonus: raidChaBonus([a.scores.CHA]) }));
    expect((await state(w, LEA)).team!.chaBonus).toBeCloseTo(cha);
  });

  it('encourager : +5 % avant le coup (appliqué au coup) ou après (coup augmenté), une fois par ami et par jour', async () => {
    const w = await world();
    await team(w, 0);
    ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    const teamId = (await state(w, BOB)).invitations[0].teamId;
    // Bob n'a pas encore frappé : il est encouragé avant de rejoindre ? Non : seul un membre peut l'être.
    err(await encourageRaid(w.ctx, LEA, { profileId: BOB }), 'not-found');
    // Bob rejoint (coup du jour joué), puis Lea l'encourage : son coup grossit
    const joined = ok(await joinRaidTeam(w.ctx, BOB, { teamId }));
    const before = joined.state.team!.members.find((m) => m.isMe)!.damageToday;
    const r = ok(await encourageRaid(w.ctx, LEA, { profileId: BOB }));
    const bob = r.state.team!.members.find((m) => m.profileId === BOB)!;
    expect(bob).toMatchObject({ encouragementsToday: 1, encouragedByMe: true });
    expect(bob.damageToday).toBeGreaterThan(before);
    expect(bob.damageToday).toBe(Math.floor((await baseOf(w, BOB)) * 1.05));
    err(await encourageRaid(w.ctx, LEA, { profileId: BOB }), 'already-done');
    expect(w.store.notifications.filter((n) => n.type === 'raid_encouraged')).toHaveLength(1);
    expect(w.store.notifications.find((n) => n.type === 'raid_encouraged')).toMatchObject({ userId: BOB, payload: { from: LEA, username: 'lea' } });
    // Le lendemain, Lea encourage Bob AVANT qu'il ne joue : le bonus s'applique à son coup
    w.setNow(at(13));
    ok(await encourageRaid(w.ctx, LEA, { profileId: BOB }));
    const next = await state(w, BOB);
    expect(next.hit!.encouragements).toBe(1);
    expect(next.hit!.damage).toBe(Math.floor(next.hit!.baseDamage * 1.05));
  });

  it('encourager : cas refusés', async () => {
    const w = await world();
    err(await encourageRaid(w.ctx, LEA, { profileId: BOB }), 'no-team');
    await team(w, 1);
    err(await encourageRaid(w.ctx, LEA, { profileId: LEA }), 'invalid');
    err(await encourageRaid(w.ctx, LEA, { profileId: '' }), 'invalid');
    err(await encourageRaid(w.ctx, LEA, { profileId: STRANGER }), 'not-found');
  });

  it('plafond : 5 coéquipiers encouragent, +25 % au maximum', async () => {
    const w = await world();
    await team(w, 5);
    for (const id of [BOB, CAT, DAN, EVE, FAY]) ok(await encourageRaid(w.ctx, id, { profileId: LEA }));
    const lea = (await state(w, LEA)).team!.members.find((m) => m.isMe)!;
    expect(lea.encouragementsToday).toBe(5);
    expect(lea.damageToday).toBe(Math.floor((await baseOf(w, LEA)) * 1.25));
  });
});

/** Dégâts de base enregistrés pour un membre ce jour-là (avant encouragements). */
async function baseOf(w: W, id: string, day = 12): Promise<number> {
  const t = (await state(w, id)).team!;
  return (await w.store.listRaidDamage(t.id)).find((r) => r.profileId === id && r.gameDate === date(day))!.baseDamage;
}

describe('raids : clôture paresseuse', () => {
  /** Ajoute des dégâts directement (jour de jeu donné) pour accélérer le combat. */
  const hitHard = async (w: W, teamId: string, id: string, day: number, damage: number) => {
    await w.store.insertRaidDamage({ teamId, profileId: id, gameDate: date(day), damage, baseDamage: damage, encouragements: 0 });
  };

  it('victoire rapide (< 4 jours) : coffre mythique pour tous, une seule fois, une notification chacun', async () => {
    const w = await world();
    const t = await team(w, 2);
    await hitHard(w, t.id, LEA, 13, 30_000);
    w.setNow(at(14));
    const s = await state(w, BOB);
    expect(s.team).toMatchObject({ status: 'victory', reward: 'mythique', victoryDay: date(13), daysToKill: 2, hpLeft: 0, ratio: 1 });
    expect(s.team!.resolvedAt).not.toBeNull();
    expect(s.hit).toBeNull();
    for (const id of [LEA, BOB, CAT]) {
      const chests = await w.store.listChests(id);
      expect(chests).toHaveLength(1);
      expect(chests[0]).toMatchObject({ rarity: 'mythique', source: 'raid', sourceKey: `2026-W42:${t.id}`, openedAt: null });
    }
    expect(await w.store.listChests(DAN)).toHaveLength(0);
    // Relectures, autre membre, jours suivants : rien ne se duplique
    await state(w, LEA);
    await state(w, CAT);
    w.setNow(at(20));
    await state(w, LEA);
    for (const id of [LEA, BOB, CAT]) expect(await w.store.listChests(id)).toHaveLength(1);
    const wins = w.store.notifications.filter((n) => n.type === 'raid_victory');
    expect(wins.map((n) => n.userId).sort()).toEqual([BOB, CAT, LEA]);
    expect(wins[0].payload).toMatchObject({ chest: 'mythique', days: 2, week: '2026-W42' });
    // La semaine suivante, le résultat reste lisible
    const last = (await state(w, LEA)).lastResult!;
    expect(last).toMatchObject({ teamId: t.id, outcome: 'victory', reward: 'mythique', daysToKill: 2, weekStart: date(12) });
    expect(last.boss).toBe(raidBossFor(date(12)));
  });

  it('victoire lente (4 jours ou plus) : coffre d’or', async () => {
    const w = await world();
    const t = await team(w, 1);
    await hitHard(w, t.id, LEA, 16, 30_000);
    w.setNow(at(16));
    const s = await state(w, LEA);
    expect(s.team).toMatchObject({ status: 'victory', reward: 'or', daysToKill: 5 });
    expect((await w.store.listChests(BOB))[0].rarity).toBe('or');
  });

  it('victoire constatée par un encouragement qui fait basculer le total', async () => {
    const w = await world();
    const t = await team(w, 1);
    const total = (await state(w, LEA)).team!.damage;
    const hp = raidMaxHp(2);
    // Il manque juste de quoi faire tomber le boss avec un encouragement sur le coup de Bob
    const bobRow = (await w.store.listRaidDamage(t.id)).find((d) => d.profileId === BOB)!;
    const gain = raidDamage(bobRow.baseDamage, 1) - bobRow.damage;
    await hitHard(w, t.id, LEA, 14, hp - total - gain);
    expect((await state(w, LEA)).team!.status).toBe('active');
    const r = ok(await encourageRaid(w.ctx, LEA, { profileId: BOB }));
    expect(r.state.team!.status).toBe('victory');
  });

  it('le coup qui fait tomber le boss est signalé (hit.victory) et verse les coffres', async () => {
    const w = await world();
    const t = await team(w, 1);
    const sum = (await w.store.listRaidDamage(t.id)).reduce((n, d) => n + d.damage, 0);
    // Il manque 1 PV : le coup du lendemain de Bob suffit (Lea a déjà frappé ce jour-là)
    await hitHard(w, t.id, LEA, 13, raidMaxHp(2) - sum - 1);
    w.setNow(at(13));
    const s = await state(w, BOB);
    expect(s.hit).toMatchObject({ victory: true });
    expect(s.team).toMatchObject({ status: 'victory', reward: 'mythique', daysToKill: 2 });
    expect(await w.store.listChests(LEA)).toHaveLength(1);
  });

  it('défaite : aucune récompense, résultat disponible la semaine suivante ; un coup tardif ne compte plus', async () => {
    const w = await world();
    const t = await team(w, 1);
    // Dimanche : toujours en cours
    w.setNow(at(18));
    expect((await state(w, LEA)).team).toMatchObject({ status: 'active', daysLeft: 1 });
    // Lundi suivant : clôture paresseuse déclenchée par la lecture de Bob
    w.setNow(at(19));
    const s = await state(w, BOB);
    expect(s.team).toBeNull();
    expect(s.lastResult).toMatchObject({ teamId: t.id, outcome: 'defeat', reward: null, daysToKill: null });
    expect(s.lastResult!.damage).toBeGreaterThan(0);
    expect(s.lastResult!.maxHp).toBe(raidMaxHp(2));
    expect(await w.store.listChests(LEA)).toHaveLength(0);
    expect(w.store.notifications.filter((n) => n.type === 'raid_victory')).toHaveLength(0);
    expect((await w.store.getRaidTeam(t.id))!.outcome).toBe('defeat');
    // Idempotent
    await state(w, LEA);
    const closedAt = (await w.store.getRaidTeam(t.id))!.resolvedAt;
    w.setNow(at(20));
    await state(w, LEA);
    expect((await w.store.getRaidTeam(t.id))!.resolvedAt).toBe(closedAt);
    w.setNow(at(19));
    // Le coup du lundi suivant ne va pas dans l'ancienne équipe
    expect((await w.store.listRaidDamage(t.id)).filter((d) => d.gameDate >= date(19))).toHaveLength(0);
    err(await leaveRaidTeam(w.ctx, LEA, { teamId: t.id }), 'no-team');
  });

  it('équipe jamais complète : void, sans récompense', async () => {
    const w = await world();
    ok(await createRaidTeam(w.ctx, LEA));
    const id = (await state(w, LEA)).team!.id;
    w.setNow(at(21));
    const s = await state(w, LEA);
    expect(s.lastResult).toMatchObject({ teamId: id, outcome: 'void', reward: null });
    expect(await w.store.listChests(LEA)).toHaveLength(0);
  });

  it('un solo ne peut pas gagner, même avec des dégâts énormes', async () => {
    const w = await world();
    ok(await createRaidTeam(w.ctx, LEA));
    const id = (await state(w, LEA)).team!.id;
    await hitHard(w, id, LEA, 13, 999_999);
    w.setNow(at(14));
    expect((await state(w, LEA)).team).toMatchObject({ status: 'forming', resolvedAt: null });
    // Un deuxième membre arrive : la victoire est constatée
    ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    const s = ok(await joinRaidTeam(w.ctx, BOB, { teamId: id }));
    expect(s.state.team).toMatchObject({ status: 'victory', reward: 'mythique', daysToKill: 2 });
    // Le boss était déjà tombé : on ne le frappe pas une fois mort
    expect(s.state.hit).toBeNull();
    expect(await w.store.listChests(BOB)).toHaveLength(1);
  });

  it('une victoire clôturée garde ses PV figés et ne se quitte plus', async () => {
    const w = await world();
    const t = await team(w, 1);
    await hitHard(w, t.id, LEA, 13, 30_000);
    w.setNow(at(14));
    const s = await state(w, LEA);
    err(await leaveRaidTeam(w.ctx, LEA), 'raid-closed');
    err(await inviteToRaid(w.ctx, LEA, { profileId: CAT }), 'no-team');
    err(await encourageRaid(w.ctx, LEA, { profileId: BOB }), 'no-team');
    expect(s.team!.maxHp).toBe(raidMaxHp(2));
    const closed = (await w.store.getRaidTeam(t.id))!;
    expect(closed).toMatchObject({ outcome: 'victory', victoryDay: date(13), maxHp: raidMaxHp(2) });
    expect(await w.store.resolveRaidTeam(t.id, { outcome: 'defeat', maxHp: 1, totalDamage: 0, victoryDay: null, at: 'z' })).toBe(false);
    expect(await w.store.resolveRaidTeam('ghost', { outcome: 'defeat', maxHp: 1, totalDamage: 0, victoryDay: null, at: 'z' })).toBe(false);
  });
});

describe('raids : quitter, refuser, passer la main', () => {
  it('un membre qui part emporte ses dégâts ; le chef qui part passe la main ; l’équipe vide disparaît', async () => {
    const w = await world();
    const t = await team(w, 2);
    const total = (await state(w, LEA)).team!.damage;
    const bobDmg = (await state(w, LEA)).team!.members.find((m) => m.profileId === BOB)!.damageWeek;
    const r = ok(await leaveRaidTeam(w.ctx, BOB));
    expect(r.state.team).toBeNull();
    const rest = (await state(w, LEA)).team!;
    expect(rest.members.map((m) => m.profileId).sort()).toEqual([CAT, LEA]);
    expect(rest.damage).toBe(total - bobDmg);
    expect(rest.maxHp).toBe(raidMaxHp(2));
    // Bob peut rejoindre une autre équipe le même jour (son coup a été retiré avec lui)
    ok(await createRaidTeam(w.ctx, BOB));
    // Le chef part : Cat, la plus ancienne arrivée, prend la main
    ok(await leaveRaidTeam(w.ctx, LEA));
    expect((await w.store.getRaidTeam(t.id))!.leaderId).toBe(CAT);
    expect((await state(w, CAT)).team!.members).toHaveLength(1);
    // Le dernier part : l'équipe disparaît
    ok(await leaveRaidTeam(w.ctx, CAT));
    expect(await w.store.getRaidTeam(t.id)).toBeNull();
    expect(await w.store.listRaidMembers(t.id)).toEqual([]);
    err(await leaveRaidTeam(w.ctx, CAT), 'no-team');
  });

  it('refuser une invitation, avec ou sans identifiant d’équipe', async () => {
    const w = await world();
    ok(await createRaidTeam(w.ctx, LEA));
    ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    ok(await inviteToRaid(w.ctx, LEA, { profileId: CAT }));
    const teamId = (await state(w, BOB)).invitations[0].teamId;
    err(await leaveRaidTeam(w.ctx, BOB, { teamId: 'autre' }), 'no-team');
    expect((await state(w, LEA)).team!.pending.map((p) => p.profileId).sort()).toEqual([BOB, CAT]);
    expect((await state(w, LEA)).team!.pending[0].name).toBeTruthy();
    const r = ok(await leaveRaidTeam(w.ctx, BOB, { teamId }));
    expect(r.state.invitations).toEqual([]);
    ok(await leaveRaidTeam(w.ctx, CAT));
    expect((await state(w, LEA)).team!.pending).toEqual([]);
  });

  it('une équipe de 1 qui perd son chef sans autre membre joint disparaît avec ses invitations', async () => {
    const w = await world();
    ok(await createRaidTeam(w.ctx, LEA));
    const id = (await state(w, LEA)).team!.id;
    ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    ok(await leaveRaidTeam(w.ctx, LEA));
    expect(await w.store.getRaidTeam(id)).toBeNull();
    expect((await state(w, BOB)).invitations).toEqual([]);
  });

  it('rejoindre une autre équipe après être parti, et créer en ayant des invitations en attente', async () => {
    const w = await world();
    ok(await createRaidTeam(w.ctx, LEA));
    ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    // Bob crée sa propre équipe : son invitation en attente est retirée
    ok(await createRaidTeam(w.ctx, BOB));
    expect((await w.store.listRaidMemberships(BOB, date(12))).filter((m) => m.status === 'invited')).toHaveLength(0);
  });

  it('les encouragements donnés partent avec celui qui quitte l’équipe', async () => {
    const w = await world();
    const t = await team(w, 1);
    ok(await encourageRaid(w.ctx, BOB, { profileId: LEA }));
    expect(await w.store.listRaidEncouragements(t.id, date(12))).toHaveLength(1);
    ok(await leaveRaidTeam(w.ctx, BOB));
    expect(await w.store.listRaidEncouragements(t.id, date(12))).toHaveLength(0);
  });
});

describe('raids : coup du jour pendant la validation d’une quête', () => {
  it('la validation joue le coup du jour de l’équipe et le signale dans la réponse', async () => {
    const w = await world(2);
    ok(await createRaidTeam(w.ctx, LEA));
    expect(ok(await startTrack(w.ctx, LEA, { trackId: 'muscu-haut' })).track.trackId).toBe('muscu-haut');
    // Le lendemain : premier chargement du jour = validation d'une quête
    w.setNow(at(13));
    await ensureQuests(w.ctx, LEA);
    const q = (await w.store.listInstances(LEA, { period: 'daily' })).find((x) => x.trackId === 'muscu-haut' && x.periodStart === date(13))!;
    const v = q.snapshot.validation;
    const done = ok(
      await completeQuestAction(w.ctx, LEA, {
        instanceId: q.id,
        useInspiration: false,
        progress: v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : undefined,
        stepsDone: v.type === 'steps' ? v.steps.map(() => true) : undefined,
        journalText: v.type === 'journal' ? 'x'.repeat(60) : undefined,
      }),
    );
    expect(done.data.raid).toMatchObject({ date: date(13), victory: false });
    expect(done.data.raid!.damage).toBeGreaterThan(0);
    // Le coup est déjà joué : la lecture ne le rejoue pas
    expect((await state(w, LEA)).hit).toBeNull();
    expect((await state(w, LEA)).team!.members[0].damageToday).toBe(done.data.raid!.damage);
  });

  it('sans équipe, la validation ne dit rien du raid ; un raid en panne ne bloque jamais le jeu', async () => {
    const w = await world(2);
    expect(await autoRaidHit(w.ctx, LEA)).toBeNull();
    ok(await createRaidTeam(w.ctx, LEA));
    const broken = { ...w.ctx, store: Object.assign(Object.create(w.store), { listRaidMemberships: async () => { throw new Error('panne'); } }) } as ServerContext;
    const quiet = console.error;
    console.error = () => undefined;
    try {
      expect(await autoRaidHit(broken, LEA)).toBeNull();
    } finally {
      console.error = quiet;
    }
  });

  it('une notification qui échoue ne fait pas échouer l’invitation', async () => {
    const w = await world(3);
    ok(await createRaidTeam(w.ctx, LEA));
    w.store.notify = async () => {
      throw new Error('notify cassé');
    };
    const quiet = console.error;
    console.error = () => undefined;
    try {
      ok(await inviteToRaid(w.ctx, LEA, { profileId: BOB }));
    } finally {
      console.error = quiet;
    }
    expect((await state(w, BOB)).invitations).toHaveLength(1);
  });
});
