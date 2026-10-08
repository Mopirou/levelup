import { Injectable, computed, inject, signal } from '@angular/core';
import {
  ABILITIES,
  ACHIEVEMENTS,
  LEVEL_XP,
  abilityProgress,
  addDays,
  buildRecap,
  diffDays,
  emptyAbilityRecord,
  endOfIsoWeek,
  endOfMonth,
  gameDate,
  isoWeek,
  levelFromXp,
  startOfIsoWeek,
  startOfMonth,
  type AbilityId,
  type JournalEntry,
  type QuestInstance,
  type Recap,
  type RecapTemplates,
  type XpEvent,
} from '@levelup/engine';
import recapTemplates from '@levelup/content/recap-templates.fr.json';
import { BackendService } from './backend.service';
import { GameService } from './game.service';

export type DayEntry =
  | { kind: 'quest'; at: string; inst: QuestInstance; note?: string }
  | { kind: 'level'; at: string; level: number }
  | { kind: 'trophy'; at: string; id: string; name: string }
  | { kind: 'streak'; at: string; days: number };

export interface DayGroup {
  date: string;
  entries: DayEntry[];
  rest: boolean;
  xp: number;
}

/** Historique et statistiques : tout est recalculé à partir du registre d'XP et des quêtes. */
@Injectable({ providedIn: 'root' })
export class StatsService {
  private be = inject(BackendService);
  private game = inject(GameService);

  readonly history = signal<QuestInstance[]>([]);
  readonly events = signal<XpEvent[]>([]);
  readonly journal = signal<JournalEntry[]>([]);
  readonly loaded = signal(false);

  async load(force = false): Promise<void> {
    if (this.loaded() && !force) return;
    const uid = this.be.game.userId();
    const st = this.be.game.store;
    try {
      const [h, e, j] = await Promise.all([st.listInstances(uid, { from: addDays(this.game.today(), -400) }), st.listXpEvents(uid), st.listJournal(uid)]);
      this.history.set(h);
      this.events.set(e);
      this.journal.set(j);
      this.loaded.set(true);
    } catch {
      /* hors ligne */
    }
  }

  private dayOf = (iso: string) => gameDate(Date.parse(iso), this.game.tz(), this.game.settings()?.resetHour ?? 4);

  readonly completed = computed(() => this.history().filter((i) => i.status === 'completed' && i.completedAt));

  /** Récit : un jour = une entrée, avec quêtes, notes et événements marquants. */
  readonly days = computed<DayGroup[]>(() => {
    const byDay = new Map<string, DayEntry[]>();
    const push = (d: string, e: DayEntry) => byDay.set(d, [...(byDay.get(d) ?? []), e]);
    const notes = new Map(this.journal().map((j) => [j.instanceId, j.text]));
    for (const q of this.completed()) push(this.dayOf(q.completedAt!), { kind: 'quest', at: q.completedAt!, inst: q, note: notes.get(q.id) });
    // niveaux atteints (cumul chronologique du registre)
    let total = 0;
    let level = 1;
    for (const e of [...this.events()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      total = Math.max(total + e.amount, 0);
      const l = levelFromXp(total);
      if (l > level) {
        for (let k = level + 1; k <= l; k++) push(e.gameDate, { kind: 'level', at: e.createdAt, level: k });
      }
      level = l;
    }
    for (const u of this.game.unlocked()) {
      const a = ACHIEVEMENTS.find((x) => x.id === u.achievementId);
      if (a) push(this.dayOf(u.unlockedAt), { kind: 'trophy', at: u.unlockedAt, id: a.id, name: a.name });
    }
    const xpByDay = new Map<string, number>();
    for (const e of this.events()) if (e.amount > 0) xpByDay.set(e.gameDate, (xpByDay.get(e.gameDate) ?? 0) + e.amount);
    const rest = new Set(this.game.restDays());
    const today = this.game.today();
    const first = [...byDay.keys(), ...rest].sort()[0] ?? today;
    const out: DayGroup[] = [];
    for (let d = today; d >= first && out.length < 400; d = addDays(d, -1)) {
      out.push({ date: d, entries: (byDay.get(d) ?? []).sort((a, b) => b.at.localeCompare(a.at)), rest: rest.has(d), xp: xpByDay.get(d) ?? 0 });
    }
    return out;
  });

  // ───────────────────────── Séries pour les graphiques ─────────────────────────

  xpByDay(from: string, to: string): { date: string; xp: number }[] {
    const m = new Map<string, number>();
    for (const e of this.events()) if (e.amount > 0 && e.gameDate >= from && e.gameDate <= to) m.set(e.gameDate, (m.get(e.gameDate) ?? 0) + e.amount);
    const out: { date: string; xp: number }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, xp: m.get(d) ?? 0 });
    return out;
  }

  xpByAbility(from: string, to: string): Record<AbilityId, number> {
    const r = emptyAbilityRecord(0);
    for (const e of this.events()) if (e.amount > 0 && e.gameDate >= from && e.gameDate <= to) r[e.ability] += e.amount;
    return r;
  }

  /** XP par semaine ISO sur n semaines, empilée par caractéristique. */
  weeklyStack(n = 12): { label: string; start: string; byAbility: Record<AbilityId, number> }[] {
    const thisWeek = startOfIsoWeek(this.game.today());
    return Array.from({ length: n }, (_, k) => {
      const start = addDays(thisWeek, -7 * (n - 1 - k));
      return { label: `S${isoWeek(start).week}`, start, byAbility: this.xpByAbility(start, addDays(start, 6)) };
    });
  }

  /** Score de chaque caractéristique à la fin de chaque semaine, depuis la création. */
  scoreCurves(weeks = 16): { labels: string[]; data: Record<AbilityId, number[]> } {
    const c = this.game.character();
    const out = { labels: [] as string[], data: Object.fromEntries(ABILITIES.map((a) => [a, [] as number[]])) as Record<AbilityId, number[]> };
    if (!c) return out;
    const thisWeek = startOfIsoWeek(this.game.today());
    const ev = [...this.events()];
    for (let k = weeks - 1; k >= 0; k--) {
      const end = addDays(thisWeek, -7 * k + 6);
      out.labels.push(`S${isoWeek(addDays(thisWeek, -7 * k)).week}`);
      for (const a of ABILITIES) {
        const xp = ev.filter((e) => e.ability === a && e.gameDate <= end).reduce((n, e) => n + e.amount, 0);
        out.data[a].push(abilityProgress(c.baseScores[a], Math.max(xp, 0), c.improvements[a]).score);
      }
    }
    return out;
  }

  /** Taux de réussite par période et par difficulté (quêtes engagées). */
  successRates(): { byPeriod: { label: string; done: number; total: number }[]; byDifficulty: { label: string; done: number; total: number }[] } {
    const rows = this.history().filter((i) => ['completed', 'expired', 'abandoned'].includes(i.status) || (i.status === 'accepted' && i.periodEnd < this.game.today()));
    const agg = (key: (i: QuestInstance) => string, labels: Record<string, string>) =>
      Object.entries(labels).map(([k, label]) => {
        const sub = rows.filter((i) => key(i) === k);
        return { label, done: sub.filter((i) => i.status === 'completed').length, total: sub.length };
      });
    return {
      byPeriod: agg((i) => i.period, { daily: 'Jour', weekly: 'Semaine', monthly: 'Mois', epic: 'Épique' }).filter((x) => x.total),
      byDifficulty: agg((i) => i.snapshot.difficulty, { easy: 'Facile', medium: 'Modérée', high: 'Audacieuse', expert: 'Légendaire' }).filter((x) => x.total),
    };
  }

  /** Nombre de quêtes accomplies par jour sur 12 mois (calendrier « heatmap »). */
  heatmap(): { date: string; n: number }[] {
    const m = new Map<string, number>();
    for (const q of this.completed()) m.set(this.dayOf(q.completedAt!), (m.get(this.dayOf(q.completedAt!)) ?? 0) + 1);
    const today = this.game.today();
    const start = startOfIsoWeek(addDays(today, -7 * 52));
    const out: { date: string; n: number }[] = [];
    for (let d = start; d <= today; d = addDays(d, 1)) out.push({ date: d, n: m.get(d) ?? 0 });
    return out;
  }

  /** Meilleurs jours de la semaine et heures de validation. */
  habits(): { weekdays: number[]; hours: number[] } {
    const weekdays = new Array(7).fill(0);
    const hours = new Array(24).fill(0);
    for (const q of this.completed()) {
      const d = new Date(q.completedAt!);
      weekdays[(d.getDay() + 6) % 7]++;
      hours[d.getHours()]++;
    }
    return { weekdays, hours };
  }

  records(): { bestStreak: number; bestWeek: { xp: number; label: string }; bestMonth: { xp: number; label: string }; topQuest: { title: string; n: number } | null } {
    const byWeek = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const e of this.events()) {
      if (e.amount <= 0) continue;
      byWeek.set(startOfIsoWeek(e.gameDate), (byWeek.get(startOfIsoWeek(e.gameDate)) ?? 0) + e.amount);
      byMonth.set(startOfMonth(e.gameDate), (byMonth.get(startOfMonth(e.gameDate)) ?? 0) + e.amount);
    }
    const best = (m: Map<string, number>, fmtLabel: (k: string) => string) => {
      const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
      return top ? { xp: top[1], label: fmtLabel(top[0]) } : { xp: 0, label: '—' };
    };
    const counts = new Map<string, number>();
    for (const q of this.completed()) counts.set(q.snapshot.title, (counts.get(q.snapshot.title) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      bestStreak: this.game.character()?.streakBest ?? 0,
      bestWeek: best(byWeek, (k) => `semaine du ${new Date(`${k}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`),
      bestMonth: best(byMonth, (k) => new Date(`${k}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })),
      topQuest: top ? { title: top[0], n: top[1] } : null,
    };
  }

  // ───────────────────────── Bilans de période ─────────────────────────

  private engaged(from: string, to: string): QuestInstance[] {
    return this.history().filter((i) => i.periodStart >= from && i.periodStart <= to && !(i.free && i.status === 'proposed') && ['accepted', 'completed', 'expired'].includes(i.status));
  }

  recap(kind: 'week' | 'month', start: string): Recap {
    const end = kind === 'week' ? endOfIsoWeek(start) : endOfMonth(start);
    const prevStart = kind === 'week' ? addDays(start, -7) : startOfMonth(addDays(start, -1));
    const prevEnd = kind === 'week' ? addDays(start, -1) : addDays(start, -1);
    const byAbility = this.xpByAbility(start, end);
    const xp = ABILITIES.reduce((n, a) => n + byAbility[a], 0);
    const prev = this.xpByAbility(prevStart, prevEnd);
    const xpPrev = ABILITIES.reduce((n, a) => n + prev[a], 0);
    const rows = this.engaged(start, end);
    const doneBy = emptyAbilityRecord(0);
    for (const r of rows) if (r.status === 'completed') doneBy[r.snapshot.ability]++;
    return buildRecap(
      {
        kind,
        name: this.game.character()?.name ?? '',
        xp,
        xpPrev,
        done: rows.filter((r) => r.status === 'completed').length,
        proposed: rows.length,
        xpByAbility: byAbility,
        doneByAbility: doneBy,
        seed: `${kind}-${start}`,
      },
      recapTemplates as unknown as RecapTemplates,
    );
  }

  /** Semaines et mois terminés dont on peut relire le bilan (du plus récent au plus ancien). */
  pastRecaps(): { kind: 'week' | 'month'; start: string; title: string; recap: Recap }[] {
    const today = this.game.today();
    const first = this.completed().map((q) => this.dayOf(q.completedAt!)).sort()[0];
    if (!first) return [];
    const out: { kind: 'week' | 'month'; start: string; title: string; recap: Recap }[] = [];
    for (let s = addDays(startOfIsoWeek(today), -7); s >= startOfIsoWeek(first) && out.length < 12; s = addDays(s, -7)) {
      out.push({ kind: 'week', start: s, title: this.weekTitle(s), recap: this.recap('week', s) });
    }
    for (let m = startOfMonth(addDays(startOfMonth(today), -1)); m >= startOfMonth(first) && out.length < 20; m = startOfMonth(addDays(m, -1))) {
      out.push({ kind: 'month', start: m, title: new Date(`${m}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), recap: this.recap('month', m) });
    }
    return out;
  }

  weekTitle(start: string): string {
    const e = addDays(start, 6);
    const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `${f(start)} – ${f(e)}`;
  }

  /** Bilan à montrer à la première ouverture après la fin d'une semaine ou d'un mois (7.12). */
  pendingRecap(): { kind: 'week' | 'month'; start: string; key: string } | null {
    const s = this.game.settings();
    if (!s || !this.game.character()) return null;
    const today = this.game.today();
    const lastWeek = addDays(startOfIsoWeek(today), -7);
    const lastMonth = startOfMonth(addDays(startOfMonth(today), -1));
    const since = diffDays(today, this.game.character()!.createdAt.slice(0, 10));
    if (since < 7) return null;
    if (today === startOfMonth(today) || (s.lastRecapMonth !== lastMonth && diffDays(today, startOfMonth(today)) < 3)) {
      if (s.lastRecapMonth !== lastMonth && diffDays(lastMonth, this.game.character()!.createdAt.slice(0, 10)) > -28) return { kind: 'month', start: lastMonth, key: lastMonth };
    }
    if (s.lastRecapWeek !== lastWeek && diffDays(endOfIsoWeek(lastWeek), this.game.character()!.createdAt.slice(0, 10)) >= 3) return { kind: 'week', start: lastWeek, key: lastWeek };
    return null;
  }
}

export { LEVEL_XP };
