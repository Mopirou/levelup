import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ActionSheetController, IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular';
import {
  ABILITIES,
  ABILITY_LABEL,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  PERIOD_TAB_LABEL,
  daysLeft,
  endOfIsoWeek,
  periodBounds,
  type AbilityId,
  type Difficulty,
  type Period,
  type QuestInstance,
} from '@levelup/engine';
import { GameService } from '../../core/game.service';
import { UiService } from '../../core/ui.service';
import { haptic, playSound } from '../../core/feedback';
import { PageHeaderComponent, EmptyComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { QuestCardComponent } from '../../shared/quest-card.component';
import { countdown, fmt, longDate } from '../../shared/format';

type StatusFilter = 'all' | 'todo' | 'done' | 'proposed';
const PERIODS: Period[] = ['daily', 'weekly', 'monthly'];

@Component({
  selector: 'app-quest-board',
  imports: [IonContent, IonRefresher, IonRefresherContent, PageHeaderComponent, EmptyComponent, IconComponent, QuestCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>

      <lu-page-header eyebrow="À faire" icon="swords" title="Mes quêtes">
        <div actions>
          <button type="button" class="lu-icon-btn" aria-label="Catalogue : ajouter une quête" (click)="catalogue()"><lu-icon name="library" [size]="17" /></button>
          <button type="button" class="lu-icon-btn" aria-label="Créer ma propre quête" (click)="forge()"><lu-icon name="circle-plus" [size]="17" /></button>
        </div>
      </lu-page-header>

      <div class="lu-page">
        <div class="lu-seg" role="tablist" aria-label="Période">
          @for (p of tabs; track p) {
            <button type="button" role="tab" [attr.aria-selected]="period() === p" [class.on]="period() === p" (click)="setPeriod(p)">{{ tabLabel(p) }}</button>
          }
          @if (game.unlocks().epic) {
            <button type="button" role="tab" [class.on]="period() === 'epic'" (click)="setPeriod('epic')">Épique</button>
          }
        </div>
        @if (!game.unlocks().epic) {
          <p class="xs dim epic-hint"><lu-icon name="lock" [size]="11" /> Épique : débloqué au niveau 11</p>
        }
        <p class="xs muted countdown"><lu-icon name="clock" [size]="12" /> {{ renewal() }}</p>

        <div class="search">
          <lu-icon name="search" [size]="17" />
          <input type="search" class="inp" placeholder="Trouver une quête…" [value]="query()" (input)="query.set($any($event.target).value)" aria-label="Rechercher une quête" />
          @if (query() || activeFilters()) {
            <button type="button" class="clr" (click)="clearFilters()" aria-label="Effacer les filtres"><lu-icon name="x" [size]="15" /></button>
          } @else {
            <lu-icon name="sliders" [size]="17" />
          }
        </div>
        <div class="filters">
          <button type="button" class="lu-chip big" [class.mint]="!activeFilters()" (click)="clearFilters()">Toutes</button>
          <button type="button" class="lu-chip big" [class.mint]="!!abilityFilter()" (click)="pickAbility()">{{ abilityFilter() ? abLabel(abilityFilter()!) : 'Caractéristique' }} ⌄</button>
          <button type="button" class="lu-chip big" [class.mint]="!!diffFilter()" (click)="pickDifficulty()">{{ diffFilter() ? dfLabel(diffFilter()!) : 'Difficulté' }} ⌄</button>
          <button type="button" class="lu-chip big" [class.mint]="statusFilter() !== 'all'" (click)="pickStatus()">{{ statusLabelText() }} ⌄</button>
        </div>

        @if (period() === 'daily' && game.dailies().length) {
          <div class="lu-card flat summary">
            <span class="ring" [class.full]="game.dailyLeft() === 0">{{ game.dailyDone() }}/{{ game.dailies().length }}</span>
            <div>
              <h3 class="st">{{ summaryTitle() }}</h3>
              <p class="xs muted">{{ fmt(gained()) }} XP gagnés · {{ game.dailyLeft() }} quête{{ game.dailyLeft() > 1 ? 's' : '' }} à poursuivre</p>
            </div>
          </div>
        }

        @if (main().length) {
          <section class="lu-section">
            <div class="lu-section-title">
              <h2>{{ mainTitle() }}</h2>
              <span class="lu-link" style="color: var(--lu-text-2)">{{ main().length }} quête{{ main().length > 1 ? 's' : '' }}</span>
            </div>
            @for (q of main(); track q.id) {
              <lu-quest-card [inst]="q" [rerollable]="true" (open)="open(q)" (primary)="primary(q)" (reroll)="reroll(q)" (redo)="redo(q)" />
            }
          </section>
        }

        @if (extras().length) {
          <section class="lu-section">
            <div class="lu-section-title">
              <h2>Mes ajouts</h2>
              <span class="lu-link" style="color: var(--lu-text-2)">{{ extras().length }} quête{{ extras().length > 1 ? 's' : '' }}</span>
            </div>
            <p class="small muted">Choisies dans le catalogue ou refaites : elles s’ajoutent à ton quota, sans pression. L’XP baisse un peu à chaque répétition.</p>
            @for (q of extras(); track q.id) {
              <lu-quest-card [inst]="q" (open)="open(q)" (primary)="primary(q)" (redo)="redo(q)" />
            }
          </section>
        }

        @if (optional().length) {
          <section class="lu-section">
            <div class="lu-section-title">
              <h2>{{ period() === 'daily' ? 'Un peu plus loin' : 'À accepter' }}</h2>
              <span class="lu-link" style="color: var(--lu-text-2)">{{ period() === 'daily' ? 'Quêtes libres' : 'Engagement' }}</span>
            </div>
            <p class="small muted">
              {{ period() === 'daily' ? 'Sans obligation, sans pression. À choisir quand tu en as envie.' : 'Accepter une quête crée un engagement : choisis celles qui te donnent envie.' }}
            </p>
            @for (q of optional(); track q.id) {
              <lu-quest-card [inst]="q" [rerollable]="true" (open)="open(q)" (primary)="primary(q)" (reroll)="reroll(q)" />
            }
          </section>
        }

        @if (!main().length && !optional().length) {
          @if (game.of(period()).length) {
            <lu-empty icon="search" title="Aucune quête ne correspond" text="Essaie d’effacer les filtres ou de modifier ta recherche." />
          } @else {
            @if (manual() && period() === 'daily') {
              <lu-empty icon="library" title="À toi de choisir" text="Tu as choisi de composer ta journée toi-même. Ouvre le catalogue et ajoute les quêtes qui te font envie." />
            } @else {
              <lu-empty icon="swords" title="Rien pour le moment" text="Les quêtes se renouvellent bientôt. Reviens bientôt !" />
            }
          }
        }

        <section class="lu-card flat recap">
          <div class="rr"><span>XP déjà gagnée sur la période</span><strong class="gold">{{ fmt(gained()) }} XP</strong></div>
          <div class="rr"><span>XP encore possible</span><strong>{{ fmt(remaining()) }} XP</strong></div>
        </section>

        <section class="lu-section">
          <button type="button" class="lu-btn" (click)="catalogue()"><lu-icon name="library" [size]="18" /> Ajouter une quête du catalogue</button>
          <button type="button" class="lu-btn light" (click)="forge()"><lu-icon name="plus" [size]="18" /> Créer ma propre quête</button>
          <p class="xs muted center">Simple · Compteur · Chronomètre · Checklist · Journal</p>
          @if (rerollInfo()) {
            <p class="xs dim center">{{ rerollInfo() }}</p>
          }
        </section>
      </div>
    </ion-content>
  `,
  styles: `
    .epic-hint, .countdown { display: flex; align-items: center; gap: 6px; margin-top: -10px; }
    .search { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px; border-radius: 16px; background: var(--lu-surface-2); border: 1px solid var(--lu-border); color: var(--lu-muted); }
    .inp { flex: 1; background: none; border: 0; outline: 0; color: var(--lu-text); font: 400 13px var(--lu-font-body); min-width: 0; }
    .inp::placeholder { color: var(--lu-dim); }
    .clr { background: none; border: 0; color: var(--lu-muted); display: grid; place-items: center; cursor: pointer; padding: 4px; }
    .filters { display: flex; gap: 8px; overflow-x: auto; margin: -8px calc(-1 * var(--lu-gutter)) 0; padding: 0 var(--lu-gutter) 2px; scrollbar-width: none; }
    .filters::-webkit-scrollbar { display: none; }
    .filters .lu-chip { cursor: pointer; height: 28px; flex: none; }
    .summary { flex-direction: row; align-items: center; gap: 14px; background: var(--lu-surface-2); }
    .ring { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: var(--lu-bg-2); border: 2px solid var(--lu-border-strong); font: 700 15px var(--lu-font-body); flex: none; }
    .ring.full { border-color: var(--lu-accent); color: var(--lu-accent); }
    .st { font-size: 19px; line-height: 1.25; }
    .recap { gap: 8px; }
    .rr { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--lu-text-2); }
    .rr strong { font-size: 14px; }
    .center { text-align: center; }
  `,
})
export class QuestBoardPage {
  protected game = inject(GameService);
  protected ui = inject(UiService);
  private sheet = inject(ActionSheetController);
  readonly fmt = fmt;
  readonly tabs = PERIODS;
  /** `?period=weekly` pour arriver directement sur un onglet */
  readonly periodParam = input<string | undefined>(undefined, { alias: 'period' });
  readonly period = signal<Period>('daily');
  readonly query = signal('');
  readonly abilityFilter = signal<AbilityId | null>(null);
  readonly diffFilter = signal<Difficulty | null>(null);
  readonly statusFilter = signal<StatusFilter>('all');

  readonly activeFilters = computed(() => !!this.abilityFilter() || !!this.diffFilter() || this.statusFilter() !== 'all');
  tabLabel = (p: Period) => PERIOD_TAB_LABEL[p];
  abLabel = (a: AbilityId) => ABILITY_LABEL[a];
  dfLabel = (d: Difficulty) => DIFFICULTY_LABEL[d];
  readonly statusLabelText = computed(() => ({ all: 'Statut', todo: 'À faire', done: 'Accomplies', proposed: 'Proposées' })[this.statusFilter()]);

  constructor() {
    queueMicrotask(() => {
      const p = this.periodParam();
      if (p && ['daily', 'weekly', 'monthly', 'epic'].includes(p)) this.period.set(p as Period);
    });
  }

  private matches(q: QuestInstance): boolean {
    const s = this.query().trim().toLowerCase();
    if (s && !(q.snapshot.title.toLowerCase().includes(s) || q.snapshot.objective.toLowerCase().includes(s) || q.snapshot.tags.some((t) => t.includes(s)))) return false;
    if (this.abilityFilter() && q.snapshot.ability !== this.abilityFilter()) return false;
    if (this.diffFilter() && q.snapshot.difficulty !== this.diffFilter()) return false;
    switch (this.statusFilter()) {
      case 'todo': return q.status === 'accepted';
      case 'done': return q.status === 'completed';
      case 'proposed': return q.status === 'proposed';
      default: return true;
    }
  }

  private order(q: QuestInstance): number {
    return q.status === 'accepted' ? (q.progress > 0 ? 0 : 1) : q.status === 'completed' ? 3 : 2;
  }

  readonly inPeriod = computed(() => this.game.of(this.period()).filter((q) => this.matches(q)));
  readonly main = computed(() =>
    this.inPeriod()
      .filter((q) => (this.period() === 'daily' ? !q.free : q.status !== 'proposed'))
      .sort((a, b) => this.order(a) - this.order(b)),
  );
  /** Quêtes ajoutées à la main ou refaites, hors quota (pour les autres périodes, elles sont déjà dans la liste principale). */
  readonly extras = computed(() => (this.period() === 'daily' ? this.inPeriod().filter((q) => !!q.free && q.status !== 'proposed').sort((a, b) => this.order(a) - this.order(b)) : []));
  readonly manual = computed(() => this.game.settings()?.dailyQuestCount === 0);
  readonly optional = computed(() => this.inPeriod().filter((q) => (this.period() === 'daily' ? !!q.free && q.status === 'proposed' : q.status === 'proposed')));
  readonly mainTitle = computed(() => {
    const p = this.period();
    if (p === 'daily') return longDate(this.game.today());
    return p === 'weekly' ? 'Cette semaine' : p === 'monthly' ? 'Ce mois-ci' : 'Ce trimestre';
  });
  readonly gained = computed(() => this.game.of(this.period()).filter((q) => q.status === 'completed').reduce((n, q) => n + q.xpAwarded, 0));
  readonly remaining = computed(() =>
    this.game.of(this.period()).filter((q) => q.status === 'accepted').reduce((n, q) => n + this.game.xpOf(q), 0),
  );
  readonly summaryTitle = computed(() => {
    const left = this.game.dailyLeft();
    const done = this.game.dailyDone();
    if (left === 0) return 'Journée accomplie';
    return done === 0 ? 'Rien de fait pour l’instant' : `${done} faite${done > 1 ? 's' : ''}, ${left} à faire`;
  });
  readonly renewal = computed(() => {
    const p = this.period();
    const today = this.game.today();
    if (p === 'daily') return `Renouvellement dans ${countdown(this.game.resetIn())}`;
    const b = periodBounds(p, today);
    const d = daysLeft(b.end, today);
    return `Fin ${p === 'weekly' ? 'de la semaine' : p === 'monthly' ? 'du mois' : 'du trimestre'} dans ${d} jour${d > 1 ? 's' : ''}`;
  });
  readonly rerollInfo = computed(() => {
    const c = this.game.character();
    if (!c) return '';
    const used = c.rerollsDate === this.game.today() ? c.rerollsUsed : 0;
    return used < 1 ? 'Relance : 1 gratuite aujourd’hui, puis 1 Inspiration.' : `Relance : ${c.inspiration} Inspiration disponible${c.inspiration > 1 ? 's' : ''}.`;
  });

  setPeriod(p: Period): void {
    this.period.set(p);
    void haptic('light');
  }
  clearFilters(): void {
    this.query.set('');
    this.abilityFilter.set(null);
    this.diffFilter.set(null);
    this.statusFilter.set('all');
  }

  async pickAbility(): Promise<void> {
    await this.choose('Caractéristique', [...ABILITIES.map((a) => ({ text: ABILITY_LABEL[a], v: a as string })), { text: 'Toutes', v: '' }], (v) => this.abilityFilter.set((v || null) as AbilityId | null));
  }
  async pickDifficulty(): Promise<void> {
    await this.choose('Difficulté', [...DIFFICULTIES.map((d) => ({ text: DIFFICULTY_LABEL[d], v: d as string })), { text: 'Toutes', v: '' }], (v) => this.diffFilter.set((v || null) as Difficulty | null));
  }
  async pickStatus(): Promise<void> {
    await this.choose('Statut', [{ text: 'À faire', v: 'todo' }, { text: 'Accomplies', v: 'done' }, { text: 'Proposées', v: 'proposed' }, { text: 'Tous', v: 'all' }], (v) => this.statusFilter.set(v as StatusFilter));
  }
  private async choose(header: string, options: { text: string; v: string }[], set: (v: string) => void): Promise<void> {
    const s = await this.sheet.create({
      header,
      cssClass: 'lu-sheet',
      buttons: [...options.map((o) => ({ text: o.text, handler: () => set(o.v) })), { text: 'Fermer', role: 'cancel' }],
    });
    await s.present();
  }

  open(q: QuestInstance): void {
    this.ui.go(['/quest', q.id]);
  }

  async primary(q: QuestInstance): Promise<void> {
    if (q.status === 'proposed') {
      if (await this.game.accept(q)) {
        void haptic('light');
        this.game.toast(`Quête acceptée : ${q.snapshot.title}`, 'success');
      }
      return;
    }
    if (q.status === 'accepted' && q.snapshot.validation.type === 'simple') {
      const r = await this.game.complete(q, {});
      if (r.ok) {
        playSound('xp', this.game.settings()?.sounds ?? true);
        void haptic('success');
        this.ui.go(['/quest', q.id]);
      } else this.game.toast(r.message ?? 'Impossible de valider.', 'error');
      return;
    }
    this.open(q);
  }

  catalogue(): void {
    this.ui.go('/grimoire', { queryParams: { for: this.period() } });
  }

  /** Refait une quête terminée : elle repart dans la période en cours. */
  async redo(q: QuestInstance): Promise<void> {
    const next = await this.game.redo(q);
    if (next) {
      void haptic('light');
      this.game.toast(`Quête relancée : ${q.snapshot.title}`, 'success');
    }
  }

  async reroll(q: QuestInstance): Promise<void> {
    await this.game.reroll(q);
  }

  forge(): void {
    if (this.game.unlocks().forge) this.ui.go('/forge');
    else this.game.toast('Créer ses propres quêtes s’ouvre au niveau 2.', 'info');
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.game.refresh();
    (ev.target as HTMLIonRefresherElement).complete();
  }
}
