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
        resetHour: 4, timezone: 'Europe/Paris', dailyQuestCount: 6, hardcore: false,
        autoShare: { level: true, achievement: true, streak: true }, defaultVisibility: 'friends', leaderboardOptIn: true,
        notifPrefs: {}, friendRequestsFrom: 'everyone', theme: 'auto', sounds: true, reducedMotion: false,
        lastRecapWeek: null, lastRecapMonth: null,
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
      },
      { onConflict: 'profile_id' },
    );
    fail(error, 'settings.upsert');
  }

  // ───── Catalogue et préférences
  async listTemplates(userId: string): Promise<any[]> {
    const { data, error } = await this.db
      .from('quest_templates')
      .select('*')
      .eq('is_active', true)
      .or(`source.eq.catalog,owner_id.eq.${userId}`);
    fail(error, 'templates.select');
    return (data ?? []).map((t: any) => ({
      id: t.id, source: t.source, ownerId: t.owner_id, ability: t.ability, difficulty: t.difficulty, periods: t.periods,
      title: t.title, flavor: t.flavor, objective: t.objective, tips: t.tips, validation: t.validation, tags: t.tags, isActive: t.is_active,
      ...(t.theme ? { theme: t.theme } : {}), ...(t.secondary?.length ? { secondary: t.secondary } : {}),
    }));
  }

  async getPreferences(userId: string): Promise<Record<string, any>> {
    const { data, error } = await this.db.from('quest_preferences').select('*').eq('profile_id', userId);
    fail(error, 'prefs.select');
    const out: Record<string, any> = {};
    for (const p of data ?? []) out[p.template_id] = { templateId: p.template_id, isFavorite: p.is_favorite, isExcluded: p.is_excluded, isPinned: p.is_pinned };
    return out;
  }

  // ───── Instances
  private toInstance(r: any): any {
    return {
      id: r.id, templateId: r.template_id, snapshot: r.snapshot, period: r.period, periodStart: r.period_start, periodEnd: r.period_end,
      status: r.status, progress: Number(r.progress), stepsDone: r.steps_done ?? undefined, xpAwarded: r.xp_awarded,
      inspirationUsed: r.inspiration_used, free: r.is_free, run: r.run ?? 1, origin: r.origin ?? 'draw', acceptedAt: r.accepted_at, completedAt: r.completed_at,
    };
  }

  private fromInstance(userId: string, i: any): any {
    return {
      id: i.id, profile_id: userId, template_id: i.templateId, snapshot: i.snapshot, period: i.period, period_start: i.periodStart,
      period_end: i.periodEnd, status: i.status, progress: i.progress, steps_done: i.stepsDone ?? null, xp_awarded: i.xpAwarded,
      inspiration_used: i.inspirationUsed, is_free: !!i.free, run: i.run ?? 1, origin: i.origin ?? 'draw', accepted_at: i.acceptedAt ?? null, completed_at: i.completedAt ?? null,
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
