import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ItemView } from '../core/api/types';
import { ITEM_LABEL, itemInfo } from '../features/adventure/adventure.model';

/** Ligne compacte d'un objet : glyphe, nom, rareté (texte), niveau et PP. Le parent fournit `data-rarity`. */
@Component({
  selector: 'lu-item-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="g" aria-hidden="true">{{ info().glyph }}</span>
    <span class="t">
      <strong>{{ info().name }}@if (item().affinity) { <span class="aff" title="Objet de ta classe : +20 % de PP">★<span class="sr-only"> objet de ta classe, +20 % de PP</span></span> }</strong>
      <span class="xs">{{ label[item().rarity] }} · niv. {{ item().level }}</span>
    </span>
    <span class="p">{{ item().power }} PP</span>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 12px; }
    .g { font-size: 26px; line-height: 1; flex: none; }
    .t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .t strong { font-size: 14px; }
    .xs { font-size: 12px; color: var(--lu-text-2); }
    .aff { color: var(--lu-gold); margin-left: 4px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: 0; }
    .p { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  `,
})
export class ItemChipComponent {
  readonly item = input.required<ItemView>();
  readonly info = computed(() => itemInfo(this.item()));
  readonly label = ITEM_LABEL;
}
