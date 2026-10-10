import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { QuestInstance, TrackState } from '@levelup/engine';
import { GameService } from '../core/game.service';
import { IconComponent } from './icon.component';
import { AbilityBadgeComponent, BarComponent } from './ui';
import { fmt, isQuestReady, progressText, questActionLabel, statusLabel } from './format';
import { themeLabel } from './themes';
import { trackDef } from './tracks';

/**
 * Carte d'un parcours actif sur l'écran Quêtes : discipline, échelon n/10, progression vers l'échelon suivant
 * (jours validés), éventuel verrou de score, puis la quête du jour avec son bouton principal.
 */
@Component({
  selector: 'lu-track-card',
  imports: [IconComponent, AbilityBadgeComponent, BarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (def(); as d) {
      <article class="lu-card tc" [class.done]="quest()?.status === 'completed'" [attr.aria-label]="'Parcours ' + d.label">
        <header class="th">
          <lu-ability-badge [ability]="d.ability" [size]="44" />
          <div class="tm">
            <h3 class="tt">{{ d.label }}</h3>
            <p class="ts">{{ discipline() }} · <strong>Échelon {{ state().rung }}/{{ d.rungs.length }}</strong></p>
          </div>
          <button type="button" class="more" (click)="manage.emit()" [attr.aria-label]="'Gérer le parcours ' + d.label + ' : pause ou arrêt'">
            <lu-icon name="ellipsis" [size]="18" />
          </button>
        </header>

        <div class="prog">
          @if (progress(); as p) {
            @if (p.top) {
              <p class="pl"><span>Dernier échelon du parcours</span><span class="num">{{ p.hits }}/{{ p.needed }}</span></p>
            } @else {
              <p class="pl"><span>Vers l’échelon {{ state().rung + 1 }}</span><span class="num">{{ p.hits }}/{{ p.needed }} jours validés</span></p>
            }
            <lu-bar [value]="p.hits" [max]="p.needed" [thick]="true" [label]="'Jours validés à l’échelon ' + state().rung + ' : ' + p.hits + ' sur ' + p.needed" />
          }
        </div>

        @if (lock(); as l) {
          @if (l.locked) {
            <p class="lock">
              <lu-icon name="lock" [size]="14" />
              <span><strong>{{ l.label }}</strong> · tu es à {{ score() }}. En attendant, tu pratiques l’échelon {{ l.effectiveRung }}.</span>
            </p>
          }
        }

        @if (quest(); as q) {
          <div class="quest" [class.proposed]="q.status === 'proposed'">
            <button type="button" class="qbody" (click)="open.emit()" [attr.aria-label]="'Voir la quête : ' + q.snapshot.title">
              <span class="qt">{{ q.snapshot.title }}</span>
              <span class="qs">{{ stateText() }}</span>
            </button>
            <span class="xp">+{{ xp() }} XP</span>
          </div>
          @if (bonus(); as b) {
            <p class="bonus"><lu-icon name="sparkles" [size]="13" /> {{ b }}</p>
          }
          @if (q.status === 'completed') {
            <p class="okline"><lu-icon name="circle-check" [size]="16" /> Fait aujourd’hui</p>
          } @else if (actionLabel(); as label) {
            <button type="button" class="lu-btn" [class.mint]="ready()" (click)="primary.emit()">{{ label }}</button>
          }
        } @else if (abandoned()) {
          <div class="wait" role="status">
            <p class="small"><strong>Quête d’aujourd’hui abandonnée.</strong> Elle ne rapporte rien et sera remplacée par une nouvelle demain. Sans quête validée ni jour de repos, la journée compte comme manquée.</p>
            <button type="button" class="lu-btn ghost small" (click)="pause.emit()" [attr.aria-label]="'Mettre le parcours ' + d.label + ' en pause'"><lu-icon name="pause" [size]="15" /> Mettre ce parcours en pause</button>
          </div>
        } @else {
          <div class="wait">
            <p class="small muted">La quête du jour n’est pas encore arrivée.</p>
            <button type="button" class="lu-btn ghost small" [disabled]="refreshing()" (click)="reload()"><lu-icon name="refresh" [size]="15" /> {{ refreshing() ? 'Actualisation…' : 'Actualiser' }}</button>
          </div>
        }
      </article>
    }
  `,
  styles: `
    :host { display: block; }
    .tc { gap: 12px; }
    .tc.done { background: var(--lu-surface); box-shadow: none; }
    .th { display: flex; align-items: center; gap: 12px; }
    .tm { flex: 1; min-width: 0; }
    .tt { font-family: var(--lu-font-title); font-weight: 500; font-size: 19px; line-height: 1.2; margin: 0; }
    .ts { margin: 2px 0 0; font-size: 12px; color: var(--lu-muted); }
    .ts strong { color: var(--lu-text); font-weight: 700; }
    .more { flex: none; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--lu-border); background: var(--lu-surface-2); color: var(--lu-text); display: grid; place-items: center; cursor: pointer; padding: 0; }
    .prog { display: flex; flex-direction: column; gap: 6px; }
    .pl { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin: 0; font-size: 12px; color: var(--lu-text-2); }
    .num { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--lu-text); }
    .lock { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--lu-gold-bg); color: var(--lu-gold); font-size: 12px; line-height: 1.45; }
    .lock lu-icon { margin-top: 2px; }
    .quest { display: flex; align-items: flex-start; gap: 10px; padding: 12px; border-radius: 14px; background: var(--lu-surface-2); border: 1px solid var(--lu-border); }
    .quest.proposed { border-style: dashed; border-color: var(--lu-border-strong); }
    .qbody { flex: 1; min-width: 0; min-height: 44px; display: flex; flex-direction: column; gap: 3px; justify-content: center; text-align: left; background: none; border: 0; padding: 0; color: var(--lu-text); font: inherit; cursor: pointer; }
    .qt { font-size: 15px; font-weight: 600; line-height: 1.3; }
    .tc.done .qt { text-decoration: line-through; opacity: 0.75; }
    .qs { font-size: 12px; color: var(--lu-muted); }
    .xp { font-size: 12px; font-weight: 700; color: var(--lu-gold); white-space: nowrap; padding-top: 2px; }
    .bonus { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; color: var(--lu-gold); }
    .okline { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; font-weight: 600; color: var(--lu-accent); }
    .wait { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; padding: 12px; border-radius: 14px; background: var(--lu-surface-2); border: 1px dashed var(--lu-border-strong); }
    .wait p { margin: 0; }
  `,
})
export class TrackCardComponent {
  private game = inject(GameService);
  readonly state = input.required<TrackState>();
  readonly quest = input<QuestInstance | null>(null);
  readonly open = output<void>();
  readonly primary = output<void>();
  readonly manage = output<void>();
  readonly pause = output<void>();
  readonly refreshing = signal(false);

  /** Quête du jour de ce parcours abandonnée : elle n'est pas remplacée aujourd'hui. */
  readonly abandoned = computed(() => !this.quest() && !!this.game.trackQuestAbandoned(this.state().trackId));

  async reload(): Promise<void> {
    this.refreshing.set(true);
    try {
      await this.game.refresh();
    } finally {
      this.refreshing.set(false);
    }
  }

  readonly def = computed(() => trackDef(this.state().trackId));
  readonly discipline = computed(() => themeLabel(this.def()?.theme));
  readonly progress = computed(() => this.game.trackProgress(this.state()));
  readonly lock = computed(() => this.game.trackLock(this.state()));
  readonly score = computed(() => (this.def() ? this.game.scores()[this.def()!.ability] : 0));
  readonly bonus = computed(() => (this.quest() ? this.game.balanceLabel(this.quest()!) : null));
  readonly ready = computed(() => !!this.quest() && isQuestReady(this.quest()!));
  readonly actionLabel = computed(() => (this.quest() ? questActionLabel(this.quest()!) : null));
  readonly xp = computed(() => (this.quest() ? fmt(this.game.xpOf(this.quest()!)) : ''));
  readonly stateText = computed(() => {
    const q = this.quest();
    if (!q) return '';
    const v = q.snapshot.validation.type;
    if (v === 'simple' || v === 'journal') return statusLabel(q, false);
    return `${progressText(q)} · ${statusLabel(q, this.ready())}`;
  });
}
