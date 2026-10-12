// deno-lint-ignore-file no-explicit-any
// Implémentation de GameStore au-dessus de Supabase : rôle service dans les Edge Functions, jeton utilisateur dans l’app (RLS).
// Les types du client restent volontairement lâches (any) ; le typage strict est porté par GameStore et testé avec MemoryStore.

type Client = any;

const fail = (error: any, ctx: string) => {
  if (error) throw new Error(`${ctx}: ${error.message ?? error}`);
};

/** PostgREST plafonne chaque réponse (max_rows = 1000) : on lit par pages jusqu'à épuisement. */
const PAGE = 1000;
async function pageAll(build: (from: number, to: number) => any, ctx: string): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    fail(error, ctx);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}

/** Écriture de membre : traduit les violations de contraintes de la base (voir 20261013000001_raids.sql). */
function memberWrite(error: any, ctx: string): 'ok' | 'duplicate' | 'full' | 'not-friend' | 'conflict' {
  if (!error) return 'ok';
  const msg = String(error.message ?? '');
  if (/raid_full/.test(msg)) return 'full';
  if (/raid_not_friend/.test(msg)) return 'not-friend';
  if (/one_team_per_week/.test(msg)) return 'conflict';
  if (error.code === '23505' || /duplicate key|unique/i.test(msg)) return 'duplicate';
  if (error.code === '23503') return 'conflict';
  throw new Error(`${ctx}: ${msg}`);
}

const toTeam = (r: any) => ({
  id: r.id, weekStart: r.week_start, leaderId: r.leader_id, createdAt: r.created_at, resolvedAt: r.resolved_at ?? null, outcome: r.outcome ?? null,
  maxHp: r.max_hp ?? null, totalDamage: r.total_damage ?? null, victoryDay: r.victory_day ?? null,
});
const toMember = (r: any) => ({
  teamId: r.team_id, profileId: r.profile_id, weekStart: r.week_start, status: r.status, invitedBy: r.invited_by ?? '', createdAt: r.created_at, joinedAt: r.joined_at ?? null,
});
const fromMember = (m: any) => ({
  team_id: m.teamId, profile_id: m.profileId, week_start: m.weekStart, status: m.status, invited_by: m.invitedBy, created_at: m.createdAt, joined_at: m.joinedAt ?? null,
});

export class SupabaseStore {
  constructor(private db: Client) {}

  // ───── Personnage et réglages
  async getCharacter(userId: string): Promise<any | null> {
    const { data, error } = await this.db.from('characters').select('*').eq('profile_id', userId).maybeSingle();
    fail(error, 'characters.select');
    if (!data) return null;
    const { data: s } = await this.db.from('settings').select('oath').eq('profile_id', userId).maybeSingle();
    return {
      id: data.id,
      profileId: data.profile_id,
      name: data.name,
      classId: data.class_id,
      pathId: data.path_id,
      portraitId: data.portrait_id,
      frameColor: data.frame_color,
      motto: data.motto,
      oath: s?.oath ?? '',
      titleEquipped: data.title_equipped,
      classNotice: data.class_notice ?? false,
      classChanged: data.class_changed ?? false,
      baseScores: data.base_scores,
      improvements: data.improvements,
      improvementsChosen: data.improvements_chosen,
      totalXp: data.total_xp,
      abilityXp: data.ability_xp,
      level: data.level,
      streakCurrent: data.streak_current,
      streakBest: data.streak_best,
      inspiration: data.inspiration,
      rerollsDate: data.rerolls_date,
      rerollsUsed: data.rerolls_used,
      createdAt: data.created_at,
      gold: data.gold ?? 0,
      fragments: data.fragments ?? 0,
      keys: data.keys ?? 0,
      chestPity: data.chest_pity ?? {},
      expeditionStartedAt: data.expedition_started_at ?? null,
      chestOpensDate: data.chest_opens_date ?? null,
      chestOpensToday: data.chest_opens_today ?? 0,
      power: data.power ?? 0,
      frameStyle: data.frame_style ?? null,
    };
  }

  async saveCharacter(userId: string, c: any): Promise<void> {
    const { error } = await this.db.from('characters').upsert(
      {
        id: c.id,
        profile_id: userId,
        name: c.name,
        class_id: c.classId,
        path_id: c.pathId ?? null,
        portrait_id: c.portraitId,
        frame_color: c.frameColor,
        motto: c.motto,
        title_equipped: c.titleEquipped ?? null,
        class_notice: c.classNotice ?? false,
        class_changed: c.classChanged ?? false,
        base_scores: c.baseScores,
        improvements: c.improvements,
        improvements_chosen: c.improvementsChosen,
        total_xp: c.totalXp,
        ability_xp: c.abilityXp,
        level: c.level,
        streak_current: c.streakCurrent,
        streak_best: c.streakBest,
        inspiration: c.inspiration,
        rerolls_date: c.rerollsDate ?? null,
        rerolls_used: c.rerollsUsed,
        gold: c.gold ?? 0,
        fragments: c.fragments ?? 0,
        keys: c.keys ?? 0,
        chest_pity: c.chestPity ?? {},
        expedition_started_at: c.expeditionStartedAt ?? null,
        chest_opens_date: c.chestOpensDate ?? null,
        chest_opens_today: c.chestOpensToday ?? 0,
        power: c.power ?? 0,
        frame_style: c.frameStyle ?? null,
      },
      { onConflict: 'profile_id' },
    );
    fail(error, 'characters.upsert');
    if (typeof c.oath === 'string') {
      const { error: e2 } = await this.db.from('settings').update({ oath: c.oath }).eq('profile_id', userId);
      fail(e2, 'settings.oath');
    }
  }

  async getSettings(userId: string): Promise<any> {
    const { data, error } = await this.db.from('settings').select('*').eq('profile_id', userId).maybeSingle();
    fail(error, 'settings.select');
    if (!data) {
      return {
        resetHour: 4, timezone: 'Europe/Paris', dailyQuestCount: 2, hardcore: false,
        autoShare: { level: true, achievement: true, streak: true }, defaultVisibility: 'friends', leaderboardOptIn: true,
        notifPrefs: {}, friendRequestsFrom: 'everyone', theme: 'auto', sounds: true, reducedMotion: false,
        lastRecapWeek: null, lastRecapMonth: null, interests: [],
      };
    }
    return {
      resetHour: data.reset_hour,
      timezone: data.timezone,
      dailyQuestCount: data.daily_quest_count,
      hardcore: data.hardcore,
      autoShare: data.auto_share,
      defaultVisibility: data.default_visibility,
      leaderboardOptIn: data.leaderboard_opt_in,
      notifPrefs: data.notif_prefs,
      friendRequestsFrom: data.friend_requests_from,
      theme: data.theme,
      sounds: data.sounds,
      reducedMotion: data.reduced_motion,
      lastRecapWeek: data.last_recap_week,
      lastRecapMonth: data.last_recap_month,
      interests: data.interests ?? [],
    };
  }

  async saveSettings(userId: string, s: any): Promise<void> {
    const { error } = await this.db.from('settings').upsert(
      {
        profile_id: userId,
        reset_hour: s.resetHour,
        timezone: s.timezone,
        daily_quest_count: s.dailyQuestCount,
        hardcore: s.hardcore,
        auto_share: s.autoShare,
        default_visibility: s.defaultVisibility,
        leaderboard_opt_in: s.leaderboardOptIn,
        notif_prefs: s.notifPrefs,
        friend_requests_from: s.friendRequestsFrom,
        theme: s.theme,
        sounds: s.sounds,
        reduced_motion: s.reducedMotion,
        last_recap_week: s.lastRecapWeek ?? null,
        last_recap_month: s.lastRecapMonth ?? null,
        interests: s.interests ?? [],
      },
      { onConflict: 'profile_id' },
    );
    fail(error, 'settings.upsert');
  }

  // ───── Catalogue et préférences
  async listTemplates(userId: string, opts: { withRungs?: boolean } = {}): Promise<any[]> {
    // Catalogue + gabarits d'échelon des parcours : plus de 1000 lignes, donc lecture paginée (ordre stable sur l'id).
    // `withRungs: false` écarte les gabarits d'échelon côté base (track_id nul).
    const rows = await pageAll((a, b) => {
      let q = this.db.from('quest_templates').select('*').eq('is_active', true).or(`source.eq.catalog,owner_id.eq.${userId}`);
      if (opts.withRungs === false) q = q.is('track_id', null);
      return q.order('id', { ascending: true }).range(a, b);
    }, 'templates.select');
    return rows.map((t: any) => ({
      id: t.id, source: t.source, ownerId: t.owner_id, ability: t.ability, difficulty: t.difficulty, periods: t.periods,
      title: t.title, flavor: t.flavor, objective: t.objective, tips: t.tips, validation: t.validation, tags: t.tags, isActive: t.is_active,
      ...(t.theme ? { theme: t.theme } : {}), ...(t.secondary?.length ? { secondary: t.secondary } : {}),
      ...(t.track_id ? { trackId: t.track_id, rung: t.rung ?? null } : {}),
    }));
  }

  async getPreferences(userId: string): Promise<Record<string, any>> {
    const { data, error } = await this.db.from('quest_preferences').select('*').eq('profile_id', userId);
    fail(error, 'prefs.select');
    const out: Record<string, any> = {};
    for (const p of data ?? []) out[p.template_id] = { templateId: p.template_id, isFavorite: p.is_favorite, isExcluded: p.is_excluded, isPinned: p.is_pinned, tune: p.tune ?? 0 };
    return out;
  }

  async savePreference(userId: string, p: any): Promise<void> {
    const { error } = await this.db.from('quest_preferences').upsert({
      profile_id: userId,
      template_id: p.templateId,
      is_favorite: !!p.isFavorite,
      is_excluded: !!p.isExcluded,
      is_pinned: !!p.isPinned,
      tune: p.tune ?? 0,
    }, { onConflict: 'profile_id,template_id' });
    fail(error, 'prefs.upsert');
  }

  // ───── Instances
  private toInstance(r: any): any {
    return {
      id: r.id, templateId: r.template_id, snapshot: r.snapshot, period: r.period, periodStart: r.period_start, periodEnd: r.period_end,
      status: r.status, progress: Number(r.progress), stepsDone: r.steps_done ?? undefined, xpAwarded: r.xp_awarded,
      inspirationUsed: r.inspiration_used, free: r.is_free, run: r.run ?? 1, origin: r.origin ?? 'draw', acceptedAt: r.accepted_at, completedAt: r.completed_at,
      ...(r.track_id ? { trackId: r.track_id, rung: r.rung ?? null } : {}),
    };
  }

  private fromInstance(userId: string, i: any): any {
    return {
      id: i.id, profile_id: userId, template_id: i.templateId, snapshot: i.snapshot, period: i.period, period_start: i.periodStart,
      period_end: i.periodEnd, status: i.status, progress: i.progress, steps_done: i.stepsDone ?? null, xp_awarded: i.xpAwarded,
      inspiration_used: i.inspirationUsed, is_free: !!i.free, run: i.run ?? 1, origin: i.origin ?? 'draw', accepted_at: i.acceptedAt ?? null, completed_at: i.completedAt ?? null,
      track_id: i.trackId ?? null, rung: i.rung ?? null,
    };
  }

  async listInstances(userId: string, f: any = {}): Promise<any[]> {
    let q = this.db.from('quest_instances').select('*').eq('profile_id', userId);
    if (f.period) q = q.eq('period', f.period);
    if (f.status) q = Array.isArray(f.status) ? q.in('status', f.status) : q.eq('status', f.status);
    if (f.from) q = q.gte('period_start', f.from);
    if (f.to) q = q.lte('period_start', f.to);
    if (f.covers) q = q.lte('period_start', f.covers).gte('period_end', f.covers);
    const rows = await pageAll((a, b) => q.order('period_start', { ascending: true }).order('id', { ascending: true }).range(a, b), 'instances.select');
    return rows.map((r: any) => this.toInstance(r));
  }

  async getInstance(userId: string, id: string): Promise<any | null> {
    const { data, error } = await this.db.from('quest_instances').select('*').eq('profile_id', userId).eq('id', id).maybeSingle();
    fail(error, 'instances.get');
    return data ? this.toInstance(data) : null;
  }

  async insertInstances(userId: string, instances: any[]): Promise<void> {
    if (!instances.length) return;
    const { error } = await this.db
      .from('quest_instances')
      .upsert(instances.map((i) => this.fromInstance(userId, i)), { onConflict: 'profile_id,template_id,period,period_start,run', ignoreDuplicates: true });
    fail(error, 'instances.insert');
  }

  async updateInstance(userId: string, id: string, patch: any): Promise<void> {
    const row: any = {};
    if ('status' in patch) row.status = patch.status;
    if ('progress' in patch) row.progress = patch.progress;
    if ('stepsDone' in patch) row.steps_done = patch.stepsDone ?? null;
    if ('xpAwarded' in patch) row.xp_awarded = patch.xpAwarded;
    if ('inspirationUsed' in patch) row.inspiration_used = patch.inspirationUsed;
    if ('acceptedAt' in patch) row.accepted_at = patch.acceptedAt ?? null;
    if ('completedAt' in patch) row.completed_at = patch.completedAt ?? null;
    if ('snapshot' in patch) row.snapshot = patch.snapshot;
    const { error } = await this.db.from('quest_instances').update(row).eq('profile_id', userId).eq('id', id);
    fail(error, 'instances.update');
  }

  async deleteInstance(userId: string, id: string): Promise<void> {
    const { error } = await this.db.from('quest_instances').delete().eq('profile_id', userId).eq('id', id);
    fail(error, 'instances.delete');
  }

  // ───── Parcours de discipline
  async listTracks(userId: string): Promise<any[]> {
    const { data, error } = await this.db.from('tracks').select('*').eq('profile_id', userId).order('track_id', { ascending: true });
    fail(error, 'tracks.select');
    return (data ?? []).map((r: any) => ({
      trackId: r.track_id, status: r.status, rung: r.rung, hits: r.hits, lastDoneDate: r.last_done_date ?? null,
      lastCheckedDate: r.last_checked_date ?? null, bestRung: r.best_rung, startedAt: r.started_at,
    }));
  }

  async saveTrack(userId: string, t: any): Promise<void> {
    const { error } = await this.db.from('tracks').upsert(
      {
        profile_id: userId, track_id: t.trackId, status: t.status, rung: t.rung, hits: t.hits, last_done_date: t.lastDoneDate ?? null,
        last_checked_date: t.lastCheckedDate ?? null, best_rung: t.bestRung, started_at: t.startedAt,
      },
      { onConflict: 'profile_id,track_id' },
    );
    fail(error, 'tracks.upsert');
  }

  async deleteTrack(userId: string, trackId: string): Promise<void> {
    const { error } = await this.db.from('tracks').delete().eq('profile_id', userId).eq('track_id', trackId);
    fail(error, 'tracks.delete');
  }

  // ───── Aventure : équipement, coffres, donjons
  async listItems(userId: string): Promise<any[]> {
    const rows = await pageAll((a, b) => this.db.from('inventory_items').select('*').eq('profile_id', userId).order('created_at', { ascending: true }).order('id', { ascending: true }).range(a, b), 'items.select');
    return rows.map((r: any) => ({
      id: r.id, templateId: r.template_id, rarity: r.rarity, slot: r.slot, ability: r.ability, level: r.level, equipped: r.equipped, createdAt: r.created_at,
    }));
  }

  async insertItems(userId: string, items: any[]): Promise<void> {
    if (!items.length) return;
    const { error } = await this.db.from('inventory_items').insert(
      items.map((i) => ({
        id: i.id, profile_id: userId, template_id: i.templateId, rarity: i.rarity, slot: i.slot, ability: i.ability, level: i.level ?? 0,
        equipped: !!i.equipped, created_at: i.createdAt,
      })),
    );
    fail(error, 'items.insert');
  }

  async updateItem(userId: string, id: string, patch: any): Promise<void> {
    const row: any = {};
    if ('level' in patch) row.level = patch.level;
    if ('equipped' in patch) row.equipped = !!patch.equipped;
    if (!Object.keys(row).length) return;
    const { error } = await this.db.from('inventory_items').update(row).eq('profile_id', userId).eq('id', id);
    fail(error, 'items.update');
  }

  async deleteItems(userId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const { error } = await this.db.from('inventory_items').delete().eq('profile_id', userId).in('id', ids);
    fail(error, 'items.delete');
  }

  async listChests(userId: string, filter: { opened?: boolean } = {}): Promise<any[]> {
    let q = this.db.from('chests').select('*').eq('profile_id', userId);
    if (filter.opened === true) q = q.not('opened_at', 'is', null);
    if (filter.opened === false) q = q.is('opened_at', null);
    const rows = await pageAll((a, b) => q.order('created_at', { ascending: true }).order('id', { ascending: true }).range(a, b), 'chests.select');
    return rows.map((r: any) => ({
      id: r.id, rarity: r.rarity, source: r.source, sourceKey: r.source_key, instanceId: r.instance_id ?? null, createdAt: r.created_at, openedAt: r.opened_at ?? null,
    }));
  }

  async insertChest(userId: string, c: any): Promise<boolean> {
    const { error } = await this.db.from('chests').insert({
      id: c.id, profile_id: userId, rarity: c.rarity, source: c.source, source_key: c.sourceKey, instance_id: c.instanceId ?? null,
      created_at: c.createdAt, opened_at: c.openedAt ?? null,
    });
    // 23505 : (profil, source, clé) existe déjà, le coffre a déjà été attribué.
    if (error && (error.code === '23505' || /duplicate key|unique/i.test(error.message ?? ''))) return false;
    fail(error, 'chests.insert');
    return true;
  }

  async markChestOpened(userId: string, id: string, at: string): Promise<boolean> {
    const { data, error } = await this.db.from('chests').update({ opened_at: at }).eq('profile_id', userId).eq('id', id).is('opened_at', null).select('id');
    fail(error, 'chests.open');
    return (data?.length ?? 0) > 0;
  }

  async deleteChests(userId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    const { error } = await this.db.from('chests').delete().eq('profile_id', userId).in('id', ids);
    fail(error, 'chests.delete');
  }

  async listDungeonProgress(userId: string): Promise<any[]> {
    const { data, error } = await this.db.from('dungeon_progress').select('*').eq('profile_id', userId).order('dungeon_id', { ascending: true });
    fail(error, 'dungeon_progress.select');
    return (data ?? []).map((r: any) => ({ dungeonId: r.dungeon_id, bestRoom: r.best_room, bossDefeatedTier: r.boss_defeated_tier, lastRunDate: r.last_run_date ?? null }));
  }

  async saveDungeonProgress(userId: string, p: any): Promise<void> {
    const { error } = await this.db.from('dungeon_progress').upsert(
      { profile_id: userId, dungeon_id: p.dungeonId, best_room: p.bestRoom, boss_defeated_tier: p.bossDefeatedTier, last_run_date: p.lastRunDate ?? null },
      { onConflict: 'profile_id,dungeon_id' },
    );
    fail(error, 'dungeon_progress.upsert');
  }

  async listSpells(userId: string): Promise<any[]> {
    const { data, error } = await this.db.from('spells_known').select('*').eq('profile_id', userId).order('spell_id', { ascending: true });
    fail(error, 'spells_known.select');
    return (data ?? []).map((r: any) => ({ spellId: r.spell_id, level: r.level, equippedSlot: r.equipped_slot ?? null }));
  }

  async saveSpell(userId: string, spell: any): Promise<void> {
    const { error } = await this.db.from('spells_known').upsert(
      { profile_id: userId, spell_id: spell.spellId, level: spell.level, equipped_slot: spell.equippedSlot ?? null },
      { onConflict: 'profile_id,spell_id' },
    );
    fail(error, 'spells_known.upsert');
  }

  async listCards(userId: string): Promise<any[]> {
    const { data, error } = await this.db.from('cards_owned').select('*').eq('profile_id', userId).order('card_id', { ascending: true });
    fail(error, 'cards_owned.select');
    return (data ?? []).map((r: any) => ({ cardId: r.card_id, copies: r.copies }));
  }

  async saveCard(userId: string, card: any): Promise<void> {
    const { error } = await this.db.from('cards_owned').upsert(
      { profile_id: userId, card_id: card.cardId, copies: card.copies },
      { onConflict: 'profile_id,card_id' },
    );
    fail(error, 'cards_owned.upsert');
  }

  // ───── Raids d'amis
  async areFriends(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const { data, error } = await this.db.rpc('can_view_owner', { viewer: a, owner: b });
    fail(error, 'can_view_owner');
    return data === true;
  }

  async getRaidTeam(teamId: string): Promise<any | null> {
    const { data, error } = await this.db.from('raid_teams').select('*').eq('id', teamId).maybeSingle();
    fail(error, 'raid_teams.select');
    return data ? toTeam(data) : null;
  }

  async listRaidMemberships(userId: string, since: string): Promise<any[]> {
    const { data, error } = await this.db.from('raid_members').select('*').eq('profile_id', userId).gte('week_start', since).order('week_start', { ascending: true }).order('team_id', { ascending: true });
    fail(error, 'raid_members.select');
    return (data ?? []).map(toMember);
  }

  async listRaidMembers(teamId: string): Promise<any[]> {
    const { data, error } = await this.db.from('raid_members').select('*').eq('team_id', teamId).order('created_at', { ascending: true }).order('profile_id', { ascending: true });
    fail(error, 'raid_members.list');
    return (data ?? []).map(toMember);
  }

  async insertRaidTeam(team: any, leader: any): Promise<boolean> {
    const { error } = await this.db.from('raid_teams').insert({ id: team.id, week_start: team.weekStart, leader_id: team.leaderId, created_at: team.createdAt });
    fail(error, 'raid_teams.insert');
    const r = memberWrite((await this.db.from('raid_members').insert(fromMember(leader))).error, 'raid_members.insert');
    if (r === 'ok') return true;
    await this.db.from('raid_teams').delete().eq('id', team.id);
    if (r === 'conflict' || r === 'duplicate') return false;
    throw new Error(`raid_members.insert: ${r}`);
  }

  async insertRaidMember(m: any): Promise<'ok' | 'duplicate' | 'full' | 'not-friend' | 'conflict'> {
    return memberWrite((await this.db.from('raid_members').insert(fromMember(m))).error, 'raid_members.insert');
  }

  async joinRaidMember(teamId: string, profileId: string, at: string): Promise<'ok' | 'duplicate' | 'full' | 'not-friend' | 'conflict'> {
    const { data, error } = await this.db.from('raid_members').update({ status: 'joined', joined_at: at }).eq('team_id', teamId).eq('profile_id', profileId).eq('status', 'invited').select('profile_id');
    const r = memberWrite(error, 'raid_members.join');
    if (r !== 'ok') return r;
    return (data?.length ?? 0) > 0 ? 'ok' : 'conflict';
  }

  async deleteRaidMember(teamId: string, profileId: string): Promise<void> {
    // Les dégâts et les encouragements du membre partent avec lui (clés étrangères en cascade).
    const { error } = await this.db.from('raid_members').delete().eq('team_id', teamId).eq('profile_id', profileId);
    fail(error, 'raid_members.delete');
  }

  async deleteRaidInvites(profileId: string, weekStart: string): Promise<void> {
    const { error } = await this.db.from('raid_members').delete().eq('profile_id', profileId).eq('week_start', weekStart).eq('status', 'invited');
    fail(error, 'raid_members.invites');
  }

  async setRaidLeader(teamId: string, leaderId: string): Promise<void> {
    const { error } = await this.db.from('raid_teams').update({ leader_id: leaderId }).eq('id', teamId);
    fail(error, 'raid_teams.leader');
  }

  async deleteRaidTeam(teamId: string): Promise<void> {
    const { error } = await this.db.from('raid_teams').delete().eq('id', teamId);
    fail(error, 'raid_teams.delete');
  }

  async resolveRaidTeam(teamId: string, r: any): Promise<boolean> {
    const { data, error } = await this.db
      .from('raid_teams')
      .update({ resolved_at: r.at, outcome: r.outcome, max_hp: r.maxHp, total_damage: r.totalDamage, victory_day: r.victoryDay })
      .eq('id', teamId)
      .is('resolved_at', null)
      .select('id');
    fail(error, 'raid_teams.resolve');
    return (data?.length ?? 0) > 0;
  }

  async listRaidDamage(teamId: string): Promise<any[]> {
    const { data, error } = await this.db.from('raid_damage').select('*').eq('team_id', teamId).order('game_date', { ascending: true }).order('profile_id', { ascending: true });
    fail(error, 'raid_damage.select');
    return (data ?? []).map((r: any) => ({
      teamId: r.team_id, profileId: r.profile_id, gameDate: r.game_date, damage: r.damage, baseDamage: r.base_damage, encouragements: r.encouragements,
    }));
  }

  async insertRaidDamage(d: any): Promise<boolean> {
    const { error } = await this.db.from('raid_damage').insert({
      team_id: d.teamId, profile_id: d.profileId, game_date: d.gameDate, damage: d.damage, base_damage: d.baseDamage, encouragements: d.encouragements,
    });
    if (error && (error.code === '23505' || /duplicate key|unique/i.test(error.message ?? ''))) return false;
    fail(error, 'raid_damage.insert');
    return true;
  }

  async updateRaidDamage(teamId: string, profileId: string, gameDate: string, patch: any): Promise<void> {
    const { error } = await this.db.from('raid_damage').update({ damage: patch.damage, encouragements: patch.encouragements }).eq('team_id', teamId).eq('profile_id', profileId).eq('game_date', gameDate);
    fail(error, 'raid_damage.update');
  }

  async listRaidEncouragements(teamId: string, gameDate: string): Promise<any[]> {
    const { data, error } = await this.db.from('raid_encouragements').select('*').eq('team_id', teamId).eq('game_date', gameDate);
    fail(error, 'raid_encouragements.select');
    return (data ?? []).map((r: any) => ({ teamId: r.team_id, fromId: r.from_id, toId: r.to_id, gameDate: r.game_date, createdAt: r.created_at }));
  }

  async insertRaidEncouragement(e: any): Promise<boolean> {
    const { error } = await this.db.from('raid_encouragements').insert({ team_id: e.teamId, from_id: e.fromId, to_id: e.toId, game_date: e.gameDate, created_at: e.createdAt });
    if (error && (error.code === '23505' || /duplicate key|unique/i.test(error.message ?? ''))) return false;
    fail(error, 'raid_encouragements.insert');
    return true;
  }

  async notify(userId: string, type: string, payload: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.rpc('notify_user', { p_to: userId, p_type: type, p_payload: payload });
    fail(error, 'notify_user');
  }

  // ───── Saisons
  async upsertSeasonScore(userId: string, seasonKey: string, power: number, day: string): Promise<void> {
    const { error } = await this.db.rpc('record_season_power', { p_profile: userId, p_season: seasonKey, p_power: power, p_day: day });
    fail(error, 'record_season_power');
  }

  async listSeasonScores(userId: string): Promise<any[]> {
    const { data, error } = await this.db.from('season_scores').select('*').eq('profile_id', userId).order('season_key', { ascending: true });
    fail(error, 'season_scores.select');
    return (data ?? []).map((r: any) => ({ seasonKey: r.season_key, power: r.power, firstDay: r.first_day, lastDay: r.last_day }));
  }

  async seasonRanking(userId: string, seasonKey: string): Promise<any[]> {
    const { data, error } = await this.db.rpc('season_ranking', { p_viewer: userId, p_season: seasonKey });
    fail(error, 'season_ranking');
    return ((data ?? []) as any[]).map((r) => ({ profileId: r.profile_id, power: Number(r.power) }));
  }

  async listSeasonResults(userId: string): Promise<any[]> {
    const { data, error } = await this.db.from('season_results').select('*').eq('profile_id', userId).order('season_key', { ascending: true });
    fail(error, 'season_results.select');
    return (data ?? []).map((r: any) => ({
      seasonKey: r.season_key, rank: r.rank ?? null, participants: r.participants, power: r.power, frame: r.frame ?? null, createdAt: r.created_at,
    }));
  }

  async insertSeasonResult(userId: string, r: any): Promise<boolean> {
    const { error } = await this.db.from('season_results').insert({
      profile_id: userId, season_key: r.seasonKey, rank: r.rank ?? null, participants: r.participants, power: r.power, frame: r.frame ?? null, created_at: r.createdAt,
    });
    // 23505 : le résultat de cette saison existe déjà (un autre appel l'a écrit avant).
    if (error && (error.code === '23505' || /duplicate key|unique/i.test(error.message ?? ''))) return false;
    fail(error, 'season_results.insert');
    return true;
  }

  // ───── Registre d'XP
  async insertXpEvents(userId: string, events: any[]): Promise<void> {
    if (!events.length) return;
    const { error } = await this.db.from('xp_events').insert(
      events.map((e) => ({
        id: e.id, profile_id: userId, instance_id: e.instanceId, ability: e.ability, amount: e.amount, reason: e.reason,
        is_custom: !!e.custom, game_date: e.gameDate, created_at: e.createdAt,
      })),
    );
    fail(error, 'xp_events.insert');
  }

  async listXpEvents(userId: string, since?: string): Promise<any[]> {
    let q = this.db.from('xp_events').select('*').eq('profile_id', userId);
    if (since) q = q.gte('game_date', since);
    const rows = await pageAll((a, b) => q.order('created_at', { ascending: true }).order('id', { ascending: true }).range(a, b), 'xp_events.select');
    return rows.map((e: any) => ({
      id: e.id, instanceId: e.instance_id, ability: e.ability, amount: e.amount, reason: e.reason, custom: e.is_custom,
      createdAt: e.created_at, gameDate: e.game_date,
    }));
  }

  // ───── Trophées, repos, journal
  async listUnlocked(userId: string): Promise<any[]> {
    const { data, error } = await this.db.from('unlocked_achievements').select('*').eq('profile_id', userId);
    fail(error, 'unlocked.select');
    return (data ?? []).map((u: any) => ({ achievementId: u.achievement_id, unlockedAt: u.unlocked_at }));
  }

  async unlockAchievement(userId: string, achievementId: string, at: string): Promise<void> {
    const { error } = await this.db
      .from('unlocked_achievements')
      .upsert({ profile_id: userId, achievement_id: achievementId, unlocked_at: at }, { onConflict: 'profile_id,achievement_id', ignoreDuplicates: true });
    fail(error, 'unlocked.insert');
  }

  async listRestDays(userId: string): Promise<string[]> {
    const { data, error } = await this.db.from('rest_days').select('day').eq('profile_id', userId);
    fail(error, 'rest_days.select');
    return (data ?? []).map((r: any) => r.day);
  }

  async addRestDay(userId: string, day: string): Promise<void> {
    const { error } = await this.db.from('rest_days').upsert({ profile_id: userId, day }, { onConflict: 'profile_id,day', ignoreDuplicates: true });
    fail(error, 'rest_days.insert');
  }

  async saveJournal(userId: string, e: any): Promise<void> {
    const { error } = await this.db.from('journal_entries').insert({ id: e.id, profile_id: userId, instance_id: e.instanceId, text: e.text, created_at: e.createdAt });
    fail(error, 'journal.insert');
  }

  async countJournal(userId: string): Promise<number> {
    const { count, error } = await this.db.from('journal_entries').select('id', { count: 'exact', head: true }).eq('profile_id', userId);
    fail(error, 'journal.count');
    return count ?? 0;
  }

  async listJournal(userId: string): Promise<any[]> {
    const rows = await pageAll((a, b) => this.db.from('journal_entries').select('*').eq('profile_id', userId).order('created_at', { ascending: false }).order('id').range(a, b), 'journal.select');
    return rows.map((e: any) => ({ id: e.id, instanceId: e.instance_id, text: e.text, createdAt: e.created_at }));
  }

  // ───── Publications
  async createPost(userId: string, d: any): Promise<string> {
    const { data, error } = await this.db
      .from('posts')
      .insert({
        author_id: userId, type: d.type, instance_id: d.instanceId ?? null, text: d.text ?? '', visibility: d.visibility, payload: d.payload ?? {},
      })
      .select('id')
      .single();
    fail(error, 'posts.insert');
    if (d.mediaPaths?.length) {
      const { error: e2 } = await this.db
        .from('post_media')
        .insert(d.mediaPaths.slice(0, 4).map((p: string, i: number) => ({ post_id: data.id, storage_path: p, position: i })));
      fail(e2, 'post_media.insert');
    }
    return data.id;
  }

  async detachPostsFromInstance(userId: string, instanceId: string): Promise<void> {
    const { data } = await this.db.from('posts').select('id,payload').eq('author_id', userId).eq('instance_id', instanceId);
    for (const p of data ?? []) {
      const payload = { ...(p.payload ?? {}), questDetached: true };
      delete (payload as any).xp;
      const { error } = await this.db.from('posts').update({ instance_id: null, payload }).eq('id', p.id);
      fail(error, 'posts.detach');
    }
  }

  async socialCounts(userId: string): Promise<{ posts: number; friends: number; reactionsGiven: number }> {
    const [posts, friends, reactions] = await Promise.all([
      this.db.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId).in('type', ['quest', 'photo']).is('deleted_at', null),
      this.db.from('friendships').select('id', { count: 'exact', head: true }).eq('status', 'accepted').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
      this.db.from('reactions').select('post_id', { count: 'exact', head: true }).eq('profile_id', userId),
    ]);
    return { posts: posts.count ?? 0, friends: friends.count ?? 0, reactionsGiven: reactions.count ?? 0 };
  }
}
