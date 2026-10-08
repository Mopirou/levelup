import { UpperCasePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular';
import { ABILITY_LABEL, DIFFICULTY_LABEL, ABILITIES, canDeclareRest, isReadyToComplete, progressRatio, questXp, type QuestInstance } from '@levelup/engine';
import { GameService } from '../../core/game.service';
import { SocialService } from '../../core/social.service';
import { UiService } from '../../core/ui.service';
import { haptic, playSound } from '../../core/feedback';
import { StatsService } from '../../core/stats.service';
import { RecapComponent } from '../../shared/recap.component';
import { AvatarComponent, BarComponent, AbilityBadgeComponent, PageHeaderComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { countdown, fmt, longDate, progressText, relativeTime, statusLabel } from '../../shared/format';

@Component({
  selector: 'app-tavern',
  imports: [RecapComponent, UpperCasePipe, IonContent, IonRefresher, IonRefresherContent, AvatarComponent, BarComponent, AbilityBadgeComponent, PageHeaderComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>

      <lu-page-header [eyebrow]="'Élan · ' + date()" title="Un petit pas, un grand élan.">
        <div actions>
          <button type="button" class="lu-icon-btn" aria-label="Le Sac : Compagnons, Grimoire, Forge, Trophées, Campement" (click)="ui.bag()">
            <lu-icon name="menu" [size]="17" />
          </button>
          <button type="button" class="lu-icon-btn" [attr.aria-label]="'Le Corbeau : ' + social.unread() + ' notifications non lues'" (click)="ui.go('/messenger')">
            <lu-icon name="bell" [size]="17" />
            @if (social.unread() > 0) {
              <span class="dot">{{ social.unread() > 9 ? '9+' : social.unread() }}</span>
            }
          </button>
        </div>
        <p class="tavernkeeper">{{ game.tavernMessage() }}</p>
      </lu-page-header>

      @if (game.offline()) {
        <div class="lu-page" style="padding-bottom: 0">
          <div class="lu-banner"><lu-icon name="cloud-off" [size]="16" /> Mode hors ligne : tes validations seront envoyées au retour du réseau.</div>
        </div>
      }

      @if (c(); as ch) {
        <div class="lu-page">
          <!-- Personnage -->
          <section class="lu-card tap" (click)="ui.go('/tabs/hero')" role="link" tabindex="0" (keydown.enter)="ui.go('/tabs/hero')" aria-label="Ouvrir ma fiche de personnage">
            <div class="hero">
              <lu-avatar [name]="ch.name" [size]="46" tone="light" [ring]="ch.frameColor" />
              <div class="who">
                <p class="hello">Heureux de te revoir,</p>
                <p class="name">{{ ch.name }}, {{ game.classDef()?.name ? 'l’' + game.classDef()!.name : 'l’Aventurier' }}</p>
              </div>
              <div class="lvl">
                <span class="lab">NIVEAU</span>
                <span class="val">{{ ch.level }}</span>
              </div>
            </div>
            <div class="xp">
              <span>{{ fmt(game.levelInfo().current) }} / {{ fmt(game.levelInfo().needed) }} XP</span>
              <span class="muted">{{ game.levelInfo().nextLevelXp ? fmt(game.levelInfo().remaining) + ' XP avant le niv. ' + (ch.level + 1) : 'Niveau maximum' }}</span>
            </div>
            <lu-bar [value]="game.levelInfo().ratio" />
            <p class="xs muted">{{ fmt(ch.totalXp) }} XP cumulés · {{ totalQuests() }} quêtes accomplies</p>
            <div class="res">
              <span class="r"><lu-icon name="flame" [size]="15" /> {{ ch.streakCurrent }} jour{{ ch.streakCurrent > 1 ? 's' : '' }} de série</span>
              <span class="r"><lu-icon name="sparkles" [size]="15" /> {{ ch.inspiration }} inspiration{{ ch.inspiration > 1 ? 's' : '' }}</span>
            </div>
          </section>

          <!-- À toi de jouer -->
          <section class="lu-section">
            <div class="lu-section-title">
              <h2>À toi de jouer</h2>
              <button type="button" class="lu-link" (click)="ui.go('/tabs/quests')">Toutes les quêtes →</button>
            </div>

            @if (next(); as q) {
              <article class="lu-card next">
                <div class="tags">
                  <span class="lu-chip">{{ abilityLabel(q) | uppercase }} · {{ diffLabel(q) | uppercase }}</span>
                  <span class="lu-chip gold">+{{ xpOf(q) }} XP</span>
                </div>
                <h3 class="qt">{{ q.snapshot.title }}</h3>
                <p class="qd">{{ q.snapshot.flavor }}</p>
                @if (hasBar(q)) {
                  <div class="adv"><span class="muted">{{ progressText(q) }}</span><span class="mint">{{ stateOf(q) }}</span></div>
                  <lu-bar [value]="progressRatio(q)" />
                }
                <button type="button" class="lu-btn" (click)="ui.go(['/quest', q.id])">
                  {{ progressRatio(q) > 0 ? 'Reprendre ma quête' : 'Ouvrir ma quête' }} <lu-icon name="chevron-right" [size]="18" />
                </button>
              </article>
            } @else if (game.dailies().length) {
              <article class="lu-card done fade-in">
                <h3 class="qt">Journée accomplie</h3>
                <p class="qd">{{ fmt(dayXp()) }} XP gagnés aujourd’hui. Les quêtes se renouvellent dans {{ countdown(game.resetIn()) }}.</p>
                <button type="button" class="lu-btn ghost" (click)="ui.go('/tabs/quests')">Voir des quêtes libres</button>
              </article>
            }

            @if (others().length) {
              <div class="list">
                @for (q of others(); track q.id) {
                  <div class="item" role="button" tabindex="0" (click)="ui.go(['/quest', q.id])" (keydown.enter)="ui.go(['/quest', q.id])">
                    <button type="button" class="check" [class.on]="q.status === 'completed'" [disabled]="q.status === 'completed' || q.snapshot.validation.type !== 'simple'" (click)="quick(q, $event)" [attr.aria-label]="q.status === 'completed' ? 'Accomplie' : 'Valider ' + q.snapshot.title">
                      @if (q.status === 'completed') { <lu-icon name="check" [size]="12" [stroke]="3" /> }
                    </button>
                    <span class="t" [class.struck]="q.status === 'completed'">{{ q.snapshot.title }}</span>
                    <span class="gold small">+{{ q.status === 'completed' ? q.xpAwarded : xpOf(q) }} XP</span>
                  </div>
                }
              </div>
            }
            <p class="xs muted">{{ game.dailyDone() }} {{ game.dailyDone() > 1 ? 'quêtes' : 'quête' }} sur {{ game.dailies().length }} accomplie{{ game.dailyDone() > 1 ? 's' : '' }} aujourd’hui</p>

            @if (restAvailable()) {
              <button type="button" class="lu-btn ghost small inline" (click)="rest()"><lu-icon name="moon" [size]="14" /> Déclarer un jour de repos</button>
            }
          </section>

          <!-- Progression -->
          <section class="lu-section">
            <div class="lu-section-title"><h2>Chaque pas s’additionne</h2></div>
            <div class="periods">
              <div class="lu-card tile">
                <span class="muted small">Cette semaine</span>
                <span class="big">{{ game.weekProgress().done }} / {{ game.weekProgress().total }}</span>
                <span class="xs dim">quêtes accomplies · fin dans {{ game.weekDaysLeft() }} j</span>
                <lu-bar [value]="game.weekProgress().done" [max]="game.weekProgress().total || 1" />
              </div>
              <div class="lu-card tile">
                <span class="muted small">Ce mois-ci</span>
                <span class="big">{{ game.monthProgress().done }} / {{ game.monthProgress().total }}</span>
                <span class="xs dim">quêtes accomplies</span>
                <lu-bar [value]="game.monthProgress().done" [max]="game.monthProgress().total || 1" />
              </div>
            </div>
          </section>

          <!-- Caractéristiques -->
          <section class="lu-section">
            <div class="lu-section-title">
              <h2>Tes forces en un regard</h2>
              <button type="button" class="lu-link" (click)="ui.go('/tabs/hero')">Ma fiche →</button>
            </div>
            <div class="abilities">
              @for (a of order; track a) {
                <div class="lu-card flat ab" [class.weak]="a === game.weakest()">
                  <lu-ability-badge [ability]="a" [size]="26" />
                  <span class="v">{{ game.scores()[a] }}</span>
                  <span class="n">{{ abilityName(a) }}</span>
                </div>
              }
            </div>
          </section>

          <!-- Village -->
          <section class="lu-section">
            <div class="lu-section-title">
              <h2>Pendant ce temps au Village</h2>
              <button type="button" class="lu-link" (click)="ui.go('/tabs/village')">Voir →</button>
            </div>
            @for (p of social.preview().slice(0, 2); track p.id) {
              <div class="news" role="button" tabindex="0" (click)="ui.go('/tabs/village')" (keydown.enter)="ui.go('/tabs/village')">
                <lu-avatar [name]="p.author.name" [size]="34" [tone]="$index === 0 ? 'gold' : 'dark'" />
                <div class="msg">
                  <p class="a">{{ newsText(p) }}</p>
                  <p class="r">{{ relative(p.createdAt) }}{{ p.quest?.xp ? ' · +' + p.quest!.xp + ' XP' : '' }}</p>
                </div>
                <lu-icon [name]="p.type === 'achievement' ? 'award' : 'heart'" [size]="18" />
              </div>
            } @empty {
              <p class="muted small">Ton village est encore calme. Invite des compagnons depuis l’onglet Village.</p>
            }
            @if (social.weekXp() > 0) {
              <p class="xs muted">Cette semaine, ta compagnie a gagné {{ fmt(social.weekXp()) }} XP.</p>
            }
          </section>
        </div>
      }
      @if (recap(); as r) {
        <lu-recap [kind]="r.kind" [start]="r.start" [title]="r.title" [recap]="r.recap" [showNew]="true" (close)="closeRecap()" />
      }
    </ion-content>
  `,
  styles: `
    .tavernkeeper { font-family: var(--lu-font-title); font-style: italic; font-size: 15px; line-height: 1.45; color: var(--lu-text-2); margin-top: 2px; }
    .hero { display: flex; align-items: center; gap: 12px; }
    .who { flex: 1; min-width: 0; }
    .hello { font-size: 12px; color: var(--lu-muted); }
    .name { font-family: var(--lu-font-title); font-size: 21px; line-height: 1.25; }
    .lvl { display: flex; flex-direction: column; align-items: center; gap: 0; }
    .lvl .lab { font-size: 9px; letter-spacing: .1em; color: var(--lu-muted); }
    .lvl .val { font-family: var(--lu-font-title); font-size: 32px; line-height: 1.1; }
    .xp { display: flex; justify-content: space-between; font-size: 11px; }
    .res { display: flex; justify-content: space-between; font-size: 11px; }
    .r { display: inline-flex; align-items: center; gap: 5px; }
    .r lu-icon { color: var(--lu-gold); }
    .next { gap: 12px; }
    .tags { display: flex; justify-content: space-between; gap: 8px; }
    .qt { font-family: var(--lu-font-title); font-weight: 500; font-size: 22px; line-height: 1.25; }
    .qd { font-size: 12px; line-height: 1.5; color: var(--lu-muted); }
    .adv { display: flex; justify-content: space-between; font-size: 11px; }
    .mint { color: var(--lu-accent); }
    .list { display: flex; flex-direction: column; gap: 10px; }
    .item { display: flex; align-items: center; gap: 10px; min-height: 36px; cursor: pointer; }
    .item .t { flex: 1; font-size: 13px; }
    .struck { text-decoration: line-through; opacity: .7; }
    .check { width: 26px; height: 26px; border-radius: 50%; border: 1.5px solid var(--lu-border-strong); background: var(--lu-surface-2); color: var(--lu-accent-ink); display: grid; place-items: center; padding: 0; cursor: pointer; flex: none; }
    .check.on { background: var(--lu-accent); border-color: var(--lu-accent); }
    .check:disabled:not(.on) { cursor: default; opacity: .55; }
    .periods { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .tile { gap: 8px; padding: 14px; }
    .big { font-family: var(--lu-font-title); font-size: 26px; line-height: 1.2; }
    .abilities { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .ab { align-items: center; padding: 10px; gap: 5px; border-radius: 12px; }
    .ab.weak { border-color: color-mix(in srgb, var(--lu-gold) 55%, transparent); }
    .ab .v { font-family: var(--lu-font-title); font-size: 22px; }
    .ab .n { font-size: 10px; color: var(--lu-muted); }
    .news { display: flex; align-items: center; gap: 10px; min-height: 34px; cursor: pointer; }
    .news .msg { flex: 1; min-width: 0; }
    .news .a { font-size: 12px; }
    .news .r { font-size: 10px; color: var(--lu-muted); margin-top: 2px; }
    .news lu-icon { color: var(--lu-accent); }
    .done .qd { color: var(--lu-text-2); }
  `,
})
export class TavernPage {
  protected game = inject(GameService);
  protected social = inject(SocialService);
  protected ui = inject(UiService);
  private stats = inject(StatsService);
  readonly recap = signal<{ kind: 'week' | 'month'; start: string; key: string; title: string; recap: ReturnType<StatsService['recap']> } | null>(null);
  readonly order = ['CON', 'INT', 'DEX', 'FOR', 'CHA', 'SAG'] as const;
  readonly fmt = fmt;
  readonly countdown = countdown;
  readonly progressRatio = progressRatio;
  readonly progressText = progressText;
  readonly c = this.game.character;
  readonly date = computed(() => longDate(this.game.today()).toUpperCase());
  readonly totalQuests = computed(() => this.game.recent().filter((i) => i.status === 'completed').length);

  readonly next = computed<QuestInstance | null>(() => {
    const open = this.game.dailyOpen();
    return open.find((q) => q.progress > 0 || (q.stepsDone ?? []).some(Boolean)) ?? open[0] ?? null;
  });
  readonly others = computed(() => {
    const n = this.next();
    return this.game.dailies().filter((q) => q.id !== n?.id).sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'));
  });
  readonly dayXp = computed(() => this.game.dailies().reduce((s, q) => s + (q.status === 'completed' ? q.xpAwarded : 0), 0));
  readonly restAvailable = computed(() => {
    const g = this.game;
    return g.dailyDone() === 0 && g.dailyLeft() > 0 && canDeclareRest(g.restDays(), g.today()) && !g.restDays().includes(g.today());
  });

  abilityLabel = (q: QuestInstance) => ABILITY_LABEL[q.snapshot.ability];
  diffLabel = (q: QuestInstance) => DIFFICULTY_LABEL[q.snapshot.difficulty];
  abilityName = (a: (typeof ABILITIES)[number]) => ABILITY_LABEL[a];
  hasBar = (q: QuestInstance) => ['counter', 'timer', 'steps'].includes(q.snapshot.validation.type);
  stateOf = (q: QuestInstance) => statusLabel(q, isReadyToComplete(q) === null);
  relative = (iso: string) => relativeTime(iso, this.game.now());
  xpOf(q: QuestInstance): string {
    const c = this.game.character();
    return fmt(questXp({ difficulty: q.snapshot.difficulty, period: q.period, ability: q.snapshot.ability, level: c?.level ?? 1, masteries: this.game.masteries(), pathAbility: this.game.pathAbility() }).total);
  }

  newsText(p: { author: { name: string }; type: string; text: string; quest: { title: string } | null; payload: Record<string, any> }): string {
    const first = p.author.name.split(' ')[0];
    switch (p.type) {
      case 'level_up': return `${first} atteint le niveau ${p.payload['level']}.`;
      case 'achievement': return `${first} débloque « ${p.payload['name']} ».`;
      case 'streak': return `${first} tient une série de ${p.payload['days']} jours.`;
      default: return p.quest ? `${first} a terminé « ${p.quest.title} ».` : `${first} a partagé un moment.`;
    }
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
