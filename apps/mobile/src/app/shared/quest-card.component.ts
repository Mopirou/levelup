import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { DIFFICULTY_LABEL, ABILITY_LABEL, DIFFICULTY_SWORDS, isReadyToComplete, progressRatio, questXp, type QuestInstance } from '@levelup/engine';
import { GameService } from '../core/game.service';
import { IconComponent } from './icon.component';
import { AbilityBadgeComponent, BarComponent } from './ui';
import { fmt, progressText, statusLabel } from './format';

/** « Carte de quête » des maquettes : identité, XP, avancement, statut et action. */
@Component({
  selector: 'lu-quest-card',
  imports: [IconComponent, AbilityBadgeComponent, BarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="lu-card card tap" [class.done]="inst().status === 'completed'" [class.dim]="inst().status === 'expired' || inst().status === 'abandoned'" [class.proposed]="inst().status === 'proposed'" (click)="open.emit()">
      @if (inst().status === 'completed') {
        <span class="stamp" aria-hidden="true">ACCOMPLIE</span>
      }
      <div class="id">
        <lu-ability-badge [ability]="inst().snapshot.ability" [size]="44" />
        <div class="meta">
          <h3 class="title">{{ inst().snapshot.title }}</h3>
          <p class="sub">{{ abilityLabel() }} · {{ difficultyLabel() }}</p>
        </div>
        <span class="xp" [class.prov]="provisional()">+{{ xp() }} XP{{ provisional() ? '*' : '' }}</span>
      </div>
      @if (showBar()) {
        <lu-bar [value]="ratio()" [thick]="true" [dashed]="inst().status === 'proposed'" />
      }
      <div class="foot">
        <span class="state">
          @if (inst().status === 'completed') {
            <lu-icon name="circle-check" [size]="15" />
          }
          {{ stateText() }}
        </span>
        <span class="actions" (click)="$event.stopPropagation()">
          @if (canReroll()) {
            <button type="button" class="reroll" (click)="reroll.emit()" aria-label="Relancer cette quête" title="Relancer">
              <lu-icon name="dices" [size]="16" />
            </button>
          }
          @if (actionLabel(); as label) {
            <button type="button" class="lu-btn small" [class.mint]="primaryTone() === 'mint'" (click)="primary.emit()">
              {{ label }}
            </button>
          }
        </span>
      </div>
    </article>
  `,
  styles: `
    :host { display: block; }
    .card { gap: 12px; padding: 16px; overflow: hidden; }
    .card.proposed { border-style: dashed; border-color: var(--lu-border-strong); }
    .card.done { background: var(--lu-surface); box-shadow: none; }
    .card.done .id, .card.done .foot .state { opacity: 0.62; }
    .card.dim { opacity: 0.55; }
    .stamp {
      position: absolute; right: 14px; top: 38px; transform: rotate(-9deg);
      border: 2px solid var(--lu-accent); color: var(--lu-accent); border-radius: 6px; padding: 2px 8px;
      font: 800 11px/1.2 var(--lu-font-body); letter-spacing: 0.14em; opacity: 0.8; pointer-events: none;
    }
    .id { display: flex; align-items: center; gap: 12px; min-height: 44px; }
    .meta { flex: 1; min-width: 0; }
    .title { font-family: var(--lu-font-title); font-weight: 500; font-size: 17px; line-height: 1.25; margin: 0; }
    .sub { font-size: 11px; color: var(--lu-muted); margin-top: 2px; }
    .xp { font-size: 12px; font-weight: 700; color: var(--lu-gold); white-space: nowrap; align-self: flex-start; }
    .xp.prov { opacity: 0.8; text-decoration: underline dotted; }
    .foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 36px; }
    .state { font-size: 11px; color: var(--lu-muted); display: inline-flex; align-items: center; gap: 6px; }
    .actions { display: inline-flex; align-items: center; gap: 8px; }
    .reroll { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--lu-border); background: var(--lu-surface-2); color: var(--lu-text-2); display: grid; place-items: center; cursor: pointer; }
  `,
})
export class QuestCardComponent {
  private game = inject(GameService);
  readonly inst = input.required<QuestInstance>();
  readonly rerollable = input(false);
  readonly open = output<void>();
  readonly primary = output<void>();
  readonly reroll = output<void>();

  readonly abilityLabel = computed(() => ABILITY_LABEL[this.inst().snapshot.ability]);
  readonly difficultyLabel = computed(() => DIFFICULTY_LABEL[this.inst().snapshot.difficulty]);
  readonly provisional = computed(() => this.game.provisional().has(this.inst().id));
  readonly xp = computed(() => {
    const i = this.inst();
    if (i.status === 'completed' && i.xpAwarded) return fmt(i.xpAwarded);
    const c = this.game.character();
    return fmt(
      questXp({ difficulty: i.snapshot.difficulty, period: i.period, ability: i.snapshot.ability, level: c?.level ?? 1, masteries: this.game.masteries(), pathAbility: this.game.pathAbility() }).total,
    );
  });
  readonly ratio = computed(() => (this.inst().status === 'completed' ? 1 : progressRatio(this.inst())));
  readonly ready = computed(() => this.inst().status === 'accepted' && isReadyToComplete(this.inst()) === null && this.inst().snapshot.validation.type !== 'journal');
  readonly showBar = computed(() => ['counter', 'timer', 'steps'].includes(this.inst().snapshot.validation.type) || this.inst().status === 'completed');
  readonly stateText = computed(() => {
    const i = this.inst();
    const v = i.snapshot.validation.type;
    if (i.status === 'completed' || (v !== 'simple' && v !== 'journal' && i.status !== 'proposed')) return `${progressText(i)} · ${statusLabel(i, this.ready())}`;
    if (i.status === 'proposed' && v !== 'simple' && v !== 'journal') return `${progressText(i)} · ${statusLabel(i, false)}`;
    return statusLabel(i, this.ready());
  });
  readonly canReroll = computed(() => this.rerollable() && (this.inst().status === 'proposed' || (this.inst().status === 'accepted' && this.inst().progress === 0 && !(this.inst().stepsDone ?? []).some(Boolean))));
  readonly actionLabel = computed(() => {
    const i = this.inst();
    switch (i.status) {
      case 'proposed':
        return 'Accepter';
      case 'accepted': {
        const t = i.snapshot.validation.type;
        if (this.ready()) return t === 'timer' ? 'Valider' : 'Valider';
        if (t === 'simple') return 'Accomplir';
        if (t === 'journal') return 'Écrire';
        if (t === 'timer') return i.progress > 0 ? 'Continuer' : 'Démarrer';
        return i.progress > 0 || (i.stepsDone ?? []).some(Boolean) ? 'Continuer' : 'Commencer';
      }
      default:
        return null;
    }
  });
  readonly primaryTone = computed(() => (this.ready() ? 'mint' : ''));
  readonly swords = computed(() => DIFFICULTY_SWORDS[this.inst().snapshot.difficulty]);
}
