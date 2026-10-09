import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular';
import { ACHIEVEMENTS, ABILITIES, ABILITY_LABEL, canDeclareRest, progressRatio, questXp, tuneXpScale, type AchievementProgress, type QuestInstance } from '@levelup/engine';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { SocialService } from '../../core/social.service';
import { UiService } from '../../core/ui.service';
import { haptic, playSound } from '../../core/feedback';
import { StatsService } from '../../core/stats.service';
import { RecapComponent } from '../../shared/recap.component';
import { BarComponent, PageHeaderComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { countdown, fmt, longDate, progressText } from '../../shared/format';

@Component({
  selector: 'app-tavern',
  imports: [RecapComponent, IonContent, IonRefresher, IonRefresherContent, BarComponent, PageHeaderComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>

      <lu-page-header [eyebrow]="date()" title="Aujourd’hui">
        <div actions>
          <button type="button" class="lu-icon-btn" aria-label="Menu : Amis, Catalogue, Créer une quête, Succès, Réglages" (click)="ui.bag()">
            <lu-icon name="menu" [size]="17" />
          </button>
          <button type="button" class="lu-icon-btn" [attr.aria-label]="'Notifications : ' + social.unread() + ' non lues'" (click)="ui.go('/messenger')">
            <lu-icon name="bell" [size]="17" />
            @if (social.unread() > 0) {
              <span class="dot">{{ social.unread() > 9 ? '9+' : social.unread() }}</span>
            }
          </button>
        </div>
      </lu-page-header>

      @if (game.offline()) {
        <div class="lu-page" style="padding-bottom: 0">
          <div class="lu-banner"><lu-icon name="cloud-off" [size]="16" /> Mode hors ligne : tes validations seront envoyées au retour du réseau.</div>
        </div>
      }

      @if (c(); as ch) {
        <div class="lu-page">
          <!-- Jours d'élan -->
          <section class="lu-card elan" [class.kept]="keptToday()">
            <span class="flame"><lu-icon name="flame" [size]="26" /></span>
            <div class="em">
              <strong>{{ ch.streakCurrent }} jour{{ ch.streakCurrent > 1 ? 's' : '' }} d’élan</strong>
              <span class="xs muted">
                @if (keptToday()) { Élan gardé aujourd’hui } @else { Accomplis au moins 1 quête aujourd’hui pour le garder }
              </span>
            </div>
            <span class="best xs muted">Record<br /><b>{{ ch.streakBest }}</b></span>
          </section>

          <!-- À faire aujourd'hui -->
          <section class="lu-section">
            <div class="lu-section-title">
              <h2>À faire</h2>
              <span class="count" [class.all]="game.dailies().length > 0 && game.dailyLeft() === 0">{{ game.dailyDone() }} / {{ game.dailies().length }}</span>
            </div>

            @for (q of tasks(); track q.id) {
              <article class="lu-card task" [class.done]="q.status === 'completed'">
                <button type="button" class="check" [class.on]="q.status === 'completed'" [disabled]="q.status === 'completed' || q.snapshot.validation.type !== 'simple'" (click)="quick(q, $event)" [attr.aria-label]="q.status === 'completed' ? 'Accomplie' : q.snapshot.validation.type === 'simple' ? 'Marquer comme faite' : 'À ouvrir pour la valider'">
                  @if (q.status === 'completed') { <lu-icon name="check" [size]="14" [stroke]="3" /> }
                </button>
                <button type="button" class="body" (click)="ui.go(['/quest', q.id])">
                  <span class="t">{{ q.snapshot.title }}</span>
                  <span class="s">{{ abilityLabel(q) }} · {{ progressText(q) }}</span>
                  @if (hasBar(q) && q.status !== 'completed') { <lu-bar [value]="progressRatio(q)" /> }
                </button>
                <span class="xpv">+{{ q.status === 'completed' ? q.xpAwarded : xpOf(q) }} XP</span>
              </article>
            } @empty {
              <p class="muted small">Aucune quête aujourd’hui. <button type="button" class="lu-link" (click)="ui.go('/tabs/quests')">Voir les quêtes →</button></p>
            }

            @if (game.dailies().length && game.dailyLeft() === 0) {
              <p class="allgood"><lu-icon name="circle-check" [size]="16" /> Tout est fait · {{ fmt(dayXp()) }} XP aujourd’hui. Prochaines quêtes dans {{ countdown(game.resetIn()) }}.</p>
            }
            <button type="button" class="lu-link more" (click)="ui.go('/tabs/quests')">Toutes les quêtes →</button>

            @if (restAvailable()) {
              <button type="button" class="lu-btn ghost small inline" (click)="rest()"><lu-icon name="moon" [size]="14" /> Déclarer un jour de repos</button>
            }
          </section>

          <!-- Objectifs : prochains succès par caractéristique -->
          @if (goals().length) {
            <section class="lu-section">
              <div class="lu-section-title">
                <h2>Objectifs</h2>
                <button type="button" class="lu-link" (click)="ui.go('/trophies')">Tous les succès →</button>
              </div>
              @for (g of goals(); track g.id) {
                <div class="lu-card goal">
                  <div class="gt"><strong>{{ g.label }}</strong><span class="gn">{{ g.current }} / {{ g.target }} quêtes</span></div>
                  <lu-bar [value]="g.current" [max]="g.target" />
                  <span class="xs muted">Récompense : {{ g.name }} · +{{ g.xp }} XP</span>
                </div>
              }
            </section>
          }

          <!-- Progression -->
          <section class="lu-card tap prog" (click)="ui.go('/tabs/hero')" role="link" tabindex="0" (keydown.enter)="ui.go('/tabs/hero')" aria-label="Ouvrir mon profil">
            <div class="top"><strong>Niveau {{ ch.level }}</strong><span class="muted">{{ fmt(game.levelInfo().current) }} / {{ fmt(game.levelInfo().needed) }} XP</span></div>
            <lu-bar [value]="game.levelInfo().ratio" label="Progression vers le niveau suivant" />
            <p class="xs muted">Série {{ ch.streakCurrent }} j · Semaine {{ game.weekProgress().done }}/{{ game.weekProgress().total }} · Mois {{ game.monthProgress().done }}/{{ game.monthProgress().total }}</p>
          </section>
        </div>
      }
      @if (recap(); as r) {
        <lu-recap [kind]="r.kind" [start]="r.start" [title]="r.title" [recap]="r.recap" [showNew]="true" (close)="closeRecap()" />
      }
    </ion-content>
  `,
  styles: `
    .elan { flex-direction: row; align-items: center; gap: 12px; padding: 14px; }
    .elan .flame { flex: none; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: var(--lu-surface-2); color: var(--lu-muted); }
    .elan.kept .flame { background: var(--lu-gold-bg); color: var(--lu-gold); }
    .elan .em { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .elan .em strong { font-size: 17px; }
    .elan .best { text-align: center; line-height: 1.3; } .elan .best b { font-size: 16px; color: var(--lu-text); }
    .goal { gap: 8px; padding: 12px 14px; }
    .goal .gt { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; } .goal .gt strong { font-size: 14px; }
    .goal .gn { font: 600 13px var(--lu-font-body); font-variant-numeric: tabular-nums; color: var(--lu-text-2); }
    .count { font: 600 14px var(--lu-font-body); color: var(--lu-muted); font-variant-numeric: tabular-nums; }
    .count.all { color: var(--lu-accent); }
    .task { flex-direction: row; align-items: center; gap: 12px; padding: 14px; }
    .task.done { opacity: .65; }
    .task .body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; background: none; border: 0; padding: 0; text-align: left; color: var(--lu-text); cursor: pointer; font-family: inherit; }
    .task .t { font-size: 16px; font-weight: 600; line-height: 1.3; }
    .task.done .t { text-decoration: line-through; }
    .task .s { font-size: 12px; color: var(--lu-muted); }
    .xpv { font-size: 12px; font-weight: 600; color: var(--lu-gold); white-space: nowrap; }
    .check { flex: none; width: 30px; height: 30px; border-radius: 50%; border: 1.5px solid var(--lu-border-strong); background: var(--lu-surface-2); color: var(--lu-accent-ink); display: grid; place-items: center; padding: 0; cursor: pointer; }
    .check.on { background: var(--lu-accent); border-color: var(--lu-accent); }
    .check:disabled:not(.on) { cursor: default; opacity: .55; }
    .allgood { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--lu-text-2); }
    .allgood lu-icon { color: var(--lu-accent); flex: none; }
    .more { align-self: flex-start; }
    .prog { gap: 10px; }
    .prog .top { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; }
  `,

})
export class TavernPage {
  protected game = inject(GameService);
  protected social = inject(SocialService);
  protected ui = inject(UiService);
  private stats = inject(StatsService);
  private be = inject(BackendService);
  private readonly achProgress = signal<Map<string, AchievementProgress>>(new Map());
  readonly recap = signal<{ kind: 'week' | 'month'; start: string; key: string; title: string; recap: ReturnType<StatsService['recap']> } | null>(null);
  readonly fmt = fmt;
  readonly countdown = countdown;
  readonly progressRatio = progressRatio;
  readonly progressText = progressText;
  readonly c = this.game.character;
  readonly date = computed(() => longDate(this.game.today()).toUpperCase());

  /** Les tâches du jour : celles à faire d'abord (la plus avancée en tête), puis les accomplies. */
  readonly tasks = computed(() =>
    [...this.game.dailies()].sort((x, y) => {
      const d = Number(x.status === 'completed') - Number(y.status === 'completed');
      if (d) return d;
      return progressRatio(y) - progressRatio(x);
    }),
  );
  /** L'élan est gardé si une quête du jour est faite, ou si un jour de repos est déclaré. */
  readonly keptToday = computed(() => this.game.dailyDone() > 0 || this.game.restDays().includes(this.game.today()));

  /** Prochain palier « N quêtes de <caractéristique> » pour chaque caractéristique ; on garde les 3 plus avancés (à égalité, celles du jour). */
  readonly goals = computed(() => {
    const progress = this.achProgress();
    const todayAbilities = new Set(this.game.dailies().map((q) => q.snapshot.ability));
    const next = ABILITIES.map((ability) => {
      const chain = ACHIEVEMENTS.filter((a) => a.condition.kind === 'quests_by_ability' && a.condition.ability === ability)
        .map((a) => ({ a, p: progress.get(a.id) }))
        .filter((x) => !x.p?.done)
        .sort((x, y) => (x.a.condition as { target: number }).target - (y.a.condition as { target: number }).target);
      const n = chain[0];
      if (!n) return null;
      const target = (n.a.condition as { target: number }).target;
      const current = Math.min(n.p?.current ?? 0, target);
      return { id: n.a.id, ability, label: ABILITY_LABEL[ability], current, target, name: n.a.name, xp: n.a.xpBonus, today: todayAbilities.has(ability) };
    }).filter((g): g is NonNullable<typeof g> => !!g);
    return next.sort((x, y) => y.current / y.target - x.current / x.target || Number(y.today) - Number(x.today)).slice(0, 3);
  });

  readonly dayXp = computed(() => this.game.dailies().reduce((s, q) => s + (q.status === 'completed' ? q.xpAwarded : 0), 0));
  readonly restAvailable = computed(() => {
    const g = this.game;
    return g.dailyDone() === 0 && g.dailyLeft() > 0 && canDeclareRest(g.restDays(), g.today()) && !g.restDays().includes(g.today());
  });

  abilityLabel = (q: QuestInstance) => ABILITY_LABEL[q.snapshot.ability];
  hasBar = (q: QuestInstance) => ['counter', 'timer', 'steps'].includes(q.snapshot.validation.type);
  xpOf(q: QuestInstance): string {
    const c = this.game.character();
    return fmt(questXp({ difficulty: q.snapshot.difficulty, period: q.period, ability: q.snapshot.ability, level: c?.level ?? 1, masteries: this.game.masteries(), pathAbility: this.game.pathAbility(), scale: tuneXpScale(q.snapshot) }).total);
  }

  async quick(q: QuestInstance, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (q.status !== 'accepted' || q.snapshot.validation.type !== 'simple') return;
    void haptic('light');
    const r = await this.game.complete(q, {});
    if (r.ok) {
      playSound('xp', this.game.settings()?.sounds ?? true);
      void haptic('success');
      this.game.toast(`+${r.data!.xpAwarded} XP${r.provisional ? ' (provisoire)' : ''}`, 'success');
    } else this.game.toast(r.message ?? 'Impossible de valider.', 'error');
  }

  async rest(): Promise<void> {
    if (await this.ui.confirm({ title: 'Jour de repos', message: 'Ta série est protégée pour aujourd’hui. Un seul jour de repos par semaine.', confirm: 'Déclarer' })) await this.game.declareRest();
  }

  constructor() {
    void this.checkRecap();
    // Les objectifs se mettent à jour à chaque quête accomplie.
    effect(() => {
      this.game.dailyDone();
      this.game.instances();
      void this.be.game.achievementProgress().then((p) => this.achProgress.set(new Map(p.map((x) => [x.id, x])))).catch(() => undefined);
    });
  }

  /** Bilan de la semaine / du mois écoulé, à la première ouverture. */
  private async checkRecap(): Promise<void> {
    await this.stats.load();
    const p = this.stats.pendingRecap();
    if (!p) return;
    const title = p.kind === 'week' ? this.stats.weekTitle(p.start) : new Date(`${p.start}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    this.recap.set({ ...p, title, recap: this.stats.recap(p.kind, p.start) });
  }

  async closeRecap(): Promise<void> {
    const r = this.recap();
    this.recap.set(null);
    if (r) await this.game.saveSettings(r.kind === 'week' ? { lastRecapWeek: r.key } : { lastRecapMonth: r.key });
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await Promise.all([this.game.refresh(), this.social.refresh()]);
    (ev.target as HTMLIonRefresherElement).complete();
  }
}
