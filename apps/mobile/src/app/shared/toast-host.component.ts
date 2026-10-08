import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameService } from '../core/game.service';
import { IconComponent } from './icon.component';

@Component({
  selector: 'lu-toast-host',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="host" aria-live="polite" aria-atomic="true">
      @for (t of game.toasts(); track t.id) {
        <div class="toast fade-in" [class.error]="t.tone === 'error'" [class.success]="t.tone === 'success'" role="status">
          <lu-icon [name]="t.tone === 'error' ? 'warning' : t.tone === 'success' ? 'circle-check' : 'info'" [size]="16" />
          <span>{{ t.text }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .host { position: fixed; left: 0; right: 0; bottom: calc(86px + var(--lu-safe-bottom)); z-index: 30000; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; padding: 0 16px; }
    .toast { display: inline-flex; align-items: center; gap: 8px; max-width: 440px; padding: 11px 16px; border-radius: 14px; background: var(--lu-surface-2); color: var(--lu-text); border: 1px solid var(--lu-border-strong); box-shadow: var(--lu-shadow); font-size: 13px; line-height: 1.35; }
    .toast.error { border-color: color-mix(in srgb, var(--lu-danger) 55%, transparent); }
    .toast.success lu-icon { color: var(--lu-accent); }
    .toast.error lu-icon { color: var(--lu-danger); }
  `,
})
export class ToastHostComponent {
  protected game = inject(GameService);
}
