import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

/** Panneau modal (feuille du bas) : fermeture par le fond, la croix ou Échap. */
@Component({
  selector: 'lu-modal',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="back" (click)="close.emit()" role="dialog" aria-modal="true" [attr.aria-label]="label()">
      <div class="panel fade-in" (click)="$event.stopPropagation()">
        <button type="button" class="x lu-icon-btn" aria-label="Fermer" (click)="close.emit()"><lu-icon name="x" [size]="16" /></button>
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .back { position: fixed; inset: 0; z-index: 9000; display: flex; align-items: flex-end; justify-content: center; background: var(--lu-overlay); backdrop-filter: blur(4px); }
    .panel { position: relative; width: min(480px, 100%); max-height: 92vh; overflow-y: auto; background: var(--lu-bg); border: 1px solid var(--lu-border-strong); border-bottom: 0; border-radius: 24px 24px 0 0; padding: 22px 20px calc(24px + var(--lu-safe-bottom)); display: flex; flex-direction: column; gap: 14px; }
    .x { position: absolute; right: 14px; top: 14px; }
  `,
})
export class ModalComponent {
  readonly label = input('');
  readonly close = output<void>();

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close.emit();
  }
}
