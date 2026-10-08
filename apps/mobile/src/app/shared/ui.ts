import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NavController } from '@ionic/angular';
import { ABILITY_COLOR, ABILITY_LABEL, type AbilityId } from '@levelup/engine';
import { IconComponent } from './icon.component';
import { ABILITY_ICON, initials } from './format';

// ───────────────────────── En-tête de page (maquettes) ─────────────────────────

@Component({
  selector: 'lu-page-header',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="lu-head">
      <div class="lu-head-context">
        <div class="lu-head-left">
          @if (back()) {
            <button type="button" class="lu-icon-btn" style="width: 34px; height: 34px" (click)="goBack()" aria-label="Retour">
              <lu-icon name="chevron-left" [size]="18" />
            </button>
          } @else {
            <span class="lu-badge"><lu-icon [name]="icon()" [size]="15" /></span>
          }
          <span class="lu-eyebrow">{{ eyebrow() }}</span>
        </div>
        <div class="lu-head-actions"><ng-content select="[actions]" /></div>
      </div>
      @if (title()) {
        <h1 class="lu-title">{{ title() }}</h1>
      }
      <ng-content />
    </header>
  `,
})
export class PageHeaderComponent {
  private nav = inject(NavController);
  readonly eyebrow = input('');
  readonly title = input('');
  readonly icon = input('sprout');
  readonly back = input(false);
  readonly backTo = input<string | null>(null);

  goBack(): void {
    const to = this.backTo();
    if (to) this.nav.navigateBack(to);
    else this.nav.back();
  }
}

// ───────────────────────── Barre de progression ─────────────────────────

@Component({
  selector: 'lu-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="lu-bar" [class.gold]="tone() === 'gold'" [class.thick]="thick()" [class.dashed]="dashed()" role="progressbar" [attr.aria-valuenow]="pct()" aria-valuemin="0" aria-valuemax="100"><i [style.width.%]="pct()"></i></div>`,
  styles: ':host{display:block}',
})
export class BarComponent {
  readonly value = input(0);
  readonly max = input(1);
  readonly tone = input<'mint' | 'gold'>('mint');
  readonly thick = input(false);
  readonly dashed = input(false);
  readonly pct = computed(() => Math.round(Math.min(Math.max(this.max() ? this.value() / this.max() : 0, 0), 1) * 100));
}

// ───────────────────────── Avatar à initiales ─────────────────────────

@Component({
  selector: 'lu-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="lu-avatar"
    [style.width.px]="size()"
    [style.height.px]="size()"
    [style.fontSize.px]="size() * 0.34"
    [style.borderColor]="ring()"
    [style.background]="tone() === 'gold' ? 'var(--lu-gold-bg)' : tone() === 'dark' ? 'var(--lu-surface-2)' : '#e5eddf'"
    [style.color]="tone() === 'gold' ? 'var(--lu-gold)' : tone() === 'dark' ? 'var(--lu-accent)' : '#285b46'"
    [attr.aria-label]="name()"
    >{{ text() }}</span
  >`,
  styles: ':host{display:inline-flex}',
})
export class AvatarComponent {
  readonly name = input('');
  readonly size = input(46);
  readonly ring = input<string>('transparent');
  readonly tone = input<'light' | 'gold' | 'dark'>('dark');
  readonly text = computed(() => initials(this.name()));
}

// ───────────────────────── Portrait (24 emblèmes) ─────────────────────────

const GLYPHS = ['footprints', 'compass', 'hammer', 'music', 'users', 'library', 'heart', 'leaf'];
const PALETTES: [string, string, string][] = [
  ['#285b46', '#8fd6a8', '#13261f'],
  ['#4a3b78', '#cbb8ff', '#1d1636'],
  ['#8a4a2a', '#ffc79a', '#2c160c'],
];

export const PORTRAIT_IDS = Array.from({ length: 24 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);

@Component({
  selector: 'lu-portrait',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="portrait" [style.width.px]="size()" [style.height.px]="size()" [style.background]="bg()" [style.borderColor]="frame()">
      <span class="glow"></span>
      <lu-icon [name]="glyph()" [size]="size() * 0.46" [stroke]="1.6" />
    </span>
  `,
  styles: `
    :host { display: inline-flex; }
    .portrait { position: relative; display: grid; place-items: center; border-radius: 50%; border: 3px solid; overflow: hidden; color: var(--ink); box-shadow: inset 0 0 0 2px rgba(255,255,255,.06); }
    .glow { position: absolute; inset: 0; background: radial-gradient(circle at 30% 25%, rgba(255,255,255,.28), transparent 55%); }
    lu-icon { position: relative; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
  `,
  host: { '[style.--ink]': 'ink()' },
})
export class PortraitComponent {
  readonly id = input('p01');
  readonly size = input(64);
  readonly frame = input('#2f5a47');
  private idx = computed(() => Math.max(PORTRAIT_IDS.indexOf(this.id()), 0));
  readonly glyph = computed(() => GLYPHS[this.idx() % 8]);
  private pal = computed(() => PALETTES[Math.floor(this.idx() / 8) % 3]);
  readonly bg = computed(() => `linear-gradient(150deg, ${this.pal()[0]}, ${this.pal()[2]})`);
  readonly ink = computed(() => this.pal()[1]);
}

// ───────────────────────── Pastille de caractéristique ─────────────────────────

@Component({
  selector: 'lu-ability-badge',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="b" [style.width.px]="size()" [style.height.px]="size()" [style.--c]="color()"><lu-icon [name]="icon()" [size]="size() * 0.52" /></span>`,
  styles: `
    :host { display: inline-flex; }
    .b { display: grid; place-items: center; border-radius: 50%; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); border: 1px solid color-mix(in srgb, var(--c) 40%, transparent); }
  `,
})
export class AbilityBadgeComponent {
  readonly ability = input.required<AbilityId>();
  readonly size = input(34);
  readonly icon = computed(() => ABILITY_ICON[this.ability()]);
  readonly color = computed(() => ABILITY_COLOR[this.ability()]);
}

// ───────────────────────── Radar des 6 caractéristiques ─────────────────────────

const AXES: AbilityId[] = ['CON', 'SAG', 'INT', 'CHA', 'DEX', 'FOR'];

@Component({
  selector: 'lu-radar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 300 280" role="img" [attr.aria-label]="aria()" class="radar">
      @for (r of rings; track r) {
        <polygon [attr.points]="ring(r)" fill="none" stroke="var(--lu-border-strong)" stroke-width="1" [attr.opacity]="r === max() ? 0.9 : 0.5" />
      }
      @for (a of axes; track a; let i = $index) {
        <line x1="150" y1="140" [attr.x2]="pt(i, max())[0]" [attr.y2]="pt(i, max())[1]" stroke="var(--lu-border)" stroke-width="1" />
      }
      @if (base()) {
        <polygon [attr.points]="poly(base()!)" fill="var(--lu-muted)" fill-opacity="0.12" stroke="var(--lu-muted)" stroke-width="1.5" stroke-dasharray="4 4" />
      }
      <polygon [attr.points]="poly(scores())" fill="var(--lu-accent)" fill-opacity="0.28" stroke="var(--lu-accent)" stroke-width="2.4" stroke-linejoin="round" />
      @for (a of axes; track a; let i = $index) {
        <circle [attr.cx]="pt(i, scores()[a])[0]" [attr.cy]="pt(i, scores()[a])[1]" r="4" fill="var(--lu-accent)" />
        <text [attr.x]="lab(i)[0]" [attr.y]="lab(i)[1]" text-anchor="middle" dominant-baseline="middle" class="t" [class.weak]="a === highlight()">
          {{ label(a) }}
        </text>
      }
    </svg>
  `,
  styles: `
    :host { display: block; }
    .radar { width: 100%; height: auto; display: block; }
    .t { fill: var(--lu-text-2); font: 600 11px var(--lu-font-body); }
    .t.weak { fill: var(--lu-gold); }
  `,
})
export class RadarComponent {
  readonly scores = input.required<Record<AbilityId, number>>();
  readonly base = input<Record<AbilityId, number> | null>(null);
  readonly max = input(20);
  readonly highlight = input<AbilityId | null>(null);
  readonly axes = AXES;
  readonly rings = [5, 10, 15, 20];
  readonly aria = computed(() => 'Radar : ' + AXES.map((a) => `${ABILITY_LABEL[a]} ${this.scores()[a]}`).join(', '));

  label(a: AbilityId): string {
    return ABILITY_LABEL[a];
  }
  pt(i: number, v: number): [number, number] {
    const ang = (-90 + i * 60) * (Math.PI / 180);
    const r = (Math.min(v, this.max()) / this.max()) * 100;
    return [150 + r * Math.cos(ang), 140 + r * Math.sin(ang)];
  }
  lab(i: number): [number, number] {
    const ang = (-90 + i * 60) * (Math.PI / 180);
    return [150 + 124 * Math.cos(ang), 140 + 122 * Math.sin(ang)];
  }
  poly(s: Record<AbilityId, number>): string {
    return AXES.map((a, i) => this.pt(i, Math.max(s[a], 0)).join(',')).join(' ');
  }
  ring(r: number): string {
    return AXES.map((_, i) => this.pt(i, r).join(',')).join(' ');
  }
}

// ───────────────────────── État vide ─────────────────────────

@Component({
  selector: 'lu-empty',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lu-empty">
      <span class="lu-badge" style="width: 56px; height: 56px"><lu-icon [name]="icon()" [size]="26" /></span>
      <h3>{{ title() }}</h3>
      <p>{{ text() }}</p>
      <ng-content />
    </div>
  `,
})
export class EmptyComponent {
  readonly icon = input('sprout');
  readonly title = input('');
  readonly text = input('');
}

// ───────────────────────── Interrupteur accessible ─────────────────────────

@Component({
  selector: 'lu-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="lu-switch" role="switch" [attr.aria-checked]="checked()" [attr.aria-label]="label()" (click)="changed.emit(!checked())"></button>`,
})
export class SwitchComponent {
  readonly checked = input(false);
  readonly label = input('');
  readonly changed = output<boolean>();
}

export const UI = [PageHeaderComponent, BarComponent, AvatarComponent, PortraitComponent, AbilityBadgeComponent, RadarComponent, EmptyComponent, SwitchComponent, IconComponent] as const;
