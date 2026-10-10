import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ActionSheetController, IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular';
import {
  ABILITIES,
  ABILITY_LABEL,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  PERIOD_TAB_LABEL,
  daysLeft,
  periodBounds,
  type AbilityId,
  type Difficulty,
  type Period,
  type QuestInstance,
  type TrackState,
} from '@levelup/engine';
import { GameService } from '../../core/game.service';
import { UiService } from '../../core/ui.service';
import { haptic, playSound } from '../../core/feedback';
import { PageHeaderComponent, EmptyComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { QuestCardComponent } from '../../shared/quest-card.component';
import { TrackCardComponent } from '../../shared/track-card.component';
import { countdown, fmt, longDate } from '../../shared/format';
import { trackDef } from '../../shared/tracks';

type StatusFilter = 'all' | 'todo' | 'done' | 'proposed';
const PERIODS: Period[] = ['daily', 'weekly', 'monthly'];

@Component({
  selector: 'app-quest-board',
  imports: [IonContent, IonRefresher, IonRefresherContent, PageHeaderComponent, EmptyComponent, IconComponent, QuestCardComponent, TrackCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content>
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
            <button type="button" role="tab" [attr.aria-selected]="period() === 'epic'" [class.on]="period() === 'epic'" (click)="setPeriod('epic')">Épique</button>
          }
        </div>
        @if (!game.unlocks().epic) {
          <p class="xs dim epic-hint"><lu-icon name="lock" [size]="11" /> Épique : débloqué au niveau 11</p>
        }
        <p class="xs muted countdown"><lu-icon name="clock" [size]="12" /> {{ renewal() }}</p>

        @if (period() === 'daily') {
          <!-- Aujourd'hui : mes parcours -->
          <section class="lu-section" aria-labelledby="h-tracks">
            <div class="lu-section-title">
              <h2 id="h-tracks">Aujourd’hui, mes parcours</h2>
              <button type="button" class="lu-btn small ghost inline add" (click)="pickTracks()" aria-label="Ajouter ou gérer mes parcours"><lu-icon name="plus" [size]="15" /> Parcours</button>
            </div>

            @if (trackRows().length) {
              <div class="lu-card flat summary">
                <span class="ring" [class.full]="trackLeft() === 0" aria-hidden="true">{{ trackDone() }}/{{ trackRows().length }}</span>
                <div>
                  <h3 class="st">{{ summaryTitle() }}</h3>
                  <p class="xs muted">{{ streakText() }}</p>
                </div>
              </div>
              @for (r of trackRows(); track r.state.trackId) {
                <lu-track-card [state]="r.state" [quest]="r.quest" (open)="r.quest && open(r.quest)" (primary)="r.quest && primary(r.quest)" (manage)="manage(r.state)" (pause)="pause(r.state)" />
              }
            } @else if (game.showTracksIntro()) {
              <div class="lu-card intro" role="region" aria-labelledby="h-intro">
                <span class="lu-chip gold">Nouveau</span>
                <h3 id="h-intro" class="it">Nouveau : les parcours</h3>
                <p class="small">Tu choisis toi-même où tu évolues : jusqu’à 3 activités (musculation, espagnol, dessin…), chacune avec 10 échelons. Chaque jour, tu reçois la quête de ton échelon ; après 5 jours validés, tu montes. Pour souffler, tu mets un parcours en pause, sans pénalité.</p>
                <p class="small muted">Les quêtes tirées au sort ne sont plus imposées : elles deviennent des propositions facultatives, « Pour aller plus loin ».</p>
                @if (suggestions().length) {
                  <div class="sugg">
                    <p class="xs muted">D’après tes centres d’intérêt, on te propose :</p>
                    <ul class="chips" aria-label="Parcours proposés">
                      @for (d of suggestions(); track d.id) {
                        <li class="lu-chip mint">{{ d.label }}</li>
                      }
                    </ul>
                  </div>
                }
                <button type="button" class="lu-btn mint" (click)="introPick()">Choisir mes parcours</button>
                <button type="button" class="lu-btn text" (click)="game.dismissTracksIntro()">Plus tard</button>
              </div>
            } @else {
              <div class="lu-card flat">
                <lu-empty icon="compass" title="Choisis où tu veux progresser" text="Un parcours, c’est une activité (musculation, espagnol, dessin…) avec 10 échelons. Chaque jour, tu reçois la quête de ton échelon ; après 5 jours validés, tu montes. Jusqu’à 3 parcours à la fois.">
                  <button type="button" class="lu-btn mint" (click)="pickTracks()">Choisir mes parcours</button>
                </lu-empty>
              </div>
            }

            @if (game.pausedTracks().length) {
              <div class="paused" role="group" aria-label="Parcours en pause">
                <h3 class="sub">En pause</h3>
                @for (s of game.pausedTracks(); track s.trackId) {
                  <div class="prow">
                    <div class="ptxt"><strong>{{ labelOf(s) }}</strong><span class="xs muted">Échelon {{ s.rung }} gardé, sans pénalité</span></div>
                    <button type="button" class="lu-btn small ghost" [disabled]="!game.canAddTrack()" (click)="resume(s)" [attr.aria-label]="'Reprendre le parcours ' + labelOf(s)">
                      <lu-icon name="play" [size]="15" /> Reprendre
                    </button>
                  </div>
                }
                @if (!game.canAddTrack()) {
                  <p class="xs muted">Tu as déjà {{ game.maxTracks }} parcours actifs : mets-en un en pause ou arrête-en un pour reprendre celui-ci.</p>
                }
              </div>
            }
          </section>

          <!-- Quêtes imposées d'avant la mise à jour, encore en cours aujourd'hui -->
          @if (legacy().length) {
            <section class="lu-section" aria-labelledby="h-legacy">
              <div class="lu-section-title">
                <h2 id="h-legacy">Quêtes en cours</h2>
                <span class="lu-link" style="color: var(--lu-text-2)">{{ legacy().length }} quête{{ legacy().length > 1 ? 's' : '' }}</span>
              </div>
              <p class="small muted">Tirées avant la mise à jour : tu peux les terminer, mais elles ne comptent pas pour ta série ni pour tes échelons.</p>
              @for (q of legacy(); track q.id) {
                <lu-quest-card [inst]="q" (open)="open(q)" (primary)="primary(q)" (redo)="redo(q)" />
              }
            </section>
          }

          <!-- Pour aller plus loin -->
          @if (optional().length) {
            <section class="lu-section" aria-labelledby="h-more">
              <div class="lu-section-title">
                <h2 id="h-more">Pour aller plus loin</h2>
                <span class="lu-link" style="color: var(--lu-text-2)">Facultatif</span>
              </div>
              <p class="small muted">Sans pression : aucune pénalité, et ces quêtes ne comptent ni pour ta série ni pour tes échelons. Elles visent plutôt tes caractéristiques les plus basses.</p>
              @for (q of optional(); track q.id) {
                <lu-quest-card [inst]="q" [rerollable]="true" [note]="bonusNote(q)" (open)="open(q)" (primary)="primary(q)" (reroll)="reroll(q)" />
              }
              @if (rerollInfo()) {
                <p class="xs dim">{{ rerollInfo() }}</p>
              }
            </section>
          }

          @if (extras().length) {
            <section class="lu-section" aria-labelledby="h-extras">
              <div class="lu-section-title">
                <h2 id="h-extras">Mes ajouts</h2>
                <span class="lu-link" style="color: var(--lu-text-2)">{{ extras().length }} quête{{ extras().length > 1 ? 's' : '' }}</span>
              </div>
              <p class="small muted">Choisies dans le catalogue, refaites ou acceptées : elles s’ajoutent à tes parcours, sans pression. L’XP baisse un peu à chaque répétition.</p>
              @for (q of extras(); track q.id) {
                <lu-quest-card [inst]="q" (open)="open(q)" (primary)="primary(q)" (redo)="redo(q)" />
              }
            </section>
          }
        } @else {
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

          @if (optional().length) {
            <section class="lu-section">
              <div class="lu-section-title">
                <h2>À accepter</h2>
                <span class="lu-link" style="color: var(--lu-text-2)">Engagement</span>
              </div>
              <p class="small muted">Accepter une quête crée un engagement : choisis celles qui te donnent envie.</p>
              @for (q of optional(); track q.id) {
                <lu-quest-card [inst]="q" [rerollable]="true" (open)="open(q)" (primary)="primary(q)" (reroll)="reroll(q)" />
              }
            </section>
          }

          @if (!main().length && !optional().length) {
            @if (game.of(period()).length) {
              <lu-empty icon="search" title="Aucune quête ne correspond" text="Essaie d’effacer les filtres ou de modifier ta recherche." />
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
    .add { min-height: 44px; }
    .summary { flex-direction: row; align-items: center; gap: 14px; background: var(--lu-surface-2); }
    .ring { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; background: var(--lu-bg-2); border: 2px solid var(--lu-border-strong); font: 700 15px var(--lu-font-body); flex: none; }
    .ring.full { border-color: var(--lu-accent); color: var(--lu-accent); }
    .st { font-size: 19px; line-height: 1.25; }
    .sub { font: 700 11px var(--lu-font-body); letter-spacing: 0.08em; text-transform: uppercase; color: var(--lu-text-2); margin: 0; }
    .paused { display: flex; flex-direction: column; gap: 8px; }
    .prow { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 16px; border: 1px dashed var(--lu-border-strong); }
    .ptxt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .ptxt strong { font-size: 14px; }
    .prow .lu-btn { min-height: 44px; }
    .intro { gap: 12px; border-color: var(--lu-accent); }
    .intro .lu-chip { align-self: flex-start; }
    .it { font-size: 20px; line-height: 1.25; margin: 0; }
    .sugg { display: flex; flex-direction: column; gap: 6px; }
    .chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
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
  tabLabel = (p: Period) => (p === 'daily' ? 'Aujourd’hui' : PERIOD_TAB_LABEL[p]);
  abLabel = (a: AbilityId) => ABILITY_LABEL[a];
  dfLabel = (d: Difficulty) => DIFFICULTY_LABEL[d];
  labelOf = (s: TrackState) => trackDef(s.trackId)?.label ?? 'Parcours';
  readonly statusLabelText = computed(() => ({ all: 'Statut', todo: 'À faire', done: 'Accomplies', proposed: 'Proposées' })[this.statusFilter()]);

  constructor() {
    queueMicrotask(() => {
      const p = this.periodParam();
      if (p && ['daily', 'weekly', 'monthly', 'epic'].includes(p)) this.period.set(p as Period);
    });
  }

  // ───── parcours du jour

  /** Une ligne par parcours actif, avec sa quête du jour. */
  readonly trackRows = computed(() => this.game.activeTracks().map((state) => ({ state, quest: this.game.trackQuestToday(state.trackId) ?? null })));
  readonly trackDone = computed(() => this.trackRows().filter((r) => r.quest?.status === 'completed').length);
  readonly trackLeft = computed(() => this.trackRows().length - this.trackDone());
  readonly summaryTitle = computed(() => {
    const left = this.trackLeft();
    const done = this.trackDone();
    if (left === 0) return 'Parcours du jour validés';
    return done === 0 ? 'Rien de validé pour l’instant' : `${done} validé${done > 1 ? 's' : ''}, ${left} à faire`;
  });
  readonly streakText = computed(() => {
    const n = this.game.character()?.streakCurrent ?? 0;
    return `Série : ${n} jour${n > 1 ? 's' : ''} avec un parcours validé`;
  });

  // ───── quêtes facultatives et autres périodes

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
  /** Hebdo / mensuel / épique : les quêtes engagées. (Le jour n'a plus de liste « imposée » : ce sont les parcours.) */
  readonly main = computed(() =>
    this.period() === 'daily' ? [] : this.inPeriod().filter((q) => q.status !== 'proposed').sort((a, b) => this.order(a) - this.order(b)),
  );
  /** Ajouts du joueur et quêtes de parcours dont le parcours n'est plus actif (pause, arrêt) : elles restent visibles. */
  readonly extras = computed(() => {
    const active = new Set(this.game.activeTracks().map((t) => t.trackId));
    return this.game
      .of('daily')
      .filter((q) => (q.free && q.origin !== 'track' && q.status !== 'proposed') || (q.origin === 'track' && !!q.trackId && !active.has(q.trackId)))
      .sort((a, b) => this.order(a) - this.order(b));
  });
  /**
   * Joueurs existants : les quêtes du jour tirées avant la mise à jour (ni libres, ni de parcours) restent à faire ou à
   * terminer. Sans cette liste elles seraient invisibles alors que le moteur les connaît encore.
   */
  readonly legacy = computed(() =>
    this.game
      .of('daily')
      .filter((q) => !q.free && q.origin !== 'track' && !q.trackId && ['accepted', 'proposed', 'completed'].includes(q.status))
      .sort((a, b) => this.order(a) - this.order(b)),
  );
  readonly suggestions = this.game.trackSuggestions;
  readonly optional = computed(() =>
    this.period() === 'daily' ? this.game.of('daily').filter((q) => !!q.free && q.origin !== 'track' && q.status === 'proposed') : this.inPeriod().filter((q) => q.status === 'proposed'),
  );
  readonly mainTitle = computed(() => {
    const p = this.period();
    if (p === 'daily') return longDate(this.game.today());
    return p === 'weekly' ? 'Cette semaine' : p === 'monthly' ? 'Ce mois-ci' : 'Ce trimestre';
  });
  readonly gained = computed(() => this.game.of(this.period()).filter((q) => q.status === 'completed').reduce((n, q) => n + q.xpAwarded, 0));
  readonly remaining = computed(() =>
    this.game.of(this.period()).filter((q) => q.status === 'accepted').reduce((n, q) => n + this.game.xpOf(q), 0),
  );
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

  /** Bonus de rattrapage ou malus de spécialisation annoncé par le moteur (« +50 % XP en rattrapage »), sinon rien. */
  bonusNote(q: QuestInstance): string | null {
    return this.game.balanceLabel(q);
  }

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
    // Une quête de parcours « simple » se valide directement depuis sa proposition ; les autres s'acceptent d'abord.
    const direct = q.origin === 'track' && q.snapshot.validation.type === 'simple';
    if (q.status === 'proposed' && !direct) {
      if (await this.game.accept(q)) {
        void haptic('light');
        this.game.toast(`Quête acceptée : ${q.snapshot.title}`, 'success');
      }
      return;
    }
    if ((q.status === 'accepted' || (direct && q.status === 'proposed')) && q.snapshot.validation.type === 'simple') {
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

  pickTracks(): void {
    this.ui.go('/tracks');
  }

  /** Depuis la carte « Nouveau : les parcours » : l'écran de choix, avec les parcours déduits des anciens centres d'intérêt. */
  introPick(): void {
    if (this.suggestions().length) this.ui.go('/tracks', { queryParams: { suggest: 1 } });
    else this.pickTracks();
  }

  async pause(s: TrackState): Promise<void> {
    await this.game.pauseTrack(s.trackId, true);
  }

  /** Menu d'un parcours : pause (l'échelon est gardé) ou arrêt. */
  async manage(s: TrackState): Promise<void> {
    const label = this.labelOf(s);
    const v = await this.ui.choose(`Parcours : ${label}`, [
      { text: 'Mettre en pause (je garde mon échelon)', value: 'pause' },
      { text: 'Arrêter ce parcours', value: 'stop' },
      { text: 'Choisir d’autres parcours', value: 'pick' },
    ]);
    if (v === 'pause') await this.game.pauseTrack(s.trackId, true);
    else if (v === 'stop') await this.ui.stopTrack(s.trackId);
    else if (v === 'pick') this.pickTracks();
  }

  async resume(s: TrackState): Promise<void> {
    await this.game.pauseTrack(s.trackId, false);
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
