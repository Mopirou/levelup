import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  ABILITIES,
  ABILITY_LABEL,
  IMPROVEMENT_LEVELS,
  MIN_SCORE,
  PATH_LEVEL,
  abilityScores,
  emptyAbilityRecord,
  tierAt,
  unlocksAt,
  type AbilityId,
} from '@levelup/engine';
import levels from '@levelup/content/levels.fr.json';
import { GameService, type Overlay } from '../core/game.service';
import { haptic, playSound } from '../core/feedback';
import { IconComponent } from './icon.component';
import { AbilityBadgeComponent, RadarComponent } from './ui';

function unlocksText(level: number): string[] {
  const now = unlocksAt(level);
  const before = unlocksAt(level - 1);
  const out: string[] = [];
  if (level === 2) out.push('La Forge : crée tes propres quêtes');
  if (level === PATH_LEVEL) out.push('Choisis une voie pour ta classe');
  if (IMPROVEMENT_LEVELS.includes(level)) out.push('Amélioration : +2 à répartir entre tes caractéristiques');
  if (now.dailyQuests > before.dailyQuests) out.push(`${now.dailyQuests} quêtes par jour`);
  if (now.weeklyQuests > before.weeklyQuests) out.push(`${now.weeklyQuests} quêtes par semaine`);
  if (now.monthlyQuests > before.monthlyQuests) out.push(`${now.monthlyQuests} quêtes par mois`);
  if (now.expertEverywhere && !before.expertEverywhere) out.push('Quêtes légendaires débloquées partout');
  if (now.epic && !before.epic) out.push('Quêtes épiques trimestrielles');
  return out;
}

@Component({
  selector: 'lu-overlay-host',
  imports: [IconComponent, AbilityBadgeComponent, RadarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (current(); as o) {
      @switch (o.kind) {
        @case ('level-up') {
          <div class="screen level" role="dialog" aria-modal="true" aria-label="Montée de niveau">
            <div class="rays" aria-hidden="true"></div>
            <div class="inner fade-in">
              <p class="kicker">Montée de niveau</p>
              <div class="big pop">{{ o.level }}</div>
              <p class="tier">{{ tierName(o.level) }}</p>
              <p class="text">{{ levelText(o.level) }}</p>
              @if (unlocks(o.level).length) {
                <ul class="unlocks">
                  @for (u of unlocks(o.level); track u) {
                    <li><lu-icon name="sparkles" [size]="15" /> {{ u }}</li>
                  }
                </ul>
              }
              <button type="button" class="lu-btn light" (click)="game.shiftOverlay()">Continuer</button>
            </div>
          </div>
        }
        @case ('path') {
          <div class="screen sheet" role="dialog" aria-modal="true" aria-label="Choix de la voie">
            <div class="inner fade-in">
              <p class="kicker">Niveau 3</p>
              <h2>Choisis ta spécialité</h2>
              <p class="text">Une voie ajoute une affinité secondaire (+2 XP par quête) et un titre. Ce choix est définitif.</p>
              @for (p of game.classDef()?.paths ?? []; track p.id) {
                <button type="button" class="path" [class.on]="pathChoice() === p.id" (click)="pathChoice.set(p.id)">
                  <div class="row">
                    <lu-ability-badge [ability]="p.ability" [size]="40" />
                    <div>
                      <strong>{{ p.name }}</strong>
                      <span class="xs muted">Titre : {{ p.title }}</span>
                    </div>
                  </div>
                  <p class="small muted">{{ p.description }}</p>
                </button>
              }
              <button type="button" class="lu-btn mint" [disabled]="!pathChoice() || busy()" (click)="confirmPath()">Suivre cette voie</button>
            </div>
          </div>
        }
        @case ('improvement') {
          <div class="screen sheet" role="dialog" aria-modal="true" aria-label="Amélioration de caractéristique">
            <div class="inner fade-in">
              <p class="kicker">Amélioration</p>
              <h2>Améliore une caractéristique</h2>
              <p class="text">Ajoute +2 à une caractéristique, ou +1 à deux caractéristiques. Une caractéristique ne peut pas dépasser 20 par ce moyen.</p>
              <div class="lu-seg">
                <button type="button" [class.on]="mode() === 'two'" (click)="setMode('two')">+2 à une</button>
                <button type="button" [class.on]="mode() === 'one'" (click)="setMode('one')">+1 à deux</button>
              </div>
              <div class="grid">
                @for (a of abilities; track a) {
                  <button type="button" class="ab" [class.on]="picked().includes(a)" [disabled]="scores()[a] + (mode() === 'two' ? 2 : 1) > 20" (click)="pick(a)">
                    <lu-ability-badge [ability]="a" [size]="30" />
                    <strong>{{ scores()[a] }}</strong>
                    @if (picked().includes(a)) {
                      <em>→ {{ scores()[a] + (mode() === 'two' ? 2 : 1) }}</em>
                    }
                    <span class="xs muted">{{ label(a) }}</span>
                  </button>
                }
              </div>
              <lu-radar [scores]="preview()" [base]="scores()" />
              <button type="button" class="lu-btn mint" [disabled]="!ready() || busy()" (click)="confirmImprovement()">Valider définitivement</button>
            </div>
          </div>
        }
        @case ('ability-up') {
          <div class="banner fade-in" role="status">
            <lu-ability-badge [ability]="o.up.ability" [size]="36" />
            <div>
              <strong>{{ label(o.up.ability) }} {{ o.up.from }} → {{ o.up.to }}</strong>
              <span class="xs muted">Gagné grâce à tes quêtes</span>
            </div>
          </div>
        }
        @case ('achievement') {
          <div class="banner gold fade-in" role="status">
            <span class="trophy"><lu-icon name="trophy" [size]="22" /></span>
            <div>
              <strong>{{ o.achievement.name }}</strong>
              <span class="xs">Succès débloqué{{ o.achievement.xpBonus ? ' · +' + o.achievement.xpBonus + ' XP' : '' }}</span>
            </div>
          </div>
        }
      }
    }
  `,
  styles: `
    .screen { position: fixed; inset: 0; z-index: 20000; display: grid; place-items: center; padding: calc(var(--lu-safe-top) + 20px) 20px calc(var(--lu-safe-bottom) + 20px); overflow-y: auto; }
    .screen.level { background: radial-gradient(circle at 50% 38%, #1d4a38 0%, #0b1a14 70%); color: #f3f7f2; }
    .screen.sheet { background: var(--lu-overlay); backdrop-filter: blur(6px); align-items: end; }
    .rays { position: absolute; inset: -30%; background: repeating-conic-gradient(from 0deg, rgba(242,211,138,.12) 0 10deg, transparent 10deg 20deg); animation: spin 40s linear infinite; mask-image: radial-gradient(circle, #000 0%, transparent 60%); }
    @keyframes spin { to { transform: rotate(360deg); } }
    .inner { position: relative; width: 100%; max-width: 440px; display: flex; flex-direction: column; gap: 14px; text-align: center; }
    .sheet .inner { text-align: left; background: var(--lu-bg); border: 1px solid var(--lu-border-strong); border-radius: 24px; padding: 22px 18px 18px; max-height: 92vh; overflow-y: auto; }
    .kicker { font: 700 11px var(--lu-font-body); letter-spacing: .16em; text-transform: uppercase; color: var(--lu-gold); }
    .big { font-family: var(--lu-font-title); font-size: 168px; line-height: 1; font-weight: 600; background: linear-gradient(180deg, #fbe8b0, #d4af37); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: 0 0 60px rgba(242,211,138,.4); }
    .tier { font-family: var(--lu-font-title); font-size: 22px; color: #f3f7f2; }
    .text { font-size: 14px; line-height: 1.55; color: var(--lu-text-2); }
    .level .text { color: #c7d8c9; }
    .unlocks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; align-items: center; }
    .unlocks li { display: inline-flex; gap: 8px; align-items: center; background: rgba(242,211,138,.12); color: var(--lu-gold); padding: 8px 14px; border-radius: 100px; font-size: 12px; font-weight: 600; }
    h2 { font-size: 26px; }
    .path { text-align: left; border-radius: 18px; border: 1px solid var(--lu-border); background: var(--lu-surface); padding: 14px; display: flex; flex-direction: column; gap: 10px; color: inherit; cursor: pointer; }
    .path.on { border-color: var(--lu-accent); background: color-mix(in srgb, var(--lu-accent) 10%, var(--lu-surface)); }
    .path .row { display: flex; align-items: center; gap: 12px; }
    .path strong { display: block; font-family: var(--lu-font-title); font-size: 17px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .ab { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; border-radius: 14px; border: 1px solid var(--lu-border); background: var(--lu-surface); color: inherit; cursor: pointer; }
    .ab strong { font-family: var(--lu-font-title); font-size: 22px; font-weight: 500; }
    .ab em { font-style: normal; font-size: 11px; font-weight: 700; color: var(--lu-accent); }
    .ab.on { border-color: var(--lu-accent); background: color-mix(in srgb, var(--lu-accent) 12%, var(--lu-surface)); }
    .ab:disabled { opacity: .35; }
    .banner { position: fixed; z-index: 20001; top: calc(var(--lu-safe-top) + 12px); left: 50%; transform: translateX(-50%); width: min(440px, calc(100% - 24px)); display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 18px; background: var(--lu-surface-2); border: 1px solid var(--lu-border-strong); box-shadow: var(--lu-shadow); }
    .banner strong { display: block; font-size: 14px; }
    .banner.gold { background: var(--lu-gold-bg); border-color: color-mix(in srgb, var(--lu-gold) 45%, transparent); color: var(--lu-gold); }
    .trophy { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--lu-gold) 20%, transparent); }
  `,
})
export class OverlayHostComponent {
  protected game = inject(GameService);
  readonly abilities = ABILITIES;
  readonly current = computed<Overlay | undefined>(() => this.game.overlays()[0]);
  readonly pathChoice = signal<string | null>(null);
  readonly mode = signal<'two' | 'one'>('two');
  readonly picked = signal<AbilityId[]>([]);
  readonly busy = signal(false);
  readonly scores = computed(() => (this.game.character() ? abilityScores(this.game.character()!) : emptyAbilityRecord(MIN_SCORE)));
  readonly preview = computed(() => {
    const s = { ...this.scores() };
    const add = this.mode() === 'two' ? 2 : 1;
    for (const a of this.picked()) s[a] += add;
    return s;
  });
  readonly ready = computed(() => (this.mode() === 'two' ? this.picked().length === 1 : this.picked().length === 2));

  constructor() {
    // Les bannières (caractéristique en hausse, succès) disparaissent seules ; les sons accompagnent l'événement.
    effect(() => {
      const o = this.current();
      if (!o) return;
      untracked(() => {
        const sounds = this.game.settings()?.sounds ?? true;
        if (o.kind === 'level-up') {
          playSound('level', sounds);
          void haptic('success');
        } else if (o.kind === 'achievement') {
          playSound('trophy', sounds);
          void haptic('success');
          setTimeout(() => this.dismissIf(o), 4200);
        } else if (o.kind === 'ability-up') {
          playSound('xp', sounds);
          setTimeout(() => this.dismissIf(o), 3400);
        }
      });
    });
  }

  private dismissIf(o: Overlay): void {
    if (this.current() === o) this.game.shiftOverlay();
  }

  label = (a: AbilityId) => ABILITY_LABEL[a];
  tierName = (l: number) => tierAt(l).name;
  levelText = (l: number) => levels.find((x) => x.level === l)?.text ?? '';
  unlocks = (l: number) => unlocksText(l);

  setMode(m: 'two' | 'one'): void {
    this.mode.set(m);
    this.picked.set([]);
  }
  pick(a: AbilityId): void {
    const cur = this.picked();
    if (cur.includes(a)) this.picked.set(cur.filter((x) => x !== a));
    else if (this.mode() === 'two') this.picked.set([a]);
    else this.picked.set(cur.length >= 2 ? [cur[1], a] : [...cur, a]);
  }

  async confirmPath(): Promise<void> {
    if (!this.pathChoice()) return;
    this.busy.set(true);
    const ok = await this.game.choosePath(this.pathChoice()!);
    this.busy.set(false);
    if (ok) {
      this.pathChoice.set(null);
      this.game.shiftOverlay();
    }
  }

  async confirmImprovement(): Promise<void> {
    const p = this.picked();
    this.busy.set(true);
    const ok = await this.game.chooseImprovement(this.mode() === 'two' ? { plus2: p[0] } : { plus1: [p[0], p[1]] });
    this.busy.set(false);
    if (ok) {
      this.picked.set([]);
      this.mode.set('two');
      this.game.shiftOverlay();
    }
  }
}
