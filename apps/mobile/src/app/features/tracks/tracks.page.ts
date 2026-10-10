import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { GameService } from '../../core/game.service';
import { PageHeaderComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { themeLabel } from '../../shared/themes';
import { TracksPickerComponent } from '../../shared/tracks-picker.component';

/**
 * « Mes parcours » : choisir, mettre en pause ou arrêter ses parcours de discipline (ouvert depuis l'écran Quêtes).
 * Avec `?suggest=1` (carte « Nouveau : les parcours »), les parcours déduits des anciens centres d'intérêt sont
 * proposés en tête, pré-sélectionnés (3 au maximum), à valider d'un geste.
 */
@Component({
  selector: 'app-tracks',
  imports: [IonContent, PageHeaderComponent, TracksPickerComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <lu-page-header [back]="true" eyebrow="Progression" icon="compass" title="Mes parcours" />
      <div class="lu-page">
        <p class="lead">Choisis jusqu’à trois activités à faire progresser. Chaque jour, tu reçois la quête de ton échelon ; la mise en pause garde ton échelon sans pénalité.</p>

        @if (showSuggestions()) {
          <section class="lu-card sugg" aria-labelledby="h-sugg">
            <h3 id="h-sugg" class="sh">Proposés d’après tes centres d’intérêt</h3>
            <p class="small muted">Décoche ceux que tu ne veux pas, puis commence. Tu pourras en changer à tout moment.</p>
            <ul class="sl">
              @for (d of available(); track d.id) {
                <li>
                  <button type="button" class="srow" [class.on]="isPicked(d.id)" [attr.aria-pressed]="isPicked(d.id)" [disabled]="busy() || (!isPicked(d.id) && picked().length >= slots())" (click)="toggle(d.id)">
                    <span class="box" aria-hidden="true">@if (isPicked(d.id)) { <lu-icon name="check" [size]="14" [stroke]="3" /> }</span>
                    <span class="stx"><strong>{{ d.label }}</strong><span class="xs muted">{{ discipline(d.theme) }}</span></span>
                  </button>
                </li>
              }
            </ul>
            <button type="button" class="lu-btn mint" [disabled]="busy() || !picked().length" (click)="start()">
              <lu-icon name="play" [size]="17" /> {{ picked().length > 1 ? 'Commencer ces ' + picked().length + ' parcours' : picked().length === 1 ? 'Commencer ce parcours' : 'Choisis au moins un parcours' }}
            </button>
          </section>
        }

        <lu-tracks-picker mode="live" />
      </div>
    </ion-content>
  `,
  styles: `
    .lead { font-size: 14px; line-height: 1.55; color: var(--lu-text-2); margin: 0; }
    .sugg { gap: 12px; border-color: var(--lu-accent); }
    .sh { font-size: 18px; margin: 0; }
    .sl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .srow { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; padding: 8px 12px; border-radius: 14px; border: 1px solid var(--lu-border-strong); background: var(--lu-surface-2); color: var(--lu-text); font: inherit; text-align: left; cursor: pointer; }
    .srow.on { border-color: var(--lu-accent); }
    .srow:disabled { opacity: 0.5; cursor: not-allowed; }
    .box { flex: none; width: 24px; height: 24px; border-radius: 8px; border: 1.5px solid var(--lu-border-strong); display: grid; place-items: center; color: var(--lu-accent-ink); }
    .srow.on .box { background: var(--lu-accent); border-color: var(--lu-accent); }
    .stx { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  `,
})
export class TracksPage {
  private game = inject(GameService);
  /** `?suggest=1` : affiche les parcours déduits des anciens centres d'intérêt */
  readonly suggest = input<string | undefined>(undefined);
  readonly busy = signal(false);
  private readonly manual = signal<string[] | null>(null);

  /** Suggestions pas encore commencées. */
  readonly available = computed(() => this.game.trackSuggestions().filter((d) => !this.game.trackState(d.id)));
  readonly slots = computed(() => Math.max(0, this.game.maxTracks - this.game.activeTracks().length));
  readonly picked = computed(() => {
    const ids = this.manual() ?? this.available().map((d) => d.id);
    return ids.filter((id) => this.available().some((d) => d.id === id)).slice(0, this.slots());
  });
  readonly showSuggestions = computed(() => !!this.suggest() && this.available().length > 0 && this.slots() > 0);
  discipline = themeLabel;
  isPicked = (id: string) => this.picked().includes(id);

  toggle(id: string): void {
    const cur = this.picked();
    this.manual.set(cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < this.slots() ? [...cur, id] : cur);
  }

  async start(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      for (const id of this.picked()) if (!(await this.game.startTrack(id))) break;
    } finally {
      this.busy.set(false);
    }
  }
}
