import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ABILITIES, ABILITY_COLOR, ABILITY_LABEL, type AbilityId, type QuestInstance, type Recap } from '@levelup/engine';
import { GameService } from '../core/game.service';
import { BarComponent } from './ui';
import { ModalComponent } from './modal.component';
import { fmt } from './format';

/** Bilan de fin de semaine / de mois (7.12) : chiffres, récit généré par modèles, nouvelles quêtes à accepter. */
@Component({
  selector: 'lu-recap',
  imports: [BarComponent, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <lu-modal label="Bilan" (close)="close.emit()">
      <span class="lu-eyebrow">BILAN {{ kind() === 'week' ? 'DE LA SEMAINE' : 'DU MOIS' }}</span>
      <h2>{{ title() }}</h2>
      <div class="metrics">
        <div class="lu-card flat m"><strong>{{ fmt(recap().xp) }}</strong><span>XP gagnés</span></div>
        <div class="lu-card flat m"><strong>{{ recap().deltaPct === null ? '—' : (recap().deltaPct! >= 0 ? '+' : '') + recap().deltaPct + ' %' }}</strong><span>vs période préc.</span></div>
        <div class="lu-card flat m"><strong>{{ recap().done }}/{{ recap().proposed }}</strong><span>Quêtes</span></div>
      </div>
      <p class="narr">{{ recap().narrative }}</p>
      @for (a of abilities; track a) {
        <div class="ar"><span class="an"><i [style.background]="color(a)"></i>{{ label(a) }}</span><lu-bar [value]="recap().xpByAbility[a]" [max]="max()" /><span class="small">{{ recap().doneByAbility[a] }}</span></div>
      }
      @if (recap().best) { <p class="small"><span class="mint">À l’honneur :</span> {{ label(recap().best!) }}</p> }
      @if (recap().weakest) { <p class="small"><span class="gold">À surveiller :</span> {{ label(recap().weakest!) }}</p> }

      @if (showNew() && fresh().length) {
        <div class="lu-label">Les nouvelles quêtes de la période qui commence</div>
        @for (q of fresh(); track q.id) {
          <div class="nq">
            <span><strong>{{ q.snapshot.title }}</strong><small class="xs muted">{{ label(q.snapshot.ability) }} · {{ q.period === 'weekly' ? 'Semaine' : 'Mois' }}</small></span>
            @if (q.status === 'proposed') { <button type="button" class="lu-btn small mint" (click)="accept(q)">Accepter</button> } @else { <span class="lu-chip mint">Acceptée</span> }
          </div>
        }
      }
      <div class="lu-field">
        <label for="bn">Mon bilan personnel</label>
        <textarea id="bn" class="lu-input area" rows="3" [value]="note()" (input)="saveNote($any($event.target).value)" placeholder="Ce que je retiens, ce que je veux changer…"></textarea>
        <span class="hint">Privé : enregistré uniquement sur cet appareil.</span>
      </div>
      <button type="button" class="lu-btn" (click)="close.emit()">Continuer</button>
    </lu-modal>
  `,
  styles: `
    h2 { font-size: 26px; padding-right: 36px; }
    .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .m { align-items: center; gap: 4px; padding: 12px 6px; text-align: center; } .m strong { font-family: var(--lu-font-title); font-size: 24px; font-weight: 500; } .m span { font-size: 10px; color: var(--lu-muted); }
    .narr { font-family: var(--lu-font-title); font-style: italic; font-size: 15px; line-height: 1.6; padding: 12px 14px; border-left: 3px solid var(--lu-gold); background: var(--lu-surface-2); border-radius: 0 12px 12px 0; }
    .ar { display: grid; grid-template-columns: 96px 1fr 28px; gap: 10px; align-items: center; } .an { display: inline-flex; gap: 8px; align-items: center; font-size: 12px; } .an i { width: 10px; height: 10px; border-radius: 50%; display: inline-block; } .ar .small { text-align: right; }
    .mint { color: var(--lu-accent); } .nq { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--lu-border); } .nq span { display: flex; flex-direction: column; gap: 2px; }
  `,
})
export class RecapComponent {
  private game = inject(GameService);
  readonly kind = input.required<'week' | 'month'>();
  readonly start = input.required<string>();
  readonly title = input.required<string>();
  readonly recap = input.required<Recap>();
  readonly showNew = input(false);
  readonly close = output<void>();
  readonly abilities = ABILITIES;
  readonly fmt = fmt;
  readonly note = signal(this.read());
  readonly max = computed(() => Math.max(...ABILITIES.map((a) => this.recap().xpByAbility[a]), 1));
  readonly fresh = computed<QuestInstance[]>(() => this.game.instances().filter((i) => (i.period === 'weekly' || i.period === 'monthly') && (i.status === 'proposed' || i.status === 'accepted')));
  label = (a: AbilityId) => ABILITY_LABEL[a];
  color = (a: AbilityId) => ABILITY_COLOR[a];

  private read(): string {
    try {
      return localStorage.getItem(`lu-recap-note-${this.kind()}-${this.start()}`) ?? '';
    } catch {
      return '';
    }
  }
  saveNote(v: string): void {
    this.note.set(v);
    try {
      localStorage.setItem(`lu-recap-note-${this.kind()}-${this.start()}`, v);
    } catch {
      /* ignore */
    }
  }
  async accept(q: QuestInstance): Promise<void> {
    await this.game.accept(q);
  }
}
