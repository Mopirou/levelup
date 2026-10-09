import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { ABILITY_COLOR, interestKey } from '@levelup/engine';
import { THEMES } from './themes';
import { IconComponent } from './icon.component';

/**
 * Choix des centres d'intérêt : on coche une discipline (cuisine, programmation, langues…),
 * puis, si l'on veut, des activités précises (espagnol, pain maison…). Sans activité cochée, toute la discipline compte.
 */
@Component({
  selector: 'lu-interests-picker',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="list">
      @for (t of themes; track t.id) {
        <div class="disc" [class.on]="has(t.id)">
          <button type="button" class="head" (click)="toggleTheme(t.id)" [attr.aria-pressed]="has(t.id)">
            <span class="dot" [style.background]="color(t.ability)"></span>
            <span class="txt"><strong>{{ t.label }}</strong><span class="xs muted">{{ t.blurb }}</span></span>
            <span class="tick">@if (has(t.id)) { <lu-icon name="check" [size]="16" [stroke]="3" /> }</span>
          </button>
          @if (has(t.id)) {
            <div class="acts" role="group" [attr.aria-label]="'Activités de ' + t.label">
              @for (a of t.activities; track a) {
                <button type="button" class="act" [class.on]="has(key(t.id, a))" (click)="toggleActivity(t.id, a)" [attr.aria-pressed]="has(key(t.id, a))">{{ a }}</button>
              }
            </div>
            <p class="xs muted hint">Précise ce qui t’intéresse, ou laisse tout décoché pour toute la discipline.</p>
          }
        </div>
      }
    </div>
    <p class="xs muted count">{{ count() ? count() + ' discipline' + (count() > 1 ? 's' : '') + ' choisie' + (count() > 1 ? 's' : '') : 'Aucune discipline choisie : tu verras surtout des quêtes générales.' }}</p>
  `,
  styles: `
    .list { display: flex; flex-direction: column; gap: 8px; }
    .disc { border: 1px solid var(--lu-border, rgba(127, 127, 127, 0.25)); border-radius: 14px; overflow: hidden; background: var(--lu-card, transparent); }
    .disc.on { border-color: var(--lu-accent, #2f5a47); }
    .head { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; background: none; border: 0; text-align: left; color: inherit; font: inherit; cursor: pointer; min-height: 48px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
    .txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .tick { width: 20px; display: grid; place-items: center; color: var(--lu-accent, #2f5a47); }
    .acts { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 14px 6px; }
    .act { height: 32px; padding: 0 12px; border-radius: 100px; border: 1px solid var(--lu-border, rgba(127, 127, 127, 0.35)); background: none; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
    .act.on { background: var(--lu-accent, #2f5a47); border-color: var(--lu-accent, #2f5a47); color: #fff; }
    .hint { padding: 0 14px 12px; margin: 0; }
    .count { margin: 10px 2px 0; }
  `,
})
export class InterestsPickerComponent {
  readonly value = model<string[]>([]);
  readonly themes = THEMES;
  readonly count = computed(() => THEMES.filter((t) => this.value().includes(t.id)).length);

  color = (a: keyof typeof ABILITY_COLOR) => ABILITY_COLOR[a];
  key = (theme: string, activity: string) => interestKey(theme, activity);
  has = (k: string) => this.value().includes(k);

  toggleTheme(id: string): void {
    const cur = this.value();
    // Décocher une discipline retire aussi ses activités précises.
    this.value.set(cur.includes(id) ? cur.filter((k) => k !== id && !k.startsWith(`${id}:`)) : [...cur, id]);
  }

  toggleActivity(theme: string, activity: string): void {
    const k = interestKey(theme, activity);
    const cur = this.value();
    this.value.set(cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  }
}
