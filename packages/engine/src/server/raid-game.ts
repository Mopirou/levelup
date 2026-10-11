import { gameDate, addDays, diffDays } from '../dates';
import {
  RAID_BASE_HP,
  RAID_CHA_CAP,
  RAID_ENCOURAGE_CAP,
  RAID_ENCOURAGE_STEP,
  RAID_FAST_DAYS,
  RAID_FAST_CHEST,
  RAID_MAX_MEMBERS,
  RAID_MIN_MEMBERS,
  RAID_WIN_CHEST,
  raidBaseDamage,
  raidBossFor,
  raidChaBonus,
  raidDamage,
  raidDaysToKill,
  raidMaxHp,
  raidOutcome,
  raidRewardChest,
  raidVictoryDay,
  raidWeekEnd,
  raidWeekKey,
  raidWeekOver,
  raidWeekStart,
  type RaidBossDef,
  type RaidOutcome,
} from '../raid';
import type { Chest, ChestRarity } from '../types';
import { heroCombatStats } from './hero-stats';
import type { GameError, Result } from './game';
import type {
  CharacterRecord,
  RaidDamageRecord,
  RaidMemberRecord,
  RaidTeamRecord,
  ServerContext,
  SettingsRecord,
} from './types';

// ───────────────────────── Raids d'amis (V2) : actions ─────────────────────────
//
// Un boss mondial par semaine ISO ; les équipes d'amis (2 à 6) lui infligent des dégâts une fois par jour, sans rien faire :
// le coup du jour s'applique au premier chargement du jour (`getRaidState`, ou la validation d'une quête). La clôture est
// paresseuse : la victoire est constatée dès que le boss tombe, la défaite à la première lecture après le dimanche.
// Toute lecture est idempotente. Voir docs/DONJONS.md §8.

const fail = (error: GameError, message?: string) => ({ ok: false as const, error, message });

/** Semaines relues pour trouver les raids à clore (la semaine en cours et les deux précédentes) */
const LOOKBACK_DAYS = 14;

interface RaidEnv {
  ctx: ServerContext;
  userId: string;
  character: CharacterRecord;
  settings: SettingsRecord;
  today: string;
  weekStart: string;
  weekEnd: string;
  nowIso: string;
}

async function loadRaidEnv(ctx: ServerContext, userId: string): Promise<RaidEnv | null> {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return null;
  const nowMs = ctx.now();
  const today = gameDate(nowMs, settings.timezone, settings.resetHour);
  return { ctx, userId, character, settings, today, weekStart: raidWeekStart(today), weekEnd: raidWeekEnd(today), nowIso: new Date(nowMs).toISOString() };
}

// ───────────────────────── Types exposés ─────────────────────────

export type RaidStatus = 'forming' | 'active' | 'victory' | 'defeat' | 'void';

export interface RaidMemberView {
  profileId: string;
  name: string;
  classId: string;
  portraitId: string;
  frameColor: string;
  level: number;
  /** Puissance (PP) du membre */
  power: number;
  isLeader: boolean;
  isMe: boolean;
  joinedAt: string | null;
  /** A déjà frappé aujourd'hui */
  hitToday: boolean;
  damageToday: number;
  /** Dégâts cumulés cette semaine */
  damageWeek: number;
  /** Encouragements reçus aujourd'hui (0..5) */
  encouragementsToday: number;
  /** Je l'ai déjà encouragé aujourd'hui */
  encouragedByMe: boolean;
}

export interface RaidTeamView {
  id: string;
  weekStart: string;
  weekEnd: string;
  leaderId: string;
  status: RaidStatus;
  members: RaidMemberView[];
  /** Invitations en attente (pour le chef) */
  pending: { profileId: string; name: string }[];
  /** PV maximum (selon le nombre de membres) et dégâts cumulés ; figés à la clôture */
  maxHp: number;
  damage: number;
  hpLeft: number;
  /** Part des PV déjà retirée (0..1) */
  ratio: number;
  /** Bonus de CHA du groupe (0..0,30) */
  chaBonus: number;
  /** Jours de jeu restants, aujourd'hui compris */
  daysLeft: number;
  /** Jour où le boss est tombé et nombre de jours écoulés (victoire) */
  victoryDay: string | null;
  daysToKill: number | null;
  /** Coffre obtenu par une victoire (déjà versé dans l'inventaire) */
  reward: ChestRarity | null;
  resolvedAt: string | null;
}

export interface RaidInvitationView {
  teamId: string;
  leaderId: string;
  leaderName: string;
  invitedAt: string;
  members: number;
}

/** Coup infligé par l'appel en cours (absent quand le coup du jour était déjà donné). */
export interface RaidHit {
  teamId: string;
  date: string;
  damage: number;
  /** Dégâts avant encouragements */
  baseDamage: number;
  chaBonus: number;
  encouragements: number;
  /** Ce coup a fait tomber le boss */
  victory: boolean;
}

/** Issue du dernier raid clos d'une semaine précédente. */
export interface RaidResult {
  teamId: string;
  weekStart: string;
  boss: RaidBossDef;
  outcome: RaidOutcome;
  maxHp: number;
  damage: number;
  daysToKill: number | null;
  reward: ChestRarity | null;
  resolvedAt: string;
}

export interface RaidRules {
  minMembers: number;
  maxMembers: number;
  baseHp: number;
  chaCap: number;
  encourageStep: number;
  encourageCap: number;
  fastDays: number;
  winChest: ChestRarity;
  fastChest: ChestRarity;
}

export interface RaidState {
  /** `false` en mode local : pas d'équipes sans compte */
  available: boolean;
  today: string;
  /** Clé de la semaine ISO (`2026-W41`) */
  week: string;
  weekStart: string;
  weekEnd: string;
  boss: RaidBossDef;
  rules: RaidRules;
  /** Mon équipe de la semaine (créée ou rejointe), `null` sinon */
  team: RaidTeamView | null;
  /** Invitations reçues cette semaine */
  invitations: RaidInvitationView[];
  hit: RaidHit | null;
  lastResult: RaidResult | null;
}

export const RAID_RULES: RaidRules = {
  minMembers: RAID_MIN_MEMBERS,
  maxMembers: RAID_MAX_MEMBERS,
  baseHp: RAID_BASE_HP,
  chaCap: RAID_CHA_CAP,
  encourageStep: RAID_ENCOURAGE_STEP,
  encourageCap: RAID_ENCOURAGE_CAP,
  fastDays: RAID_FAST_DAYS,
  winChest: RAID_WIN_CHEST,
  fastChest: RAID_FAST_CHEST,
};

/** État vide d'un mode sans équipes (mode local). */
export function emptyRaidState(today: string, available = false): RaidState {
  return {
    available,
    today,
    week: raidWeekKey(today),
    weekStart: raidWeekStart(today),
    weekEnd: raidWeekEnd(today),
    boss: raidBossFor(today),
    rules: RAID_RULES,
    team: null,
    invitations: [],
    hit: null,
    lastResult: null,
  };
}

// ───────────────────────── Aides ─────────────────────────

async function safeNotify(ctx: ServerContext, userId: string, type: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await ctx.store.notify(userId, type, payload);
  } catch (e) {
    // Une notification manquée ne doit jamais bloquer le jeu.
    console.error('raid notify', type, e);
  }
}

const joinedOf = (members: readonly RaidMemberRecord[]) => members.filter((m) => m.status === 'joined');
const sumDamage = (rows: readonly RaidDamageRecord[]) => rows.reduce((n, d) => n + d.damage, 0);
const rewardOf = (team: Pick<RaidTeamRecord, 'outcome' | 'victoryDay' | 'weekStart'>): { rarity: ChestRarity; days: number } | null =>
  team.outcome === 'victory' && team.victoryDay
    ? { rarity: raidRewardChest(raidDaysToKill(team.weekStart, team.victoryDay)), days: raidDaysToKill(team.weekStart, team.victoryDay) }
    : null;

/**
 * Clôture paresseuse d'une équipe : victoire dès que les dégâts cumulés atteignent les PV (2 membres au moins), sinon défaite
 * (ou `void` pour une équipe jamais complète) quand la semaine est finie. Les coffres sont versés avant la clôture (clé
 * d'idempotence = semaine + équipe), et seul l'appel qui clôt réellement prévient les membres : rien n'est jamais doublé.
 */
async function settleTeam(env: RaidEnv, team: RaidTeamRecord): Promise<RaidTeamRecord> {
  if (team.resolvedAt) return team;
  const { ctx } = env;
  const [members, damage] = await Promise.all([ctx.store.listRaidMembers(team.id), ctx.store.listRaidDamage(team.id)]);
  const joined = joinedOf(members);
  const maxHp = raidMaxHp(joined.length);
  const totalDamage = sumDamage(damage);
  const outcome = raidOutcome({ joined: joined.length, totalDamage, maxHp, weekOver: raidWeekOver(team.weekStart, env.today) });
  if (!outcome) return team;
  const victoryDay = outcome === 'victory' ? raidVictoryDay(damage.map((d) => ({ date: d.gameDate, damage: d.damage })), maxHp) : null;
  const reward = rewardOf({ outcome, victoryDay, weekStart: team.weekStart });
  const week = raidWeekKey(team.weekStart);
  if (reward) {
    for (const m of joined) {
      const chest: Chest = { id: ctx.uuid(), rarity: reward.rarity, source: 'raid', sourceKey: `${week}:${team.id}`, instanceId: null, createdAt: env.nowIso, openedAt: null };
      await ctx.store.insertChest(m.profileId, chest);
    }
  }
  const closed = await ctx.store.resolveRaidTeam(team.id, { outcome, maxHp, totalDamage, victoryDay, at: env.nowIso });
  if (closed && reward) {
    for (const m of joined) {
      await safeNotify(ctx, m.profileId, 'raid_victory', { team: team.id, week, chest: reward.rarity, days: reward.days, boss: raidBossFor(team.weekStart).name });
    }
  }
  return (await ctx.store.getRaidTeam(team.id)) ?? team;
}

interface Roster {
  record: RaidMemberRecord;
  character: CharacterRecord | null;
  power: number;
  cha: number;
  forScore: number;
}

/** Personnages, puissance et scores des membres joints (une lecture par membre). */
async function loadRoster(ctx: ServerContext, members: readonly RaidMemberRecord[], me?: { id: string; character: CharacterRecord }): Promise<Roster[]> {
  return Promise.all(
    members.map(async (record) => {
      const character = me && record.profileId === me.id ? me.character : await ctx.store.getCharacter(record.profileId);
      if (!character) return { record, character: null, power: 0, cha: 0, forScore: 0 };
      const s = await heroCombatStats(ctx.store, record.profileId, character);
      return { record, character, power: s.power, cha: s.scores.CHA, forScore: s.scores.FOR };
    }),
  );
}

/** Coup du jour : `PP × (1 + FOR/60) × (1 + CHA du groupe) × (1 + encouragements)`, une fois par jour et par joueur. */
async function applyHit(env: RaidEnv, team: RaidTeamRecord, roster: readonly Roster[], damage: readonly RaidDamageRecord[]): Promise<RaidHit | null> {
  if (team.resolvedAt || env.today < team.weekStart || env.today > raidWeekEnd(team.weekStart)) return null;
  const mine = roster.find((r) => r.record.profileId === env.userId && r.record.status === 'joined');
  if (!mine) return null;
  if (damage.some((d) => d.profileId === env.userId && d.gameDate === env.today)) return null;
  const chaBonus = raidChaBonus(roster.filter((r) => r.record.status === 'joined' && r.character).map((r) => r.cha));
  const baseDamage = raidBaseDamage({ pp: mine.power, forScore: mine.forScore, chaBonus });
  const received = (await env.ctx.store.listRaidEncouragements(team.id, env.today)).filter((e) => e.toId === env.userId).length;
  const record: RaidDamageRecord = { teamId: team.id, profileId: env.userId, gameDate: env.today, baseDamage, encouragements: received, damage: raidDamage(baseDamage, received) };
  if (!(await env.ctx.store.insertRaidDamage(record))) return null;
  return { teamId: team.id, date: env.today, damage: record.damage, baseDamage, chaBonus, encouragements: received, victory: false };
}

interface Synced {
  team: RaidTeamRecord | null;
  members: RaidMemberRecord[];
  hit: RaidHit | null;
  roster: Roster[];
  damage: RaidDamageRecord[];
  memberships: RaidMemberRecord[];
}

/** Clôt les raids dus, applique le coup du jour de l'équipe en cours. Idempotent. */
async function syncRaid(env: RaidEnv): Promise<Synced> {
  const { ctx } = env;
  const memberships = await ctx.store.listRaidMemberships(env.userId, addDays(env.weekStart, -LOOKBACK_DAYS));
  // Raids des semaines passées encore ouverts : clôture paresseuse.
  for (const m of memberships.filter((x) => x.status === 'joined' && x.weekStart < env.weekStart)) {
    const t = await ctx.store.getRaidTeam(m.teamId);
    if (t && !t.resolvedAt) await settleTeam(env, t);
  }
  const mine = memberships.find((m) => m.status === 'joined' && m.weekStart === env.weekStart);
  if (!mine) return { team: null, members: [], hit: null, roster: [], damage: [], memberships };
  let team = await ctx.store.getRaidTeam(mine.teamId);
  if (!team) return { team: null, members: [], hit: null, roster: [], damage: [], memberships };
  // Le boss est peut-être déjà tombé (encouragement, arrivée d'un 2e membre) : on clôt avant de frapper un boss mort.
  team = await settleTeam(env, team);
  const members = await ctx.store.listRaidMembers(team.id);
  const roster = await loadRoster(ctx, joinedOf(members), { id: env.userId, character: env.character });
  let damage = await ctx.store.listRaidDamage(team.id);
  const hit = await applyHit(env, team, roster, damage);
  if (hit) {
    damage = await ctx.store.listRaidDamage(team.id);
    team = await settleTeam(env, team);
    if (team.outcome === 'victory') hit.victory = true;
  }
  return { team, members, hit, roster, damage, memberships };
}

// ───────────────────────── Vue ─────────────────────────

async function teamView(env: RaidEnv, s: Synced): Promise<RaidTeamView | null> {
  const team = s.team;
  if (!team) return null;
  const { ctx } = env;
  const joined = joinedOf(s.members);
  const encToday = await ctx.store.listRaidEncouragements(team.id, env.today);
  const resolved = !!team.resolvedAt;
  const maxHp = resolved && team.maxHp !== null ? team.maxHp : raidMaxHp(joined.length);
  const damage = resolved && team.totalDamage !== null ? team.totalDamage : sumDamage(s.damage);
  const chaBonus = raidChaBonus(s.roster.filter((r) => r.character).map((r) => r.cha));
  const members: RaidMemberView[] = s.roster
    .filter((r) => r.character)
    .map((r) => {
      const c = r.character!;
      const id = r.record.profileId;
      const mineRows = s.damage.filter((d) => d.profileId === id);
      const today = mineRows.find((d) => d.gameDate === env.today);
      return {
        profileId: id,
        name: c.name,
        classId: c.classId,
        portraitId: c.portraitId,
        frameColor: c.frameColor,
        level: c.level,
        power: r.power,
        isLeader: id === team.leaderId,
        isMe: id === env.userId,
        joinedAt: r.record.joinedAt,
        hitToday: !!today,
        damageToday: today?.damage ?? 0,
        damageWeek: sumDamage(mineRows),
        encouragementsToday: encToday.filter((e) => e.toId === id).length,
        encouragedByMe: encToday.some((e) => e.toId === id && e.fromId === env.userId),
      };
    })
    .sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '') || a.profileId.localeCompare(b.profileId));
  const pendingRecords = s.members.filter((m) => m.status === 'invited');
  const pending = await Promise.all(
    pendingRecords.map(async (m) => ({ profileId: m.profileId, name: (await ctx.store.getCharacter(m.profileId))?.name ?? '' })),
  );
  const reward = rewardOf(team);
  const status: RaidStatus = team.outcome ?? (joined.length < RAID_MIN_MEMBERS ? 'forming' : 'active');
  return {
    id: team.id,
    weekStart: team.weekStart,
    weekEnd: raidWeekEnd(team.weekStart),
    leaderId: team.leaderId,
    status,
    members,
    pending,
    maxHp,
    damage,
    hpLeft: Math.max(0, maxHp - damage),
    ratio: maxHp > 0 ? Math.min(1, damage / maxHp) : 0,
    chaBonus,
    daysLeft: Math.max(0, diffDays(raidWeekEnd(team.weekStart), env.today) + 1),
    victoryDay: team.victoryDay,
    daysToKill: team.victoryDay ? raidDaysToKill(team.weekStart, team.victoryDay) : null,
    reward: reward?.rarity ?? null,
    resolvedAt: team.resolvedAt,
  };
}

async function stateOf(env: RaidEnv, s: Synced): Promise<RaidState> {
  const { ctx } = env;
  const team = await teamView(env, s);
  const invitations: RaidInvitationView[] = [];
  if (!team) {
    for (const inv of s.memberships.filter((m) => m.status === 'invited' && m.weekStart === env.weekStart)) {
      const t = await ctx.store.getRaidTeam(inv.teamId);
      if (!t || t.resolvedAt) continue;
      const [leader, members] = await Promise.all([ctx.store.getCharacter(t.leaderId), ctx.store.listRaidMembers(t.id)]);
      invitations.push({ teamId: t.id, leaderId: t.leaderId, leaderName: leader?.name ?? '', invitedAt: inv.createdAt, members: joinedOf(members).length });
    }
  }
  // Dernier raid clos d'une semaine passée (le plus récent).
  let lastResult: RaidResult | null = null;
  const past = s.memberships.filter((m) => m.status === 'joined' && m.weekStart < env.weekStart).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  for (const m of past) {
    const t = await ctx.store.getRaidTeam(m.teamId);
    if (!t?.resolvedAt || !t.outcome) continue;
    const reward = rewardOf(t);
    lastResult = {
      teamId: t.id,
      weekStart: t.weekStart,
      boss: raidBossFor(t.weekStart),
      outcome: t.outcome,
      maxHp: t.maxHp ?? 0,
      damage: t.totalDamage ?? 0,
      daysToKill: t.victoryDay ? raidDaysToKill(t.weekStart, t.victoryDay) : null,
      reward: reward?.rarity ?? null,
      resolvedAt: t.resolvedAt,
    };
    break;
  }
  return {
    ...emptyRaidState(env.today, true),
    team,
    invitations,
    hit: s.hit,
    lastResult,
  };
}

async function freshState(env: RaidEnv): Promise<RaidState> {
  return stateOf(env, await syncRaid(env));
}

// ───────────────────────── Actions ─────────────────────────

/** État des raids : applique le coup du jour et clôt les raids dus (idempotent). */
export async function getRaidState(ctx: ServerContext, userId: string): Promise<Result<{ state: RaidState }>> {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail('no-character');
  return { ok: true, state: await freshState(env) };
}

/**
 * Coup du jour automatique, appelé par la validation d'une quête : ne casse jamais l'action appelante.
 * Retourne le coup infligé s'il y en a un.
 */
export async function autoRaidHit(ctx: ServerContext, userId: string): Promise<RaidHit | null> {
  try {
    const env = await loadRaidEnv(ctx, userId);
    return env ? (await syncRaid(env)).hit : null;
  } catch (e) {
    console.error('raid auto-hit', e);
    return null;
  }
}

/** Crée l'équipe de la semaine (le créateur en est le chef). */
export async function createRaidTeam(ctx: ServerContext, userId: string): Promise<Result<{ state: RaidState }>> {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail('no-character');
  const team: RaidTeamRecord = { id: ctx.uuid(), weekStart: env.weekStart, leaderId: userId, createdAt: env.nowIso, resolvedAt: null, outcome: null, maxHp: null, totalDamage: null, victoryDay: null };
  const leader: RaidMemberRecord = { teamId: team.id, profileId: userId, weekStart: env.weekStart, status: 'joined', invitedBy: userId, createdAt: env.nowIso, joinedAt: env.nowIso };
  const existing = (await ctx.store.listRaidMemberships(userId, env.weekStart)).find((m) => m.status === 'joined' && m.weekStart === env.weekStart);
  if (existing) return fail('already-active', 'Tu es déjà dans une équipe de raid cette semaine.');
  if (!(await ctx.store.insertRaidTeam(team, leader))) return fail('already-active', 'Tu es déjà dans une équipe de raid cette semaine.');
  await ctx.store.deleteRaidInvites(userId, env.weekStart);
  return { ok: true, state: await freshState(env) };
}

/** Équipe en cours (non close) dont l'appelant est membre joint cette semaine. */
async function myOpenTeam(env: RaidEnv): Promise<RaidTeamRecord | null> {
  const mine = (await env.ctx.store.listRaidMemberships(env.userId, env.weekStart)).find((m) => m.status === 'joined' && m.weekStart === env.weekStart);
  if (!mine) return null;
  const team = await env.ctx.store.getRaidTeam(mine.teamId);
  return team && !team.resolvedAt ? team : null;
}

/** Le chef invite un ami (acceptés uniquement) ; une seule notification par invitation. */
export async function inviteToRaid(ctx: ServerContext, userId: string, input: { profileId: string }): Promise<Result<{ state: RaidState }>> {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail('no-character');
  const team = await myOpenTeam(env);
  if (!team) return fail('no-team', 'Crée d’abord ton équipe de raid.');
  if (team.leaderId !== userId) return fail('forbidden', 'Seul le chef d’équipe peut inviter.');
  const target = input.profileId;
  if (!target || target === userId) return fail('invalid', 'Choisis un ami à inviter.');
  if (!(await ctx.store.areFriends(userId, target))) return fail('not-friends', 'Tu ne peux inviter que tes compagnons.');
  const targetChar = await ctx.store.getCharacter(target);
  if (!targetChar) return fail('not-found', 'Ce compagnon n’a pas encore de héros.');
  const members = await ctx.store.listRaidMembers(team.id);
  // Déjà dans cette équipe (joint ou invité) : rien à faire, sans nouvelle notification.
  if (members.some((m) => m.profileId === target)) return { ok: true, state: await freshState(env) };
  const theirs = await ctx.store.listRaidMemberships(target, env.weekStart);
  if (theirs.some((m) => m.status === 'joined' && m.weekStart === env.weekStart)) return fail('already-active', `${targetChar.name} est déjà dans une équipe cette semaine.`);
  if (members.length >= RAID_MAX_MEMBERS) return fail('team-full', `Une équipe compte ${RAID_MAX_MEMBERS} membres au plus.`);
  const w = await ctx.store.insertRaidMember({ teamId: team.id, profileId: target, weekStart: env.weekStart, status: 'invited', invitedBy: userId, createdAt: env.nowIso, joinedAt: null });
  if (w === 'full') return fail('team-full', `Une équipe compte ${RAID_MAX_MEMBERS} membres au plus.`);
  if (w === 'not-friend') return fail('not-friends', 'Tu ne peux inviter que tes compagnons.');
  if (w === 'conflict') return fail('already-active', `${targetChar.name} est déjà dans une équipe cette semaine.`);
  if (w === 'ok') await safeNotify(ctx, target, 'raid_invite', { from: userId, username: env.character.name, team: team.id, week: raidWeekKey(env.weekStart) });
  return { ok: true, state: await freshState(env) };
}

/** Accepte une invitation de la semaine et rejoint l'équipe (son coup du jour est joué dans la foulée). */
export async function joinRaidTeam(ctx: ServerContext, userId: string, input: { teamId: string }): Promise<Result<{ state: RaidState }>> {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail('no-character');
  const team = input.teamId ? await ctx.store.getRaidTeam(input.teamId) : null;
  if (!team) return fail('not-found', 'Cette équipe n’existe plus.');
  if (team.resolvedAt || team.weekStart !== env.weekStart) return fail('raid-closed', 'Ce raid est terminé.');
  const members = await ctx.store.listRaidMembers(team.id);
  const me = members.find((m) => m.profileId === userId);
  if (me?.status === 'joined') return { ok: true, state: await freshState(env) };
  if (!me) return fail('forbidden', 'Tu n’as pas été invité dans cette équipe.');
  if ((await ctx.store.listRaidMemberships(userId, env.weekStart)).some((m) => m.status === 'joined' && m.weekStart === env.weekStart)) {
    return fail('already-active', 'Tu es déjà dans une équipe de raid cette semaine.');
  }
  if (!(await ctx.store.areFriends(me.invitedBy, userId))) {
    await ctx.store.deleteRaidMember(team.id, userId);
    return fail('not-friends', 'Tu n’es plus compagnon de ce chef d’équipe.');
  }
  if (joinedOf(members).length >= RAID_MAX_MEMBERS) return fail('team-full', `Cette équipe compte déjà ${RAID_MAX_MEMBERS} membres.`);
  const w = await ctx.store.joinRaidMember(team.id, userId, env.nowIso);
  if (w === 'full') return fail('team-full', `Cette équipe compte déjà ${RAID_MAX_MEMBERS} membres.`);
  if (w === 'conflict') return fail('already-active', 'Tu es déjà dans une équipe de raid cette semaine.');
  if (w === 'not-friend') return fail('not-friends', 'Tu n’es plus compagnon de ce chef d’équipe.');
  await ctx.store.deleteRaidInvites(userId, env.weekStart);
  return { ok: true, state: await freshState(env) };
}

/**
 * Quitte l'équipe de la semaine (ses dégâts partent avec lui), ou refuse une invitation (`teamId`). Le chef qui part passe la main
 * au plus ancien membre ; une équipe vide disparaît. Un raid clos ne se quitte plus.
 */
export async function leaveRaidTeam(ctx: ServerContext, userId: string, input: { teamId?: string } = {}): Promise<Result<{ state: RaidState }>> {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail('no-character');
  const mine = (await ctx.store.listRaidMemberships(userId, env.weekStart)).filter((m) => m.weekStart === env.weekStart && (!input.teamId || m.teamId === input.teamId));
  const joined = mine.find((m) => m.status === 'joined');
  const invited = mine.filter((m) => m.status === 'invited');
  if (!joined) {
    if (!invited.length) return fail('no-team', 'Tu n’as ni équipe ni invitation cette semaine.');
    for (const inv of invited) await ctx.store.deleteRaidMember(inv.teamId, userId);
    return { ok: true, state: await freshState(env) };
  }
  const team = await ctx.store.getRaidTeam(joined.teamId);
  if (team?.resolvedAt) return fail('raid-closed', 'Ce raid est terminé.');
  await ctx.store.deleteRaidMember(joined.teamId, userId);
  if (team) {
    const rest = joinedOf(await ctx.store.listRaidMembers(team.id)).sort((a, b) => (a.joinedAt ?? '').localeCompare(b.joinedAt ?? '') || a.profileId.localeCompare(b.profileId));
    if (!rest.length) await ctx.store.deleteRaidTeam(team.id);
    else if (team.leaderId === userId) await ctx.store.setRaidLeader(team.id, rest[0].profileId);
  }
  return { ok: true, state: await freshState(env) };
}

/** Encourage un coéquipier : +5 % de dégâts le jour même (plafond +25 %), un seul encouragement par ami et par jour. */
export async function encourageRaid(ctx: ServerContext, userId: string, input: { profileId: string }): Promise<Result<{ state: RaidState }>> {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail('no-character');
  const team = await myOpenTeam(env);
  if (!team) return fail('no-team', 'Tu n’as pas d’équipe de raid en cours.');
  const target = input.profileId;
  if (!target || target === userId) return fail('invalid', 'Choisis un coéquipier à encourager.');
  const members = joinedOf(await ctx.store.listRaidMembers(team.id));
  if (!members.some((m) => m.profileId === target)) return fail('not-found', 'Ce joueur ne fait pas partie de ton équipe.');
  const inserted = await ctx.store.insertRaidEncouragement({ teamId: team.id, fromId: userId, toId: target, gameDate: env.today, createdAt: env.nowIso });
  if (!inserted) return fail('already-done', 'Tu as déjà encouragé ce compagnon aujourd’hui.');
  // Si le coup du jour est déjà donné, il s'en trouve augmenté ; sinon le bonus s'applique au coup à venir.
  const received = (await ctx.store.listRaidEncouragements(team.id, env.today)).filter((e) => e.toId === target).length;
  const row = (await ctx.store.listRaidDamage(team.id)).find((d) => d.profileId === target && d.gameDate === env.today);
  if (row) await ctx.store.updateRaidDamage(team.id, target, env.today, { encouragements: received, damage: raidDamage(row.baseDamage, received) });
  await safeNotify(ctx, target, 'raid_encouraged', { from: userId, username: env.character.name, team: team.id, week: raidWeekKey(env.weekStart) });
  return { ok: true, state: await freshState(env) };
}
