import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActionSheetController, IonContent } from '@ionic/angular';
import {
  ABILITY_LABEL,
  DIFFICULTY_LABEL,
  PERIOD_LABEL,
  abilityProgressOf,
  canUndo,
  isReadyToComplete,
  lastAcceptDate,
  progressRatio,
  questXp,
  validationTarget,
  type QuestInstance,
} from '@levelup/engine';
import { GameService } from '../../core/game.service';
import { SocialService } from '../../core/social.service';
import { UiService } from '../../core/ui.service';
import { haptic, playSound } from '../../core/feedback';
import type { PickedPhoto } from '../../core/photo';
import { BarComponent, PageHeaderComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { ShareFormComponent, type ShareDraft } from '../../shared/share-card.component';
import { fmt, longDate, timeOfDay } from '../../shared/format';
import { sharesText, themeLabel } from '../../shared/themes';
import { PostQueue } from '../../core/post-queue';

interface TimerState {
  startedAt: number | null;
  accumulated: number;
}

const timerKey = (id: string) => `lu-timer-${id}`;

@Component({
  selector: 'app-quest-detail',
  imports: [IonContent, PageHeaderComponent, BarComponent, IconComponent, ShareFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      @if (inst(); as q) {
        <lu-page-header [back]="true" [eyebrow]="'Quêtes / Quête ' + periodNoun()" [title]="q.snapshot.title">
          <div actions>
            <button type="button" class="lu-icon-btn" aria-label="Plus d’options" (click)="menu()"><lu-icon name="ellipsis" [size]="17" /></button>
          </div>
        </lu-page-header>

        <div class="lu-page">
          <div class="chips">
            <span class="lu-chip"><i class="dot" [style.background]="color()"></i>{{ abilityLabel() }}</span>
            <span class="lu-chip">{{ difficultyLabel() }}</span>
            <span class="lu-chip gold">{{ q.status === 'completed' ? '+' + fmt(q.xpAwarded) : '+' + fmt(xp().total) }} XP</span>
            <span class="lu-chip">{{ periodLabel() }}</span>
            @if (themeName()) { <span class="lu-chip">{{ themeName() }}</span> }
          </div>
          @if (shares()) { <p class="xs muted shares">XP répartie : {{ shares() }}</p> }

          @if (estimate()) {
            <p class="est"><lu-icon name="footprints" [size]="14" /> {{ estimate() }}</p>
          }

          <section class="lu-section">
            <div class="lu-section-title"><h2>Détails</h2></div>
            <p class="lu-lead flavor">{{ q.snapshot.flavor }}</p>
            <div class="goal">
              <span class="lab">TON OBJECTIF</span>
              <p>{{ q.snapshot.objective }}</p>
            </div>
            @if (q.snapshot.tips.length) {
              <ul class="tips">
                @for (t of q.snapshot.tips; track t) {
                  <li><lu-icon name="sparkles" [size]="13" /> {{ t }}</li>
                }
              </ul>
            }
          </section>

          <!-- Validation -->
          @if (q.status === 'proposed') {
            <section class="lu-card">
              <h3 class="sec">Cette quête t’attend</h3>
              <p class="small muted">Accepte-la pour t’engager : elle apparaîtra dans tes quêtes en cours{{ acceptDeadline() }}.</p>
              <button type="button" class="lu-btn" (click)="accept()"><lu-icon name="check" [size]="17" /> Accepter cette quête</button>
            </section>
          } @else if (q.status === 'expired' || q.status === 'abandoned') {
            <section class="lu-card flat"><p class="small muted">Cette quête est {{ q.status === 'expired' ? 'expirée' : 'abandonnée' }}. Elle rapporte 0 XP, mais ne t’en retire pas.</p></section>
          } @else {
            <section class="lu-card">
              <div class="vhead">
                <strong class="vmode">{{ modeLabel() }}</strong>
                <span class="lu-chip" [class.mint]="done() || ready()">{{ done() ? 'Accomplie' : ready() ? 'Objectif atteint' : 'En cours' }}</span>
              </div>

              @switch (q.snapshot.validation.type) {
                @case ('counter') {
                  <div class="counter">
                    <button type="button" class="rb" [disabled]="done() || count() <= 0" (click)="step(-stepSize())" [attr.aria-label]="stepSize() > 1 ? 'Moins ' + stepSize() + ' minutes' : 'Moins'"><lu-icon name="minus" [size]="18" /></button>
                    <div class="cv">
                      <span class="num">{{ count() }} / {{ target() }}</span>
                      <span class="unit">{{ unit() }}</span>
                    </div>
                    <button type="button" class="rb" [disabled]="done()" (click)="step(stepSize())" [attr.aria-label]="stepSize() > 1 ? 'Plus ' + stepSize() + ' minutes' : 'Plus'"><lu-icon name="plus" [size]="18" /></button>
                  </div>
                  <lu-bar [value]="count()" [max]="target()" />
                }
                @case ('timer') {
                  <div class="timer">
                    <svg viewBox="0 0 140 140" class="ring" aria-hidden="true">
                      <circle cx="70" cy="70" r="62" fill="none" stroke="var(--lu-track)" stroke-width="9" />
                      <circle cx="70" cy="70" r="62" fill="none" stroke="var(--lu-accent)" stroke-width="9" stroke-linecap="round" [attr.stroke-dasharray]="389.6" [attr.stroke-dashoffset]="389.6 * (1 - timerRatio())" transform="rotate(-90 70 70)" />
                    </svg>
                    <div class="tv" role="timer" [attr.aria-label]="timerText() + ' restantes'">
                      <span class="num">{{ timerText() }}</span>
                      <span class="unit">{{ done() ? 'terminé' : timer().startedAt ? 'en cours…' : 'restantes' }}</span>
                    </div>
                  </div>
                  @if (!done()) {
                    <div class="trow">
                      @if (!timerDone()) {
                        <button type="button" class="lu-btn" (click)="toggleTimer()"><lu-icon [name]="timer().startedAt ? 'pause' : 'play'" [size]="17" /> {{ timer().startedAt ? 'Pause' : timer().accumulated > 0 ? 'Reprendre' : 'Démarrer' }}</button>
                        <button type="button" class="lu-btn ghost inline" (click)="resetTimer()" aria-label="Remettre à zéro"><lu-icon name="undo" [size]="17" /></button>
                      }
                    </div>
                  }
                  <p class="xs muted center">Le minuteur continue même écran éteint.</p>
                }
                @case ('steps') {
                  <ul class="steps">
                    @for (s of steps(); track $index; let i = $index) {
                      <li>
                        <button type="button" class="chk" [class.on]="stepsDone()[i]" [disabled]="done()" (click)="toggleStep(i)" [attr.aria-pressed]="stepsDone()[i]">
                          @if (stepsDone()[i]) { <lu-icon name="check" [size]="13" [stroke]="3" /> }
                        </button>
                        <span [class.struck]="stepsDone()[i]">{{ s }}</span>
                      </li>
                    }
                  </ul>
                  <lu-bar [value]="stepsCount()" [max]="steps().length" />
                }
                @case ('journal') {
                  <div class="lu-field">
                    <textarea class="lu-input area" rows="5" [disabled]="done()" [value]="journal()" (input)="journal.set($any($event.target).value)" placeholder="Écris ici, sans te corriger…" aria-label="Ton journal"></textarea>
                    <span class="hint">{{ journal().trim().length }} / {{ minChars() }} caractères minimum</span>
                  </div>
                }
                @default {
                  <p class="small muted">Un seul geste : quand c’est fait, valide.</p>
                }
              }

              @if (!done() && type() !== 'journal') {
                <div class="lu-field">
                  <label for="nt">Comment ça s’est passé ? · facultatif</label>
                  <input id="nt" class="lu-input" maxlength="200" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Une note pour ton historique…" />
                </div>
              }
              @if (done()) {
                <div class="okbox"><lu-icon name="circle-check" [size]="18" /> Quête accomplie à {{ doneAt() }}</div>
              } @else {
                @if (!isSimple()) {
                  <div class="hint-xp">{{ xpFormula() }}</div>
                }
                @if (inspiration() > 0) {
                  <label class="insp">
                    <button type="button" class="lu-switch" role="switch" [attr.aria-checked]="useInsp()" (click)="useInsp.set(!useInsp())" aria-label="Utiliser une Inspiration"></button>
                    <span>Utiliser 1 Inspiration pour doubler l’XP <em>({{ inspiration() }} disponible{{ inspiration() > 1 ? 's' : '' }})</em></span>
                  </label>
                }
                <button type="button" class="lu-btn mint" [disabled]="!ready() || busy()" (click)="validate()">
                  <lu-icon name="check" [size]="18" /> {{ isSimple() ? 'Accomplir' : 'Valider ma quête' }}
                </button>
              }
            </section>
          }

          <!-- Récompense -->
          @if (done()) {
            <section class="lu-card gold reward pop">
              <div class="gain">
                <lu-icon name="sparkles" [size]="30" />
                <div>
                  <span class="gtitle">+{{ fmt(q.xpAwarded) }} XP gagnés</span>
                  @if (completion(); as c) {
                    @if (c.data.breakdown.mastery) { <span class="xs">dont maîtrise +{{ c.data.breakdown.mastery }}</span> }
                  }
                </div>
              </div>
              <p class="xs">{{ abilityLabel() }} +{{ fmt(q.xpAwarded) }} XP · {{ fmt(abilityNow().current) }} / {{ fmt(abilityNow().needed) }} XP</p>
              <p class="xs">Après validation : {{ fmt(game.levelInfo().current) }} / {{ fmt(game.levelInfo().needed) }} XP · Niveau {{ game.level() }}</p>
              <lu-bar [value]="game.levelInfo().ratio" tone="gold" />
              @if (allDailyDone()) {
                <p class="small">Tes {{ game.dailies().length }} quêtes du jour sont accomplies. Bravo !</p>
              }
              @if (completion()?.provisional) {
                <p class="xs">XP provisoire : elle sera confirmée au retour du réseau.</p>
              }
            </section>

            @if (!shared()) {
              <section class="lu-section">
                <div class="lu-section-title"><h2>Partager avec tes amis</h2></div>
                <lu-share-form [initialText]="shareSeed()" (change)="draft.set($event)" />
                <button type="button" class="lu-btn light" [disabled]="busy()" (click)="share()"><lu-icon name="send" [size]="17" /> Partager avec tes amis</button>
                <button type="button" class="lu-btn text" (click)="finish()">Garder pour moi et revenir aux quêtes</button>
              </section>
            } @else {
              <p class="small muted center">Partagé avec tes amis. Merci d’encourager les autres !</p>
            }

            @if (undoable()) {
              <button type="button" class="lu-btn ghost small inline" style="align-self: center" (click)="undo()"><lu-icon name="undo2" [size]="15" /> Annuler cette validation (24 h)</button>
            }
          }
        </div>
      } @else {
        <lu-page-header [back]="true" eyebrow="Quêtes" title="Quête introuvable" />
        <div class="lu-page"><p class="muted">Cette quête n’est plus disponible.</p></div>
      }
    </ion-content>
  `,
  styles: `
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .est { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--lu-muted); }
    .flavor { font-style: italic; font-family: var(--lu-font-title); }
    .goal { padding: 14px; border-radius: 12px; background: var(--lu-surface-2); border: 1px solid var(--lu-border); display: flex; flex-direction: column; gap: 6px; }
    .goal .lab { font-size: 10px; font-weight: 700; letter-spacing: .08em; color: var(--lu-text-2); }
    .goal p { font-size: 13px; line-height: 1.5; font-weight: 500; }
    .tips { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .tips li { display: flex; gap: 8px; font-size: 12px; line-height: 1.45; color: var(--lu-muted); }
    .tips lu-icon { color: var(--lu-gold); margin-top: 2px; }
    .sec { font-size: 19px; }
    .vhead { display: flex; align-items: center; justify-content: space-between; }
    .vmode { font-size: 12px; }
    .counter { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
    .rb { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--lu-border-strong); background: var(--lu-surface-2); color: var(--lu-text); display: grid; place-items: center; cursor: pointer; }
    .rb:disabled { opacity: .35; }
    .cv, .tv { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .num { font-family: var(--lu-font-title); font-size: 42px; line-height: 1.1; }
    .unit { font-size: 11px; color: var(--lu-muted); }
    .timer { position: relative; display: grid; place-items: center; margin: 6px auto; width: 190px; height: 190px; }
    .ring { position: absolute; inset: 0; width: 100%; height: 100%; }
    .timer .num { font-size: 40px; font-variant-numeric: tabular-nums; }
    .trow { display: flex; gap: 10px; }
    .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .steps li { display: flex; align-items: center; gap: 12px; font-size: 14px; }
    .chk { width: 28px; height: 28px; border-radius: 50%; border: 1.5px solid var(--lu-border-strong); background: var(--lu-surface-2); color: var(--lu-accent-ink); display: grid; place-items: center; cursor: pointer; flex: none; padding: 0; }
    .chk.on { background: var(--lu-accent); border-color: var(--lu-accent); }
    .struck { text-decoration: line-through; opacity: .65; }
    .okbox { display: flex; justify-content: center; align-items: center; gap: 8px; min-height: 42px; border-radius: 14px; background: var(--lu-surface-2); border: 1px solid var(--lu-border); font-size: 13px; font-weight: 600; color: var(--lu-accent); }
    .hint-xp { font-size: 11px; color: var(--lu-muted); text-align: center; }
    .insp { display: flex; align-items: center; gap: 12px; font-size: 12px; cursor: pointer; }
    .insp em { font-style: normal; color: var(--lu-muted); }
    .reward { padding: 20px; gap: 12px; }
    .gain { display: flex; align-items: center; gap: 12px; color: var(--lu-gold); }
    .gtitle { display: block; font-family: var(--lu-font-title); font-size: 30px; line-height: 1.2; color: var(--lu-text); }
    .reward .xs { color: var(--lu-text-2); }
    .center { text-align: center; }
  `,
})
export class QuestDetailPage {
  readonly id = input.required<string>();
  protected game = inject(GameService);
  protected ui = inject(UiService);
  private social = inject(SocialService);
  private queue = inject(PostQueue);
  private sheet = inject(ActionSheetController);
  private destroyRef = inject(DestroyRef);
  readonly fmt = fmt;

  readonly inst = computed<QuestInstance | undefined>(() => this.game.instance(this.id()));
  readonly busy = signal(false);
  readonly useInsp = signal(false);
  readonly journal = signal('');
  readonly note = signal('');
  readonly localCount = signal(0);
  readonly localSteps = signal<boolean[]>([]);
  readonly timer = signal<TimerState>({ startedAt: null, accumulated: 0 });
  readonly tick = signal(Date.now());
  readonly draft = signal<ShareDraft>({ text: '', visibility: 'friends', photos: [] });
  readonly shared = signal(false);
  private tickTimer = setInterval(() => this.tick.set(Date.now()), 500);
  private autoSaved = false;

  readonly periodNoun = computed(() => ({ daily: 'du jour', weekly: 'de la semaine', monthly: 'du mois', epic: 'épique' })[this.inst()?.period ?? 'daily']);
  readonly abilityLabel = computed(() => ABILITY_LABEL[this.inst()!.snapshot.ability]);
  readonly difficultyLabel = computed(() => DIFFICULTY_LABEL[this.inst()!.snapshot.difficulty]);
  readonly themeName = computed(() => themeLabel(this.inst()?.snapshot.theme));
  readonly shares = computed(() => {
    const s = this.inst()?.snapshot;
    return s?.secondary?.length ? sharesText(s.ability, s.secondary) : '';
  });
  readonly periodLabel = computed(() => PERIOD_LABEL[this.inst()!.period]);
  readonly color = computed(() => `var(--lu-${this.inst()!.snapshot.ability.toLowerCase()})`);
  readonly done = computed(() => this.inst()?.status === 'completed');
  readonly type = computed(() => this.inst()?.snapshot.validation.type ?? 'simple');
  readonly isSimple = computed(() => this.type() === 'simple');
  readonly target = computed(() => (this.inst() ? validationTarget(this.inst()!.snapshot.validation) : 1));
  readonly unit = computed(() => {
    const v = this.inst()?.snapshot.validation;
    return v?.type === 'counter' ? v.unit : v?.type === 'timer' ? 'minutes' : '';
  });
  readonly steps = computed(() => {
    const v = this.inst()?.snapshot.validation;
    return v?.type === 'steps' ? v.steps : [];
  });
  readonly minChars = computed(() => {
    const v = this.inst()?.snapshot.validation;
    return v?.type === 'journal' ? v.minChars ?? 50 : 50;
  });
  readonly count = computed(() => (this.done() ? this.target() : this.localCount()));
  readonly stepsDone = computed(() => (this.done() ? this.steps().map(() => true) : this.localSteps()));
  readonly stepsCount = computed(() => this.stepsDone().filter(Boolean).length);
  readonly estimate = computed(() => {
    const v = this.inst()?.snapshot.validation;
    return v?.type === 'timer' ? `${v.minutes} min pour toi` : v?.type === 'counter' && v.unit.startsWith('minute') ? `${v.target} min pour toi` : '';
  });
  readonly modeLabel = computed(
    () => ({ simple: 'Une seule étape', counter: this.unit() ? `Compteur de ${this.unit()}` : 'Compteur', timer: 'Chronomètre', steps: 'Check-list', journal: 'Journal' })[this.type()],
  );
  readonly inspiration = computed(() => this.game.character()?.inspiration ?? 0);

  readonly xp = computed(() => {
    const q = this.inst()!;
    const c = this.game.character();
    return questXp({
      difficulty: q.snapshot.difficulty, period: q.period, ability: q.snapshot.ability, level: c?.level ?? 1,
      masteries: this.game.masteries(), pathAbility: this.game.pathAbility(), doubled: this.useInsp(),
    });
  });
  readonly xpFormula = computed(() => {
    const x = this.xp();
    let s = `${x.base} × ${x.multiplier}`;
    if (x.mastery) s += ` + maîtrise ${x.mastery}`;
    if (x.affinity) s += ` + voie ${x.affinity}`;
    s = `${s} = ${x.doubled ? x.total / 2 : x.total} XP`;
    return x.doubled ? `(${s}) × 2 = ${x.total} XP` : s;
  });

  // Chronomètre : durée restante calculée à partir de l'horodatage de départ (fiable écran éteint).
  readonly elapsedMs = computed(() => {
    const t = this.timer();
    return t.accumulated + (t.startedAt ? this.tick() - t.startedAt : 0);
  });
  readonly timerDone = computed(() => this.type() === 'timer' && this.elapsedMs() >= this.target() * 60000);
  readonly timerRatio = computed(() => (this.done() ? 1 : Math.min(this.elapsedMs() / (this.target() * 60000 || 1), 1)));
  readonly timerText = computed(() => {
    const left = Math.max(this.target() * 60000 - this.elapsedMs(), 0);
    const s = Math.ceil(left / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });

  readonly ready = computed(() => {
    const q = this.inst();
    if (!q || q.status !== 'accepted') return false;
    const merged = {
      snapshot: q.snapshot,
      progress: this.type() === 'timer' ? Math.min(this.elapsedMs() / 60000, this.target()) : this.localCount(),
      stepsDone: this.localSteps(),
    };
    return isReadyToComplete(merged, this.journal()) === null;
  });

  readonly completion = computed(() => {
    const c = this.game.lastCompletion();
    return c && c.instanceId === this.id() ? c : null;
  });
  readonly abilityNow = computed(() => abilityProgressOf(this.game.character()!, this.inst()!.snapshot.ability));
  readonly allDailyDone = computed(() => this.inst()?.period === 'daily' && this.game.dailies().length > 0 && this.game.dailyLeft() === 0);
  readonly undoable = computed(() => canUndo(this.inst()?.completedAt, this.game.now()));
  readonly doneAt = computed(() => (this.inst()?.completedAt ? timeOfDay(this.inst()!.completedAt!) : ''));
  readonly shareSeed = computed(() => (this.type() === 'journal' ? '' : ''));

  readonly acceptDeadline = computed(() => {
    const q = this.inst();
    if (!q || q.period === 'daily') return '';
    return ` jusqu’au ${longDate(lastAcceptDate(q.period, q.periodStart, q.periodEnd)).toLowerCase()}`;
  });

  constructor() {
    // Initialise l'état local quand la quête change.
    effect(() => {
      const q = this.inst();
      if (!q) return;
      untracked(() => {
        this.localCount.set(Math.round(q.progress));
        this.localSteps.set(q.stepsDone ?? this.steps().map(() => false));
        this.autoSaved = false;
        if (q.snapshot.validation.type === 'timer') {
          try {
            const raw = localStorage.getItem(timerKey(q.id));
            this.timer.set(raw ? JSON.parse(raw) : { startedAt: null, accumulated: q.progress * 60000 });
          } catch {
            this.timer.set({ startedAt: null, accumulated: q.progress * 60000 });
          }
        }
      });
    });
    // Fin du minuteur : son, vibration, progression enregistrée.
    effect(() => {
      if (!this.timerDone() || this.done() || this.autoSaved) return;
      untracked(() => {
        this.autoSaved = true;
        const t = this.timer();
        const acc = t.accumulated + (t.startedAt ? Date.now() - t.startedAt : 0);
        this.timer.set({ startedAt: null, accumulated: acc });
        this.persistTimer();
        playSound('xp', this.game.settings()?.sounds ?? true);
        void haptic('success');
        const q = this.inst();
        if (q) void this.game.setProgress(q, { progress: this.target() });
      });
    });
    this.destroyRef.onDestroy(() => clearInterval(this.tickTimer));
  }

  private persistTimer(): void {
    try {
      localStorage.setItem(timerKey(this.id()), JSON.stringify(this.timer()));
    } catch {
      /* ignore */
    }
  }

  toggleTimer(): void {
    const t = this.timer();
    if (t.startedAt) this.timer.set({ startedAt: null, accumulated: t.accumulated + (Date.now() - t.startedAt) });
    else this.timer.set({ startedAt: Date.now(), accumulated: t.accumulated });
    this.persistTimer();
    void haptic('light');
    const q = this.inst();
    if (q && !this.timer().startedAt) void this.game.setProgress(q, { progress: Math.round((this.timer().accumulated / 60000) * 10) / 10 });
  }

  resetTimer(): void {
    this.timer.set({ startedAt: null, accumulated: 0 });
    this.autoSaved = false;
    this.persistTimer();
    const q = this.inst();
    if (q) void this.game.setProgress(q, { progress: 0 });
  }

  /** Compteurs en minutes : on avance par paliers de 5 (15 pour les gros objectifs) plutôt que d’un seul tap par minute. */
  readonly stepSize = computed(() => {
    const v = this.inst()?.snapshot.validation;
    if (v?.type !== 'counter' || !v.unit.startsWith('minute')) return 1;
    return v.target >= 300 ? 15 : 5;
  });

  step(delta: number): void {
    const next = Math.min(Math.max(this.localCount() + delta, 0), this.target());
    this.localCount.set(next);
    void haptic('light');
    const q = this.inst();
    if (q) void this.game.setProgress(q, { progress: next });
  }

  toggleStep(i: number): void {
    const next = [...this.localSteps()];
    next[i] = !next[i];
    this.localSteps.set(next);
    void haptic('light');
    const q = this.inst();
    if (q) void this.game.setProgress(q, { stepsDone: next });
  }

  async accept(): Promise<void> {
    const q = this.inst();
    if (!q) return;
    if (await this.game.accept(q)) {
      this.game.toast('Quête acceptée.', 'success');
      void haptic('light');
    }
  }

  async validate(): Promise<void> {
    const q = this.inst();
    if (!q || this.busy()) return;
    this.busy.set(true);
    const t = this.type();
    const r = await this.game.complete(q, {
      progress: t === 'timer' ? this.target() : t === 'counter' ? this.localCount() : undefined,
      stepsDone: t === 'steps' ? this.localSteps() : undefined,
      journalText: t === 'journal' ? this.journal().trim() : this.note().trim() || undefined,
      useInspiration: this.useInsp(),
    });
    this.busy.set(false);
    if (r.ok) {
      try {
        localStorage.removeItem(timerKey(q.id));
      } catch {
        /* ignore */
      }
      playSound('xp', this.game.settings()?.sounds ?? true);
      void haptic('success');
    } else this.game.toast(r.message ?? 'Validation impossible.', 'error');
  }

  async share(): Promise<void> {
    const q = this.inst();
    const d = this.draft();
    if (!q) return;
    if (!d.text.trim() && !d.photos.length) {
      this.game.toast('Ajoute une photo ou un mot, ou garde cette victoire pour toi.', 'info');
      return;
    }
    this.busy.set(true);
    try {
      const sent = await this.queue.publish({
        type: 'quest',
        text: d.text.trim(),
        visibility: d.visibility,
        instanceId: q.id,
        media: d.photos.map((p: PickedPhoto) => ({ blob: p.blob, ext: p.ext, width: p.width, height: p.height })),
      });
      this.shared.set(true);
      this.game.toast(!sent ? 'Hors ligne : ton partage partira au retour du réseau.' : d.visibility === 'friends' ? 'Partagé avec tes amis !' : 'Enregistré dans ton historique.', sent ? 'success' : 'info');
      void this.social.loadPreview();
    } catch (e) {
      const msg = String((e as Error)?.message ?? '');
      this.game.toast(msg.includes('community_rules') ? 'Ce message ne respecte pas les règles de la communauté.' : 'Impossible de publier pour le moment.', 'error');
    } finally {
      this.busy.set(false);
    }
  }

  finish(): void {
    void this.ui.nav.navigateBack('/tabs/quests');
  }

  async undo(): Promise<void> {
    const q = this.inst();
    if (!q) return;
    if (await this.ui.confirm({ title: 'Annuler la validation ?', message: 'L’XP gagnée avec cette quête sera retirée.', confirm: 'Annuler la validation', danger: true })) {
      await this.game.undo(q);
    }
  }

  async menu(): Promise<void> {
    const q = this.inst();
    if (!q) return;
    const pref = this.game.prefs()[q.templateId];
    const canReroll = q.status === 'proposed' || (q.status === 'accepted' && q.progress === 0);
    const buttons: { text: string; role?: string; handler?: () => void }[] = [];
    if (canReroll) buttons.push({ text: 'Relancer cette quête', handler: () => void this.reroll() });
    buttons.push({ text: pref?.isFavorite ? 'Retirer des favorites' : 'Marquer comme favorite', handler: () => void this.game.setPreference({ templateId: q.templateId, isFavorite: !pref?.isFavorite, isExcluded: pref?.isExcluded, isPinned: pref?.isPinned }) });
    buttons.push({ text: 'Ne plus jamais me la proposer', role: 'destructive', handler: () => void this.exclude() });
    if (q.status === 'accepted' || q.status === 'proposed') buttons.push({ text: 'Abandonner la quête', role: 'destructive', handler: () => void this.abandon() });
    buttons.push({ text: 'Fermer', role: 'cancel' });
    const s = await this.sheet.create({ header: q.snapshot.title, buttons, cssClass: 'lu-sheet' });
    await s.present();
  }

  private async reroll(): Promise<void> {
    const q = this.inst();
    if (q && (await this.game.reroll(q))) this.finish();
  }
  private async exclude(): Promise<void> {
    const q = this.inst();
    if (!q) return;
    const pref = this.game.prefs()[q.templateId];
    await this.game.setPreference({ templateId: q.templateId, isExcluded: true, isFavorite: false, isPinned: pref?.isPinned });
    this.game.toast('Cette quête ne te sera plus proposée.', 'info');
  }
  private async abandon(): Promise<void> {
    const q = this.inst();
    if (q && (await this.ui.confirm({ title: 'Abandonner cette quête ?', message: 'Elle rapportera 0 XP, sans pénalité.', confirm: 'Abandonner', danger: true })) && (await this.game.abandon(q))) this.finish();
  }
}
