import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ABILITIES,
  ACHIEVEMENTS,
  CLASSES,
  abilityProgressOf,
  abilityScores,
  addDays,
  completeQuest as engineComplete,
  daysLeft,
  endOfIsoWeek,
  gameDate,
  levelProgress,
  masteriesFor,
  msUntilReset,
  pathAbilityFor,
  pendingImprovements,
  pendingPath,
  periodBounds,
  pickTavernMessage,
  proficiencyBonus,
  startOfIsoWeek,
  startOfMonth,
  tierAt,
  unlocksAt,
  type AbilityId,
  type AbilityUp,
  type AchievementDef,
  type CharacterRecord,
  type Period,
  type QuestInstance,
  type QuestPreference,
  type QuestTemplate,
  type SettingsRecord,
  type TavernMessage,
  type UnlockedAchievement,
} from '@levelup/engine';
import taverne from '@levelup/content/taverne.fr.json';
import { BackendService } from './backend.service';
import { offline, type PendingAction } from './offline';
import type { CommandResult, CompleteRequest, CompleteResponse } from './api/types';

export type Overlay =
  | { kind: 'level-up'; level: number }
  | { kind: 'path' }
  | { kind: 'improvement' }
  | { kind: 'ability-up'; up: AbilityUp }
  | { kind: 'achievement'; achievement: UnlockedAchievement };

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export interface CompleteOutcome {
  ok: boolean;
  error?: string;
  message?: string;
  data?: CompleteResponse;
  provisional?: boolean;
}

const CACHE_KEY = 'snapshot-v1';

@Injectable({ providedIn: 'root' })
export class GameService {
  readonly be = inject(BackendService);

  readonly character = signal<CharacterRecord | null>(null);
  readonly settings = signal<SettingsRecord | null>(null);
  readonly templates = signal<QuestTemplate[]>([]);
  readonly prefs = signal<Record<string, QuestPreference>>({});
  /** Quêtes dont la période couvre aujourd'hui */
  readonly instances = signal<QuestInstance[]>([]);
  /** Quêtes depuis le début du mois (ou de la semaine) pour les bilans */
  readonly recent = signal<QuestInstance[]>([]);
  readonly unlocked = signal<{ achievementId: string; unlockedAt: string }[]>([]);
  readonly restDays = signal<string[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);
  readonly offline = signal(false);
  readonly now = signal(Date.now());
  readonly pendingCount = signal(0);
  readonly provisional = signal<Set<string>>(new Set());
  readonly overlays = signal<Overlay[]>([]);
  readonly toasts = signal<Toast[]>([]);
  /** Dernière validation (écran de récompense du Parchemin) */
  readonly lastCompletion = signal<{ instanceId: string; data: CompleteResponse; provisional: boolean; before: { xp: number; abilityXp: number } } | null>(null);
  private toastId = 0;
  private lastRefresh = 0;
  private syncing = false;

  // ───── dérivés
  readonly tz = computed(() => this.settings()?.timezone ?? 'Europe/Paris');
  readonly today = computed(() => gameDate(this.now(), this.tz(), this.settings()?.resetHour ?? 4));
  readonly level = computed(() => this.character()?.level ?? 1);
  readonly levelInfo = computed(() => levelProgress(this.character()?.totalXp ?? 0));
  readonly tier = computed(() => tierAt(this.level()));
  readonly proficiency = computed(() => proficiencyBonus(this.level()));
  readonly unlocks = computed(() => unlocksAt(this.level()));
  readonly scores = computed(() => (this.character() ? abilityScores(this.character()!) : ({ FOR: 8, DEX: 8, CON: 8, INT: 8, SAG: 8, CHA: 8 } as Record<AbilityId, number>)));
  readonly masteries = computed(() => (this.character() ? masteriesFor(this.character()!) : []));
  readonly pathAbility = computed(() => (this.character() ? pathAbilityFor(this.character()!) : null));
  readonly classDef = computed(() => CLASSES.find((c) => c.id === this.character()?.classId));
  readonly pathDef = computed(() => this.classDef()?.paths.find((p) => p.id === this.character()?.pathId));
  readonly pendingImprovements = computed(() => (this.character() ? pendingImprovements(this.character()!.level, this.character()!.improvementsChosen) : 0));
  readonly pendingPath = computed(() => (this.character() ? pendingPath(this.character()!.level, this.character()!.pathId) : false));
  readonly weakest = computed(() => this.rank(true));
  readonly strongest = computed(() => this.rank(false));
  readonly resetIn = computed(() => msUntilReset(this.now(), this.tz(), this.settings()?.resetHour ?? 4));
  readonly titles = computed(() => ACHIEVEMENTS.filter((a) => a.titleUnlocked && this.unlocked().some((u) => u.achievementId === a.id)).map((a) => a.titleUnlocked as string));
  readonly displayTitle = computed(() => this.character()?.titleEquipped ?? this.tier().name);

  private rank(low: boolean): AbilityId {
    const s = this.scores();
    return [...ABILITIES].sort((a, b) => (low ? s[a] - s[b] : s[b] - s[a]))[0];
  }

  of(period: Period): QuestInstance[] {
    return this.instances().filter((i) => i.period === period);
  }
  readonly dailies = computed(() => this.instances().filter((i) => i.period === 'daily' && !i.free));
  readonly freeDailies = computed(() => this.instances().filter((i) => i.period === 'daily' && i.free));
  readonly dailyDone = computed(() => this.dailies().filter((i) => i.status === 'completed').length);
  readonly dailyOpen = computed(() => this.dailies().filter((i) => i.status === 'accepted'));
  readonly dailyLeft = computed(() => this.dailyOpen().length);

  readonly tavernMessage = computed(() => {
    const c = this.character();
    if (!c) return '';
    const d = new Date(this.now());
    const dailies = this.dailies();
    const hourFmt = Number(new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', hourCycle: 'h23', timeZone: this.tz() }).format(d));
    const date = this.today();
    const [, , dd] = date.split('-').map(Number);
    const wd = new Date(`${date}T12:00:00`).getDay() || 7;
    return pickTavernMessage(taverne as unknown as TavernMessage[], {
      name: c.name,
      streak: c.streakCurrent,
      weakest: this.weakest(),
      strongest: this.strongest(),
      weekday: wd,
      hour: hourFmt,
      dayOfMonth: dd,
      dailyDone: this.dailyDone(),
      dailyTotal: dailies.length || 1,
      level: c.level,
      inspiration: c.inspiration,
      daysAway: 0,
      totalQuests: this.recent().filter((i) => i.status === 'completed').length,
      date,
    });
  });

  /** Progression de la semaine / du mois (quêtes engagées : acceptées, accomplies ou expirées). */
  private engaged(from: string, to: string): { done: number; total: number } {
    const rows = this.recent().filter((i) => i.periodStart >= from && i.periodStart <= to && !(i.free && i.status === 'proposed') && ['accepted', 'completed', 'expired'].includes(i.status));
    return { done: rows.filter((i) => i.status === 'completed').length, total: rows.length };
  }
  readonly weekProgress = computed(() => this.engaged(startOfIsoWeek(this.today()), endOfIsoWeek(this.today())));
  readonly monthProgress = computed(() => this.engaged(startOfMonth(this.today()), addDays(startOfMonth(addDays(startOfMonth(this.today()), 32)), -1)));
  readonly weekDaysLeft = computed(() => daysLeft(endOfIsoWeek(this.today()), this.today()));

  constructor() {
    setInterval(() => this.now.set(Date.now()), 20_000);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void this.onResume();
      });
      window.addEventListener('online', () => void this.onResume());
      window.addEventListener('offline', () => this.offline.set(true));
    }
  }

  private async onResume(): Promise<void> {
    this.now.set(Date.now());
    if (!this.loaded() || !this.be.game.userId()) return;
    if (Date.now() - this.lastRefresh > 90_000) await this.refresh();
    else await this.syncPending();
  }

  // ───────────────────────── Chargement ─────────────────────────

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      await this.refresh(true);
    } finally {
      this.loaded.set(true);
      this.loading.set(false);
    }
  }

  async refresh(first = false): Promise<void> {
    const uid = this.be.game.userId();
    if (!uid) return;
    const store = this.be.game.store;
    try {
      await this.syncPending();
      const character = await store.getCharacter(uid);
      this.character.set(character as CharacterRecord | null);
      if (!character) {
        this.settings.set(null);
        this.instances.set([]);
        this.offline.set(false);
        return;
      }
      await this.be.game.ensure().then((r) => this.handleEnsure(r)).catch(() => undefined);
      const [settings, templates, prefs, unlocked, rest] = await Promise.all([
        store.getSettings(uid),
        store.listTemplates(uid),
        store.getPreferences(uid),
        store.listUnlocked(uid),
        store.listRestDays(uid),
      ]);
      this.settings.set(settings as SettingsRecord);
      const fresh = (await store.getCharacter(uid)) as CharacterRecord;
      this.character.set(fresh ?? character);
      this.templates.set(templates);
      this.prefs.set(prefs);
      this.unlocked.set(unlocked);
      this.restDays.set(rest);
      const today = gameDate(Date.now(), settings.timezone, settings.resetHour);
      const [covering, recent] = await Promise.all([
        store.listInstances(uid, { covers: today }),
        store.listInstances(uid, { from: addDays(startOfMonth(today), -7) }),
      ]);
      this.instances.set(covering);
      this.recent.set(recent);
      this.offline.set(false);
      this.lastRefresh = Date.now();
      this.pendingCount.set((await offline.pending()).length);
      void offline.putCache(CACHE_KEY, {
        character: this.character(), settings, templates, prefs, unlocked, rest, instances: covering, recent,
      });
      if (!first) this.checkPending();
      else this.checkPending();
    } catch (e) {
      // Hors ligne : on retombe sur la dernière copie locale.
      const cached = await offline.getCache<any>(CACHE_KEY);
      if (cached) {
        this.character.set(cached.character);
        this.settings.set(cached.settings);
        this.templates.set(cached.templates);
        this.prefs.set(cached.prefs);
        this.unlocked.set(cached.unlocked);
        this.restDays.set(cached.rest);
        this.instances.set(cached.instances);
        this.recent.set(cached.recent);
        this.offline.set(true);
        this.pendingCount.set((await offline.pending()).length);
      } else if (first) {
        this.offline.set(true);
        throw e;
      }
    }
  }

  private handleEnsure(r: { levelUps: number[] }): void {
    for (const l of r.levelUps ?? []) this.pushOverlay({ kind: 'level-up', level: l });
  }

  /** Amélioration ou voie en attente → écran événementiel. */
  checkPending(): void {
    const c = this.character();
    if (!c) return;
    const has = (k: Overlay['kind']) => this.overlays().some((o) => o.kind === k);
    if (this.pendingPath() && !has('path')) this.pushOverlay({ kind: 'path' });
    else if (this.pendingImprovements() > 0 && !has('improvement') && !this.pendingPath()) this.pushOverlay({ kind: 'improvement' });
  }

  reset(): void {
    this.character.set(null);
    this.settings.set(null);
    this.instances.set([]);
    this.recent.set([]);
    this.unlocked.set([]);
    this.restDays.set([]);
    this.overlays.set([]);
    this.loaded.set(false);
    void offline.clear();
  }

  // ───────────────────────── Aides d'état ─────────────────────────

  private patchInstance(inst: QuestInstance): void {
    const upd = (list: QuestInstance[]) => list.map((i) => (i.id === inst.id ? inst : i));
    this.instances.update(upd);
    this.recent.update(upd);
  }

  instance(id: string): QuestInstance | undefined {
    return this.instances().find((i) => i.id === id) ?? this.recent().find((i) => i.id === id);
  }

  toast(text: string, tone: Toast['tone'] = 'info'): void {
    const t = { id: ++this.toastId, text, tone };
    this.toasts.update((l) => [...l, t]);
    setTimeout(() => this.toasts.update((l) => l.filter((x) => x.id !== t.id)), 3800);
  }

  pushOverlay(o: Overlay): void {
    this.overlays.update((l) => [...l, o]);
  }
  shiftOverlay(): void {
    this.overlays.update((l) => l.slice(1));
    this.checkPending();
  }

  private errorMessage(e: string | undefined, m?: string): string {
    if (m) return m;
    switch (e) {
      case 'network': return 'Pas de connexion : réessaie dans un instant.';
      case 'incomplete': return 'La quête n’est pas encore terminée.';
      case 'journal-too-short': return 'Écris au moins 50 caractères pour valider.';
      case 'no-inspiration': return 'Tu n’as plus d’Inspiration.';
      case 'not-accepted': return 'Cette quête n’est plus disponible.';
      case 'too-late-to-accept': return 'Il est trop tard pour accepter cette quête.';
      case 'no-reroll': return 'Plus de relance gratuite aujourd’hui et aucune Inspiration.';
      case 'cannot-undo': return 'Cette quête ne peut plus être annulée (24 h maximum).';
      default: return 'Quelque chose s’est mal passé. Réessaie.';
    }
  }

  // ───────────────────────── Commandes sur les quêtes ─────────────────────────

  async accept(inst: QuestInstance): Promise<boolean> {
    const r = await this.be.game.accept(inst.id);
    if (r.ok) {
      this.patchInstance(r.instance);
      return true;
    }
    if (r.error === 'network') {
      const next = { ...inst, status: 'accepted' as const, acceptedAt: new Date().toISOString() };
      this.patchInstance(next);
      await offline.enqueue({ kind: 'accept', instanceId: inst.id });
      this.pendingCount.update((n) => n + 1);
      return true;
    }
    this.toast(this.errorMessage(r.error, r.message), 'error');
    return false;
  }

  async abandon(inst: QuestInstance): Promise<boolean> {
    const r = await this.be.game.abandon(inst.id);
    if (r.ok) {
      this.patchInstance(r.instance);
      await this.refreshCharacter();
      return true;
    }
    this.toast(this.errorMessage(r.error, r.message), 'error');
    return false;
  }

  async reroll(inst: QuestInstance): Promise<boolean> {
    const r = await this.be.game.reroll(inst.id);
    if (r.ok) {
      this.instances.update((l) => l.map((i) => (i.id === inst.id ? r.instance : i)));
      this.recent.update((l) => l.map((i) => (i.id === inst.id ? r.instance : i)));
      await this.refreshCharacter();
      this.toast(r.usedInspiration ? 'Quête relancée (1 Inspiration utilisée).' : 'Quête relancée.', 'success');
      return true;
    }
    this.toast(this.errorMessage(r.error, r.message), 'error');
    return false;
  }

  /** « Trop dur » / « trop facile » : la cible de la quête est ajustée et le choix est mémorisé. */
  async tune(inst: QuestInstance, direction: 'easier' | 'harder'): Promise<boolean> {
    const r = await this.be.game.tune(inst.id, direction);
    if (r.ok) {
      this.patchInstance(r.instance);
      this.prefs.update((m) => ({ ...m, [inst.templateId]: { ...(m[inst.templateId] ?? { templateId: inst.templateId }), tune: r.instance.snapshot.tune ?? 0 } }));
      this.toast(direction === 'easier' ? 'Quête allégée. L’XP suit l’effort demandé.' : 'Quête renforcée. L’XP suit l’effort demandé.', 'success');
      return true;
    }
    this.toast(this.errorMessage(r.error, r.message), 'error');
    return false;
  }

  async setProgress(inst: QuestInstance, patch: { progress?: number; stepsDone?: boolean[] }): Promise<void> {
    const next = { ...inst, ...(patch.progress !== undefined ? { progress: Math.max(0, patch.progress) } : {}), ...(patch.stepsDone ? { stepsDone: patch.stepsDone } : {}) };
    this.patchInstance(next);
    const r = await this.be.game.progress(inst.id, patch);
    if (!r.ok && r.error === 'network') {
      await offline.enqueue({ kind: 'progress', instanceId: inst.id, ...patch });
      this.pendingCount.update((n) => n + 1);
    }
  }

  /** Valide une quête. Hors ligne : calcul local « provisoire » puis envoi au retour du réseau (RG-17). */
  async complete(inst: QuestInstance, opts: { progress?: number; stepsDone?: boolean[]; journalText?: string; useInspiration?: boolean; share?: CompleteRequest['share'] }): Promise<CompleteOutcome> {
    const req: CompleteRequest = {
      instanceId: inst.id,
      progress: opts.progress ?? inst.progress,
      stepsDone: opts.stepsDone ?? inst.stepsDone,
      journalText: opts.journalText,
      useInspiration: !!opts.useInspiration,
      share: opts.share,
    };
    const before = { xp: this.character()?.totalXp ?? 0, abilityXp: this.character()?.abilityXp[inst.snapshot.ability] ?? 0 };
    const r = await this.be.game.complete(req);
    if (r.ok) {
      this.applyCompletion(inst, r.data);
      this.lastCompletion.set({ instanceId: inst.id, data: r.data, provisional: false, before });
      return { ok: true, data: r.data };
    }
    if (r.error === 'network' && this.character()) {
      const c = this.character()!;
      const local = engineComplete({
        character: c,
        masteries: this.masteries(),
        pathAbility: this.pathAbility(),
        instance: inst,
        useInspiration: !!opts.useInspiration,
        progress: req.progress,
        stepsDone: req.stepsDone,
        journalText: req.journalText,
      });
      if (!local.ok) return { ok: false, error: local.error, message: this.errorMessage(local.error) };
      const when = new Date().toISOString();
      await offline.enqueue({ kind: 'complete', req: { ...req, clientCompletedAt: when } });
      this.pendingCount.update((n) => n + 1);
      this.patchInstance({ ...inst, status: 'completed', xpAwarded: local.result.xpAwarded, completedAt: when, progress: req.progress ?? inst.progress, inspirationUsed: !!opts.useInspiration });
      this.provisional.update((s) => new Set(s).add(inst.id));
      this.character.set({ ...c, ...local.result.character });
      this.offline.set(true);
      const data: CompleteResponse = {
        xpAwarded: local.result.xpAwarded,
        breakdown: local.result.breakdown,
        duplicate: false,
        character: { ...c, ...local.result.character },
        levelUps: local.result.levelsGained,
        abilityUps: local.result.abilityUps,
        achievements: [],
        pendingImprovements: local.result.pendingImprovements,
        pendingPath: local.result.pendingPath,
        inspirationGained: false,
        inspirationOverflow: false,
        streak: c.streakCurrent,
      };
      this.lastCompletion.set({ instanceId: inst.id, data, provisional: true, before });
      return { ok: true, data, provisional: true };
    }
    return { ok: false, error: r.error, message: this.errorMessage(r.error, r.message) };
  }

  private applyCompletion(inst: QuestInstance, d: CompleteResponse): void {
    this.character.set(d.character);
    this.patchInstance({ ...inst, status: 'completed', xpAwarded: d.xpAwarded, completedAt: new Date().toISOString(), inspirationUsed: d.breakdown.doubled });
    for (const l of d.levelUps) this.pushOverlay({ kind: 'level-up', level: l });
    for (const u of d.abilityUps) this.pushOverlay({ kind: 'ability-up', up: u });
    for (const a of d.achievements) this.pushOverlay({ kind: 'achievement', achievement: a });
    if (d.inspirationGained) this.toast('+1 Inspiration pour ta série de 7 jours !', 'success');
    if (d.inspirationOverflow) this.toast('Ton Inspiration déborde : tu en as déjà 3.', 'info');
    void this.refreshLists();
  }

  async undo(inst: QuestInstance): Promise<boolean> {
    const r = await this.be.game.undo(inst.id);
    if (r.ok) {
      this.character.set(r.character);
      this.patchInstance(r.instance);
      this.toast('Quête annulée. L’XP a été retirée.', 'info');
      await this.refreshLists();
      return true;
    }
    this.toast(this.errorMessage(r.error, r.message), 'error');
    return false;
  }

  /** Recharge les quêtes et la liste des succès après une action serveur. */
  async refreshLists(): Promise<void> {
    const uid = this.be.game.userId();
    const store = this.be.game.store;
    try {
      const today = this.today();
      const [covering, recent, unlocked, rest, character] = await Promise.all([
        store.listInstances(uid, { covers: today }),
        store.listInstances(uid, { from: addDays(startOfMonth(today), -7) }),
        store.listUnlocked(uid),
        store.listRestDays(uid),
        store.getCharacter(uid),
      ]);
      this.instances.set(covering);
      this.recent.set(recent);
      this.unlocked.set(unlocked);
      this.restDays.set(rest);
      if (character) this.character.set(character as CharacterRecord);
    } catch {
      /* hors ligne */
    }
  }

  async refreshCharacter(): Promise<void> {
    try {
      const c = await this.be.game.store.getCharacter(this.be.game.userId());
      if (c) this.character.set(c as CharacterRecord);
    } catch {
      /* hors ligne */
    }
  }

  // ───────────────────────── Choix de personnage ─────────────────────────

  async choosePath(pathId: string): Promise<boolean> {
    const r = await this.be.game.choosePath(pathId);
    if (r.ok) {
      this.character.set(r.character);
      return true;
    }
    this.toast(this.errorMessage(r.error, r.message), 'error');
    return false;
  }

  async chooseImprovement(choice: { plus2: AbilityId } | { plus1: [AbilityId, AbilityId] }): Promise<boolean> {
    const r = await this.be.game.chooseImprovement(choice);
    if (r.ok) {
      this.character.set(r.character);
      return true;
    }
    this.toast(this.errorMessage(r.error, r.message), 'error');
    return false;
  }

  async declareRest(): Promise<boolean> {
    const r = await this.be.game.declareRest();
    if (r.ok) {
      this.toast('Jour de repos déclaré : ta série est protégée.', 'success');
      await this.refreshLists();
      return true;
    }
    this.toast(this.errorMessage(r.error, r.message), 'error');
    return false;
  }

  async equipTitle(title: string | null): Promise<void> {
    const r = await this.be.game.equipTitle(title);
    if (r.ok) this.character.set(r.character);
    else this.toast(this.errorMessage(r.error, r.message), 'error');
  }

  async setPreference(p: QuestPreference): Promise<void> {
    const full = { ...p, tune: p.tune ?? this.prefs()[p.templateId]?.tune ?? 0 };
    await this.be.game.setPreference(full);
    this.prefs.update((m) => ({ ...m, [p.templateId]: full }));
  }

  async saveSettings(patch: Partial<SettingsRecord>): Promise<void> {
    const s = { ...this.settings()!, ...patch };
    this.settings.set(s);
    await this.be.game.saveSettings(s);
  }

  // ───────────────────────── Synchronisation hors ligne ─────────────────────────

  async syncPending(): Promise<void> {
    if (this.syncing) return;
    const rows = await offline.pending();
    this.pendingCount.set(rows.length);
    if (!rows.length) return;
    this.syncing = true;
    try {
      for (const row of rows) {
        const r = await this.replay(row.action);
        if (r === 'network') break; // toujours hors ligne : on réessaiera
        await offline.remove(row.id!);
        if (r !== 'ok') this.toast(r, 'error');
      }
    } finally {
      this.syncing = false;
      this.pendingCount.set((await offline.pending()).length);
      if (this.pendingCount() === 0) this.provisional.set(new Set());
    }
  }

  private async replay(a: PendingAction): Promise<'ok' | 'network' | string> {
    const g = this.be.game;
    let r: CommandResult<any>;
    switch (a.kind) {
      case 'complete':
        r = await g.complete(a.req);
        break;
      case 'progress':
        r = await g.progress(a.instanceId, { progress: a.progress, stepsDone: a.stepsDone });
        break;
      case 'accept':
        r = await g.accept(a.instanceId);
        break;
    }
    if (r.ok) return 'ok';
    if (r.error === 'network') return 'network';
    if (a.kind === 'complete') return `Validation hors ligne refusée : ${this.errorMessage(r.error, r.message)}`;
    return 'ok';
  }
}

export type { AchievementDef };
