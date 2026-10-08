import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ABILITY_COLOR, hashString, type AbilityId } from '@levelup/engine';

/** Illustration générée pour une quête : paysage de collines aux couleurs de la caractéristique. */
@Component({
  selector: 'lu-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 360 180" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true" class="scene">
      <defs>
        <linearGradient [attr.id]="'sky' + uid()" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" [attr.stop-color]="sky()[0]" />
          <stop offset="1" [attr.stop-color]="sky()[1]" />
        </linearGradient>
        <radialGradient [attr.id]="'sun' + uid()">
          <stop offset="0" stop-color="#fff6d8" />
          <stop offset="1" stop-color="#f2d38a" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="360" height="180" [attr.fill]="'url(#sky' + uid() + ')'" />
      <circle [attr.cx]="sunX()" cy="48" r="46" [attr.fill]="'url(#sun' + uid() + ')'" opacity="0.9" />
      <circle [attr.cx]="sunX()" cy="48" r="13" fill="#fff1c4" />
      @for (s of stars(); track $index) {
        <circle [attr.cx]="s[0]" [attr.cy]="s[1]" r="1.2" fill="#fff" opacity="0.6" />
      }
      <path [attr.d]="hill(0)" [attr.fill]="hills()[0]" opacity="0.55" />
      <path [attr.d]="hill(1)" [attr.fill]="hills()[1]" opacity="0.8" />
      <path [attr.d]="hill(2)" [attr.fill]="hills()[2]" />
      <path d="M150 180 C 170 150, 200 140, 230 118 S 270 96, 300 90" fill="none" stroke="#f2d38a" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 9" opacity="0.8" />
    </svg>
  `,
  styles: ':host{display:block} .scene{display:block;width:100%;height:100%}',
})
export class SceneComponent {
  readonly seed = input('');
  readonly ability = input<AbilityId>('CON');
  private n = computed(() => hashString(this.seed() + this.ability()));
  readonly uid = computed(() => this.n().toString(36));
  readonly sunX = computed(() => 50 + (this.n() % 260));
  readonly sky = computed<[string, string]>(() => {
    const c = ABILITY_COLOR[this.ability()];
    return [`color-mix(in srgb, ${c} 30%, #0f2a22)`, `color-mix(in srgb, ${c} 55%, #1c3b30)`];
  });
  readonly hills = computed<[string, string, string]>(() => {
    const c = ABILITY_COLOR[this.ability()];
    return [`color-mix(in srgb, ${c} 45%, #0f2a22)`, `color-mix(in srgb, ${c} 25%, #123327)`, '#0d2219'];
  });
  readonly stars = computed(() => Array.from({ length: 14 }, (_, i) => [(this.n() * (i + 3)) % 360, (this.n() * (i + 7)) % 70] as [number, number]));

  hill(i: number): string {
    const base = [118, 132, 150][i];
    const a = 12 + ((this.n() >> (i * 3)) % 26);
    const b = 10 + ((this.n() >> (i * 3 + 2)) % 22);
    return `M0 180 L0 ${base} C 70 ${base - a}, 130 ${base + b}, 200 ${base - b / 2} S 320 ${base - a}, 360 ${base} L360 180 Z`;
  }
}
