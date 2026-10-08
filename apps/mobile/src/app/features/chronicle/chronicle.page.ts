import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular';
import type { ChartConfiguration } from 'chart.js';
import { ABILITIES, ABILITY_COLOR, ABILITY_LABEL, endOfIsoWeek, startOfIsoWeek, startOfMonth, type AbilityId } from '@levelup/engine';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { StatsService, type DayEntry } from '../../core/stats.service';
import { UiService } from '../../core/ui.service';
import { PageHeaderComponent, BarComponent, EmptyComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { ChartComponent, cssVar } from '../../shared/chart.component';
import { RecapComponent } from '../../shared/recap.component';
import { fmt, longDate, timeOfDay, dayLabel } from '../../shared/format';

type Tab = 'story' | 'stats' | 'recaps';
const WEEK_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const IDLE_LINES = ['Le héros ne quitta pas l’auberge.', 'Une journée tranquille, sans quête.', 'Le feu crépita, le héros se reposa.'];

@Component({
  selector: 'app-chronicle',
  imports: [IonContent, IonRefresher, IonRefresherContent, PageHeaderComponent, BarComponent, EmptyComponent, IconComponent, ChartComponent, RecapComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <lu-page-header eyebrow="Chaque pas laisse une trace" icon="book-open" title="Ta chronique" />

      <div class="lu-page">
        <nav class="summary" role="tablist" aria-label="Chapitres">
          <button type="button" role="tab" [class.on]="tab() === 'story'" [attr.aria-selected]="tab() === 'story'" (click)="tab.set('story')">Récit</button>
          <button type="button" role="tab" [class.on]="tab() === 'stats'" [attr.aria-selected]="tab() === 'stats'" (click)="tab.set('stats')">Statistiques</button>
          <button type="button" role="tab" [class.on]="tab() === 'recaps'" [attr.aria-selected]="tab() === 'recaps'" (click)="tab.set('recaps')">Bilans</button>
        </nav>

        @switch (tab()) {
          @case ('story') {
            <section class="lu-section">
              <div class="lu-section-title"><h2>Le récit de tes petits exploits</h2></div>
              <p class="small muted">Ce que tu as fait, pas ce qu’il te reste à faire.</p>
              <div class="filters">
                <button type="button" class="lu-chip big" [class.mint]="!!abilityFilter()" (click)="pickAbility()">{{ abilityFilter() ? label(abilityFilter()!) : 'Caractéristique' }} ⌄</button>
                <button type="button" class="lu-chip big" [class.mint]="!!monthFilter()" (click)="pickMonth()">{{ monthFilter() ? monthName(monthFilter()!) : 'Mois' }} ⌄</button>
                @if (abilityFilter() || monthFilter()) { <button type="button" class="lu-chip big" (click)="clear()">Effacer</button> }
              </div>
              @if (oath()) {
                <div class="lu-card gold oath"><span class="lu-eyebrow">TON SERMENT</span><p>{{ oath() }}</p></div>
              }
              @for (d of visibleDays(); track d.date) {
                <article class="lu-card day">
                  <header><strong>{{ dayTitle(d.date) }}</strong>@if (d.xp) { <span class="gold small">+{{ fmt(d.xp) }} XP</span> }</header>
                  @for (e of d.entries; track $index) {
                    @switch (e.kind) {
                      @case ('quest') {
                        <div class="entry" role="button" tabindex="0" (click)="ui.go(['/quest', e.inst.id])" (keydown.enter)="ui.go(['/quest', e.inst.id])">
                          <div class="em"><strong>{{ e.inst.snapshot.title }}</strong><span class="xs muted">{{ label(e.inst.snapshot.ability) }} · {{ time(e.at) }}</span>@if (e.note) { <em class="note">« {{ e.note }} »</em> }</div>
                          <span class="gold small">+{{ e.inst.xpAwarded }} XP</span>
                        </div>
                      }
                      @case ('level') { <div class="entry ev"><lu-icon name="crown" [size]="16" /> <strong>Niveau {{ e.level }} atteint</strong></div> }
                      @case ('trophy') { <div class="entry ev"><lu-icon name="trophy" [size]="16" /> <strong>Succès débloqué : {{ e.name }}</strong></div> }
                      @case ('streak') { <div class="entry ev"><lu-icon name="flame" [size]="16" /> <strong>Série de {{ e.days }} jours</strong></div> }
                    }
                  } @empty {
                    <p class="idle">{{ d.rest ? 'Jour de repos. La flamme veille.' : idle(d.date) }}</p>
                  }
                  @if (d.rest && d.entries.length) { <p class="xs muted">Jour de repos déclaré.</p> }
                </article>
              } @empty {
                <lu-empty icon="book-open" title="Ton récit commence ici" text="Chaque quête accomplie écrira une ligne de ton histoire." />
              }
              @if (hasMore()) { <button type="button" class="lu-btn ghost" (click)="shown.set(shown() + 14)">Voir plus de jours</button> }
            </section>
          }
          @case ('stats') {
            <section class="lu-section">
              <div class="lu-section-title"><h2>Ton élan en chiffres</h2><span class="lu-link" style="color: var(--lu-text-2)">{{ weekRange() }}</span></div>
              <div class="metrics">
                <div class="lu-card flat m"><strong>{{ fmt(weekXp()) }}</strong><span>XP cette semaine</span></div>
                <div class="lu-card flat m"><strong>{{ week().done }}</strong><span>Quêtes réussies</span></div>
                <div class="lu-card flat m"><strong>{{ week().rate }} %</strong><span>Taux de réussite</span></div>
              </div>
              <div class="lu-card">
                <div class="ch"><strong>XP gagnés par jour</strong>@if (delta() !== null) { <span class="lu-chip" [class.mint]="delta()! >= 0">{{ delta()! >= 0 ? '+' : '' }}{{ delta() }} % vs sem. passée</span> }</div>
                <div class="bars">
                  @for (d of weekDays(); track d.date; let i = $index) {
                    <div class="b"><span class="v">{{ d.xp || '–' }}</span><i [style.height.%]="d.pct"></i><span class="l">{{ letters[i] }}</span></div>
                  }
                </div>
                <p class="xs muted">Semaine en cours · {{ fmt(totalXp()) }} XP cumulés depuis le début</p>
              </div>
            </section>

            <section class="lu-section">
              <div class="lu-section-title"><h2>Les forces que tu cultives</h2></div>
              <div class="lu-card">
                @for (a of byAbility(); track a.id) {
                  <div class="ar"><span class="an"><i [style.background]="color(a.id)"></i>{{ label(a.id) }}</span><lu-bar [value]="a.xp" [max]="maxAbility()" /><span class="gold small">+{{ fmt(a.xp) }} XP</span></div>
                }
                <p class="small muted">{{ leadSentence() }}</p>
              </div>
            </section>

            <section class="lu-section">
              <div class="lu-section-title"><h2>XP sur 12 semaines</h2></div>
              <div class="lu-card"><lu-chart [config]="stackConfig()" label="XP par semaine et par caractéristique" [height]="210" /></div>
            </section>
            <section class="lu-section">
              <div class="lu-section-title"><h2>Évolution de tes scores</h2></div>
              <div class="lu-card"><lu-chart [config]="curveConfig()" label="Évolution des six scores" [height]="230" /></div>
            </section>
            <section class="lu-section">
              <div class="lu-section-title"><h2>Taux de réussite</h2></div>
              <div class="lu-card">
                @for (r of rates().byPeriod; track r.label) { <div class="rate"><span>{{ r.label }}</span><lu-bar [value]="r.done" [max]="r.total" /><b>{{ pct(r) }} %</b></div> }
                <div class="sep"></div>
                @for (r of rates().byDifficulty; track r.label) { <div class="rate"><span>{{ r.label }}</span><lu-bar [value]="r.done" [max]="r.total" tone="gold" /><b>{{ pct(r) }} %</b></div> }
                @if (!rates().byPeriod.length) { <p class="small muted">Les taux apparaîtront dès que tes premières quêtes seront terminées ou expirées.</p> }
              </div>
            </section>
            <section class="lu-section">
              <div class="lu-section-title"><h2>12 mois d’habitudes</h2></div>
              <div class="lu-card">
                <div class="heat" role="img" aria-label="Calendrier des quêtes accomplies sur 12 mois">
                  @for (c of heat(); track c.date) { <i [attr.data-n]="level(c.n)" [attr.title]="c.date + ' : ' + c.n + ' quête(s)'"></i> }
                </div>
                <div class="legend xs muted">Moins <i data-n="0"></i><i data-n="1"></i><i data-n="2"></i><i data-n="3"></i><i data-n="4"></i> Plus</div>
              </div>
              <div class="lu-card">
                <strong class="small">Tes meilleurs jours</strong>
                <div class="bars short">@for (v of habits().weekdays; track $index; let i = $index) { <div class="b"><i [style.height.%]="norm(v, habitsMaxD())"></i><span class="l">{{ letters[i] }}</span></div> }</div>
                <strong class="small">Heures de validation les plus fréquentes</strong>
                <div class="hours">@for (v of habits().hours; track $index; let h = $index) { <i [style.height.%]="norm(v, habitsMaxH())" [attr.title]="h + ' h'"></i> }</div>
                <div class="hl xs muted"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>23 h</span></div>
              </div>
              <div class="lu-card flat rec">
                <div><span>Plus longue série</span><strong>{{ records().bestStreak }} jours</strong></div>
                <div><span>Meilleure semaine</span><strong>{{ fmt(records().bestWeek.xp) }} XP</strong><small class="xs muted">{{ records().bestWeek.label }}</small></div>
                <div><span>Meilleur mois</span><strong>{{ fmt(records().bestMonth.xp) }} XP</strong><small class="xs muted">{{ records().bestMonth.label }}</small></div>
                @if (records().topQuest; as t) { <div><span>Quête la plus réalisée</span><strong>{{ t.title }}</strong><small class="xs muted">{{ t.n }} fois</small></div> }
              </div>
            </section>
          }
          @case ('recaps') {
            <section class="lu-section">
              <div class="lu-section-title"><h2>Bilans</h2></div>
              <article class="lu-card gold recapcard" role="button" tabindex="0" (click)="openRecap('week', thisWeek)" (keydown.enter)="openRecap('week', thisWeek)">
                <span class="lu-eyebrow">CETTE SEMAINE · {{ weekRange().toUpperCase() }}</span>
                <span class="lu-chip mint">En cours</span>
                <h3>{{ weekRecap().xp >= weekRecap().xpPrev ? 'La régularité fait son chemin.' : 'Une semaine plus douce.' }}</h3>
                <p class="small">{{ weekRecap().done }} quêtes sur {{ weekRecap().proposed }} accomplies et {{ fmt(weekRecap().xp) }} XP gagnés.@if (weekRecap().best) { {{ label(weekRecap().best!) }} mène la danse. }</p>
                <span class="lu-link">Écrire mon bilan personnel →</span>
              </article>
              <article class="lu-card recapcard" role="button" tabindex="0" (click)="openRecap('month', thisMonth)" (keydown.enter)="openRecap('month', thisMonth)">
                <h3>{{ monthName(thisMonth) }}, déjà {{ monthRecap().done }} pas.</h3>
                <p class="small muted">{{ monthRecap().done }} / {{ monthRecap().proposed }} quêtes · {{ fmt(monthRecap().xp) }} XP gagnés ce mois-ci. Continue à ton rythme.</p>
                <span class="lu-link">Ouvrir mon bilan du mois →</span>
              </article>
              @if (past().length) {
                <div class="lu-section-title"><h2>Bilans passés</h2></div>
                @for (p of past(); track p.kind + p.start) {
                  <button type="button" class="lu-card flat pastrow" (click)="openRecap(p.kind, p.start)">
                    <span><strong>{{ p.kind === 'week' ? 'Semaine' : 'Mois' }} · {{ p.title }}</strong><small class="xs muted">{{ p.recap.done }}/{{ p.recap.proposed }} quêtes · {{ fmt(p.recap.xp) }} XP</small></span>
                    <lu-icon name="chevron-right" [size]="18" />
                  </button>
                }
              }
            </section>
          }
        }
      </div>

      @if (recap(); as r) {
        <lu-recap [kind]="r.kind" [start]="r.start" [title]="r.title" [recap]="r.recap" (close)="recap.set(null)" />
      }
    </ion-content>
  `,
  styles: `
    .summary { display: flex; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--lu-border); }
    .summary button { height: 31px; padding: 0 14px; border-radius: 100px; border: 1px solid var(--lu-border); background: var(--lu-surface); color: var(--lu-text-2); font: 600 12px var(--lu-font-body); cursor: pointer; }
    .summary button.on { background: var(--lu-gold-strong); border-color: var(--lu-gold-strong); color: #1a1608; font-weight: 700; }
    .filters { display: flex; gap: 8px; flex-wrap: wrap; } .filters .lu-chip { cursor: pointer; }
    .oath { gap: 6px; } .oath p { font-family: var(--lu-font-title); font-style: italic; font-size: 15px; line-height: 1.55; }
    .day { gap: 10px; } .day header { display: flex; justify-content: space-between; align-items: baseline; } .day header strong { font-family: var(--lu-font-title); font-weight: 500; font-size: 17px; text-transform: capitalize; }
    .entry { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-top: 1px solid var(--lu-border); cursor: pointer; align-items: flex-start; }
    .entry.ev { align-items: center; justify-content: flex-start; gap: 8px; color: var(--lu-gold); cursor: default; }
    .em { display: flex; flex-direction: column; gap: 2px; } .em strong { font-size: 13px; font-weight: 600; }
    .note { font-family: var(--lu-font-title); font-size: 12px; color: var(--lu-text-2); margin-top: 4px; }
    .idle { font-family: var(--lu-font-title); font-style: italic; font-size: 13px; color: var(--lu-muted); }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .m { align-items: center; gap: 4px; padding: 12px 6px; text-align: center; } .m strong { font-family: var(--lu-font-title); font-size: 24px; font-weight: 500; } .m span { font-size: 10px; color: var(--lu-muted); }
    .ch { display: flex; justify-content: space-between; align-items: center; gap: 8px; } .ch strong { font-size: 14px; }
    .bars { display: flex; gap: 8px; align-items: flex-end; height: 140px; } .bars.short { height: 70px; }
    .b { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; height: 100%; }
    .b i { width: 100%; max-width: 30px; min-height: 3px; border-radius: 6px 6px 2px 2px; background: var(--lu-accent); display: block; }
    .b .v { font-size: 10px; color: var(--lu-muted); } .b .l { font-size: 10px; font-weight: 700; color: var(--lu-muted); }
    .ar { display: grid; grid-template-columns: 96px 1fr 64px; gap: 10px; align-items: center; } .an { display: inline-flex; gap: 8px; align-items: center; font-size: 12px; } .an i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; } .ar .small { text-align: right; }
    .rate { display: grid; grid-template-columns: 88px 1fr 42px; gap: 10px; align-items: center; font-size: 12px; } .rate b { text-align: right; font-size: 12px; }
    .sep { height: 1px; background: var(--lu-border); margin: 4px 0; }
    .heat { display: grid; grid-template-rows: repeat(7, 1fr); grid-auto-flow: column; gap: 3px; overflow-x: auto; }
    .heat i, .legend i { width: 11px; height: 11px; border-radius: 3px; background: var(--lu-track); display: block; }
    [data-n='1'] { background: color-mix(in srgb, var(--lu-accent) 30%, var(--lu-track)) !important; } [data-n='2'] { background: color-mix(in srgb, var(--lu-accent) 55%, var(--lu-track)) !important; }
    [data-n='3'] { background: color-mix(in srgb, var(--lu-accent) 80%, var(--lu-track)) !important; } [data-n='4'] { background: var(--lu-accent) !important; }
    .legend { display: flex; align-items: center; gap: 4px; justify-content: flex-end; }
    .hours { display: flex; align-items: flex-end; gap: 3px; height: 60px; } .hours i { flex: 1; background: var(--lu-gold); border-radius: 3px 3px 1px 1px; min-height: 2px; }
    .hl { display: flex; justify-content: space-between; }
    .rec { gap: 12px; } .rec div { display: flex; flex-direction: column; gap: 2px; } .rec span { font-size: 11px; color: var(--lu-muted); } .rec strong { font-size: 16px; font-family: var(--lu-font-title); font-weight: 500; }
    .recapcard { cursor: pointer; gap: 10px; align-items: flex-start; } .recapcard h3 { font-size: 20px; }
    .pastrow { flex-direction: row; justify-content: space-between; align-items: center; cursor: pointer; width: 100%; text-align: left; color: inherit; font: inherit; } .pastrow span { display: flex; flex-direction: column; gap: 3px; }
    .narr { font-family: var(--lu-font-title); font-style: italic; font-size: 15px; line-height: 1.6; padding: 12px 14px; border-left: 3px solid var(--lu-gold); background: var(--lu-surface-2); border-radius: 0 12px 12px 0; }
    .mint { color: var(--lu-accent); }
  `,
})
export class ChroniclePage {
  protected game = inject(GameService);
  protected stats = inject(StatsService);
  protected ui = inject(UiService);
  private be = inject(BackendService);
  readonly fmt = fmt;
  readonly letters = WEEK_LETTERS;
  readonly abilities = ABILITIES;
  readonly tab = signal<Tab>('story');
  readonly abilityFilter = signal<AbilityId | null>(null);
  readonly monthFilter = signal<string | null>(null);
  readonly shown = signal(14);
  readonly recap = signal<{ kind: 'week' | 'month'; start: string; title: string; recap: ReturnType<StatsService['recap']> } | null>(null);
  readonly oath = signal('');

  readonly thisWeek = startOfIsoWeek(this.game.today());
  readonly thisMonth = startOfMonth(this.game.today());

  label = (a: AbilityId) => ABILITY_LABEL[a];
  color = (a: AbilityId) => ABILITY_COLOR[a];
  time = (iso: string) => timeOfDay(iso);
  dayTitle = (d: string) => (d === this.game.today() ? 'Aujourd’hui' : dayLabel(`${d}T12:00:00`, Date.parse(`${this.game.today()}T12:00:00`)) === 'Hier' ? 'Hier' : longDate(d));
  monthName = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long' }).replace(/^./, (c) => c.toUpperCase());
  idle = (d: string) => IDLE_LINES[(d.charCodeAt(9) + d.charCodeAt(8)) % IDLE_LINES.length];
  pct = (r: { done: number; total: number }) => (r.total ? Math.round((r.done / r.total) * 100) : 0);
  norm = (v: number, max: number) => (max ? Math.max((v / max) * 100, v ? 6 : 0) : 0);
  level = (n: number) => (n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n <= 4 ? 3 : 4);
  maxOf = (r: Record<AbilityId, number>) => Math.max(...ABILITIES.map((a) => r[a]), 1);

  constructor() {
    void this.stats.load(true);
    void this.loadOath();
  }

  private async loadOath(): Promise<void> {
    try {
      const c = await this.be.game.store.getCharacter(this.be.game.userId());
      this.oath.set(c?.oath ?? '');
    } catch {
      /* hors ligne */
    }
  }

  // ───── Récit
  readonly filteredDays = computed(() =>
    this.stats.days().filter((d) => {
      if (this.monthFilter() && !d.date.startsWith(this.monthFilter()!.slice(0, 7))) return false;
      if (this.abilityFilter()) return d.entries.some((e) => e.kind === 'quest' && e.inst.snapshot.ability === this.abilityFilter());
      return true;
    }).map((d) => (this.abilityFilter() ? { ...d, entries: d.entries.filter((e: DayEntry) => e.kind === 'quest' && e.inst.snapshot.ability === this.abilityFilter()) } : d)),
  );
  readonly visibleDays = computed(() => this.filteredDays().slice(0, this.shown()));
  readonly hasMore = computed(() => this.filteredDays().length > this.shown());

  async pickAbility(): Promise<void> {
    const v = await this.ui.choose('Caractéristique', [...ABILITIES.map((a) => ({ text: ABILITY_LABEL[a], value: a as string })), { text: 'Toutes', value: '' }]);
    if (v !== null) this.abilityFilter.set((v || null) as AbilityId | null);
  }
  async pickMonth(): Promise<void> {
    const months = new Set(this.stats.days().map((d) => startOfMonth(d.date)));
    const v = await this.ui.choose('Mois', [...[...months].slice(0, 12).map((m) => ({ text: new Date(`${m}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), value: m })), { text: 'Tous', value: '' }]);
    if (v !== null) this.monthFilter.set(v || null);
  }
  clear(): void {
    this.abilityFilter.set(null);
    this.monthFilter.set(null);
  }

  // ───── Statistiques
  readonly weekEnd = computed(() => endOfIsoWeek(this.thisWeek));
  readonly weekRange = computed(() => this.stats.weekTitle(this.thisWeek));
  readonly weekRecap = computed(() => this.stats.recap('week', this.thisWeek));
  readonly monthRecap = computed(() => this.stats.recap('month', this.thisMonth));
  readonly week = computed(() => {
    const r = this.weekRecap();
    return { done: r.done, rate: r.proposed ? Math.round((r.done / r.proposed) * 100) : 0 };
  });
  readonly weekXp = computed(() => this.weekRecap().xp);
  readonly delta = computed(() => this.weekRecap().deltaPct);
  readonly weekDays = computed(() => {
    const d = this.stats.xpByDay(this.thisWeek, this.weekEnd());
    const max = Math.max(...d.map((x) => x.xp), 1);
    return d.map((x) => ({ ...x, pct: x.xp ? Math.max((x.xp / max) * 100, 6) : 2 }));
  });
  readonly totalXp = computed(() => this.game.character()?.totalXp ?? 0);
  readonly byAbility = computed(() => {
    const r = this.weekRecap().xpByAbility;
    return ABILITIES.map((id) => ({ id, xp: r[id] })).sort((a, b) => b.xp - a.xp);
  });
  readonly maxAbility = computed(() => Math.max(...this.byAbility().map((a) => a.xp), 1));
  readonly leadSentence = computed(() => {
    const top = this.byAbility()[0];
    const low = this.byAbility()[5];
    if (!top || top.xp === 0) return 'Cette semaine commence : chaque quête nourrira ces six forces.';
    return `${this.label(top.id)} mène la danse cette semaine. ${this.label(low.id)} aimerait un peu d’attention.`;
  });
  readonly rates = computed(() => this.stats.successRates());
  readonly heat = computed(() => this.stats.heatmap());
  readonly habits = computed(() => this.stats.habits());
  readonly habitsMaxD = computed(() => Math.max(...this.habits().weekdays, 1));
  readonly habitsMaxH = computed(() => Math.max(...this.habits().hours, 1));
  readonly records = computed(() => this.stats.records());

  readonly stackConfig = computed<ChartConfiguration>(() => {
    const w = this.stats.weeklyStack(12);
    return {
      type: 'bar',
      data: { labels: w.map((x) => x.label), datasets: ABILITIES.map((a) => ({ label: ABILITY_LABEL[a], data: w.map((x) => x.byAbility[a]), backgroundColor: ABILITY_COLOR[a], borderRadius: 3 })) },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 } } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: cssVar('--lu-border') }, beginAtZero: true } } },
    };
  });
  readonly curveConfig = computed<ChartConfiguration>(() => {
    const c = this.stats.scoreCurves(16);
    return {
      type: 'line',
      data: { labels: c.labels, datasets: ABILITIES.map((a) => ({ label: ABILITY_LABEL[a], data: c.data[a], borderColor: ABILITY_COLOR[a], backgroundColor: ABILITY_COLOR[a], tension: 0.3, pointRadius: 0, borderWidth: 2 })) },
      options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 10 } } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: cssVar('--lu-border') }, suggestedMin: 8 } } },
    };
  });

  // ───── Bilans
  readonly past = computed(() => this.stats.pastRecaps());

  openRecap(kind: 'week' | 'month', start: string): void {
    const title = kind === 'week' ? this.stats.weekTitle(start) : new Date(`${start}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    this.recap.set({ kind, start, title, recap: this.stats.recap(kind, start) });
  }
  async refresh(ev: CustomEvent): Promise<void> {
    await this.stats.load(true);
    (ev.target as HTMLIonRefresherElement).complete();
  }
}
