import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, model, signal, type WritableSignal } from '@angular/core';
import { MAX_ACTIVE_TRACKS, TRACK_PROMOTE_HITS, type TrackDef, type TrackState } from '@levelup/engine';
import { GameService } from '../core/game.service';
import { UiService } from '../core/ui.service';
import { IconComponent } from './icon.component';
import { AbilityBadgeComponent } from './ui';
import { themeLabel } from './themes';
import { THEMES_WITH_TRACKS, trackDef, tracksOfTheme, trackRungMinScore } from './tracks';

interface MineRow {
  def: TrackDef;
  status: 'active' | 'paused';
  state: TrackState | null;
  sub: string;
}

/**
 * Choix des parcours : on part des disciplines, on déplie, on active un parcours (3 au maximum).
 * - mode « live » (Réglages, écran « Mes parcours ») : agit tout de suite sur le personnage (démarrer, pause, arrêt) ;
 * - mode « draft » (création du personnage) : mémorise seulement la sélection dans `selection`.
 */
@Component({
  selector: 'lu-tracks-picker',
  imports: [IconComponent, AbilityBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="top">
      <p class="count" role="status"><strong>{{ activeCount() }} / {{ max }}</strong> parcours actif{{ activeCount() > 1 ? 's' : '' }}</p>
      @if (full()) {
        <p class="small muted">Tu as atteint la limite de {{ max }} parcours : {{ mode() === 'live' ? 'mets-en un en pause ou arrête-en un' : 'retire-en un' }} pour en choisir un autre.</p>
      } @else {
        <p class="small muted">Chaque jour, tu reçois la quête de ton échelon. Tu montes d’un échelon après {{ promote }} jours validés.</p>
      }
    </div>

    <section class="mine" aria-labelledby="tp-mine">
      <h3 id="tp-mine" class="sub">{{ mode() === 'live' ? 'En cours' : 'Mon choix' }}</h3>
      @for (r of mine(); track r.def.id) {
        <div class="mrow" [class.paused]="r.status === 'paused'">
          <lu-ability-badge [ability]="r.def.ability" [size]="36" />
          <div class="mtxt">
            <strong>{{ r.def.label }}</strong>
            <span class="small muted">{{ themeName(r.def.theme) }} · {{ r.sub }}</span>
          </div>
          <div class="macts">
            @if (mode() === 'live') {
              <button type="button" class="act" [disabled]="busy() || (r.status === 'paused' && full())" (click)="pause(r)" [attr.aria-label]="(r.status === 'paused' ? 'Reprendre le parcours ' : 'Mettre en pause le parcours ') + r.def.label">
                <lu-icon [name]="r.status === 'paused' ? 'play' : 'pause'" [size]="16" />
                <span>{{ r.status === 'paused' ? 'Reprendre' : 'Pause' }}</span>
              </button>
              <button type="button" class="act danger" [disabled]="busy()" (click)="stop(r)" [attr.aria-label]="'Arrêter le parcours ' + r.def.label">
                <lu-icon name="x" [size]="16" /><span>Arrêter</span>
              </button>
            } @else {
              <button type="button" class="act" (click)="toggleDraft(r.def.id)" [attr.aria-label]="'Retirer le parcours ' + r.def.label">
                <lu-icon name="x" [size]="16" /><span>Retirer</span>
              </button>
            }
          </div>
        </div>
      } @empty {
        <p class="small muted">Aucun parcours pour l’instant : ouvre une discipline ci-dessous et choisis ce que tu veux pratiquer.</p>
      }
    </section>

    <h3 class="sub">Disciplines</h3>
    <div class="list">
      @for (t of themes; track t.id) {
        <div class="disc" [class.on]="chosenIn(t.id) > 0">
          <button type="button" class="head" [attr.aria-expanded]="isOpen(t.id)" [attr.aria-controls]="'tp-' + t.id" (click)="toggle(t.id)">
            <lu-ability-badge [ability]="t.ability" [size]="36" />
            <span class="txt"><strong>{{ t.label }}</strong><span class="small muted">{{ t.blurb }}</span></span>
            @if (chosenIn(t.id) > 0) {
              <span class="lu-chip mint">{{ chosenIn(t.id) }} actif{{ chosenIn(t.id) > 1 ? 's' : '' }}</span>
            }
            <lu-icon [name]="isOpen(t.id) ? 'chevron-down' : 'chevron-right'" [size]="18" />
          </button>
          @if (isOpen(t.id)) {
            @if (full()) {
              <p class="small full-note" [id]="'tp-full-' + t.id"><lu-icon name="info" [size]="14" /> {{ max }} parcours déjà {{ mode() === 'live' ? 'actifs' : 'choisis' }} : {{ mode() === 'live' ? 'mets-en un en pause ou arrête-en un' : 'retire-en un' }} pour pouvoir en {{ mode() === 'live' ? 'commencer' : 'choisir' }} un autre.</p>
            }
            <ul class="trks" [id]="'tp-' + t.id" [attr.aria-label]="'Parcours de ' + t.label">
              @for (d of tracksOf(t.id); track d.id) {
                <li class="trk">
                  <div class="trow" [id]="'trk-' + d.id" tabindex="-1">
                    <div class="ttxt">
                      <strong>{{ d.label }}</strong>
                      <span class="small muted">{{ d.blurb }}</span>
                    </div>
                    <div class="tact">
                      @if (statusOf(d.id); as st) {
                        <span class="lu-chip" [class.mint]="st === 'active'">{{ st === 'active' ? (mode() === 'live' ? 'Actif' : 'Choisi') : 'En pause' }}</span>
                        @if (mode() === 'draft') {
                          <button type="button" class="act" (click)="toggleDraft(d.id)" [attr.aria-label]="'Retirer le parcours ' + d.label + ' (' + t.label + ')'"><span>Retirer</span></button>
                        }
                      } @else {
                        <button type="button" class="lu-btn small" [disabled]="busy() || full()" [attr.aria-describedby]="full() ? 'tp-full-' + t.id : null" (click)="add(d)" [attr.aria-label]="(mode() === 'live' ? 'Commencer le parcours ' : 'Choisir le parcours ') + d.label + ' (' + t.label + ')'">
                          <lu-icon name="plus" [size]="15" /> {{ mode() === 'live' ? 'Commencer' : 'Choisir' }}
                        </button>
                      }
                    </div>
                  </div>
                  <button type="button" class="lad" [attr.aria-expanded]="ladderOpen(d.id)" [attr.aria-controls]="'lad-' + d.id" (click)="toggleLadder(d.id)">
                    <lu-icon [name]="ladderOpen(d.id) ? 'chevron-down' : 'chevron-right'" [size]="14" />
                    Voir les {{ d.rungs.length }} échelons
                  </button>
                  @if (ladderOpen(d.id)) {
                    <ol class="ladder" [id]="'lad-' + d.id" [attr.aria-label]="'Échelons du parcours ' + d.label">
                      @for (r of d.rungs; track r.rung) {
                        <li>
                          <span class="n" aria-hidden="true">{{ r.rung }}</span>
                          <span class="rt">{{ r.title }}</span>
                          @if (minScore(r.rung) > 0) {
                            <span class="req">{{ d.ability }} {{ minScore(r.rung) }} requis</span>
                          }
                        </li>
                      }
                    </ol>
                  }
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .top { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; }
    .count { font-size: 14px; color: var(--lu-text-2); margin: 0; }
    .count strong { font-size: 18px; color: var(--lu-accent); font-variant-numeric: tabular-nums; }
    .sub { font: 700 11px var(--lu-font-body); letter-spacing: 0.08em; text-transform: uppercase; color: var(--lu-text-2); margin: 14px 0 8px; }
    .mine { display: flex; flex-direction: column; gap: 8px; }
    .mine .sub { margin-top: 0; }
    .mrow { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 16px; border: 1px solid var(--lu-border-strong); background: var(--lu-surface-2); flex-wrap: wrap; }
    .mrow.paused { border-style: dashed; }
    .mtxt { flex: 1 1 140px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .mtxt strong { font-size: 14px; }
    .macts { display: flex; gap: 8px; flex-wrap: wrap; }
    .act { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; min-width: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--lu-border-strong); background: transparent; color: var(--lu-text); font: 600 12px var(--lu-font-body); cursor: pointer; }
    .act.danger { color: var(--lu-danger); border-color: color-mix(in srgb, var(--lu-danger) 40%, transparent); }
    .act:disabled { opacity: 0.45; cursor: not-allowed; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .disc { border: 1px solid var(--lu-border); border-radius: 16px; overflow: hidden; background: var(--lu-surface-grad); }
    .disc.on { border-color: var(--lu-accent); }
    .head { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 10px 14px; background: none; border: 0; text-align: left; color: inherit; font: inherit; cursor: pointer; }
    .txt { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .txt strong { font-size: 15px; }
    .full-note { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 8px 14px 4px; color: var(--lu-text-2); line-height: 1.4; }
    .full-note lu-icon { margin-top: 2px; flex: none; }
    .trow:focus-visible { outline: 2px solid var(--lu-accent); outline-offset: 2px; border-radius: 8px; }
    .trks { list-style: none; margin: 0; padding: 0 14px 8px; display: flex; flex-direction: column; }
    .trk { padding: 10px 0; border-top: 1px solid var(--lu-border); display: flex; flex-direction: column; gap: 6px; }
    .trow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .ttxt { flex: 1 1 160px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .ttxt strong { font-size: 14px; }
    .tact { display: flex; align-items: center; gap: 8px; }
    .tact .lu-btn.small { min-height: 44px; }
    .lad { align-self: flex-start; display: inline-flex; align-items: center; gap: 4px; min-height: 44px; padding: 0 4px; background: none; border: 0; color: var(--lu-accent); font: 600 12px var(--lu-font-body); cursor: pointer; }
    .ladder { margin: 0 0 4px; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
    .ladder li { display: flex; align-items: baseline; gap: 10px; font-size: 13px; line-height: 1.4; color: var(--lu-text-2); }
    .n { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font: 700 11px var(--lu-font-body); background: var(--lu-surface-2); border: 1px solid var(--lu-border); color: var(--lu-text); }
    .rt { flex: 1; min-width: 0; }
    .req { font-size: 11px; color: var(--lu-gold); white-space: nowrap; }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  `,
})
export class TracksPickerComponent {
  private game = inject(GameService);
  private ui = inject(UiService);
  private host = inject(ElementRef);

  readonly mode = input<'live' | 'draft'>('live');
  /** Mode « draft » : identifiants des parcours choisis (3 au maximum) */
  readonly selection = model<string[]>([]);

  readonly themes = THEMES_WITH_TRACKS;
  readonly max = MAX_ACTIVE_TRACKS;
  readonly promote = TRACK_PROMOTE_HITS;
  readonly busy = signal(false);
  private readonly opened = signal<Set<string>>(new Set());
  private readonly ladders = signal<Set<string>>(new Set());

  readonly activeCount = computed(() => (this.mode() === 'live' ? this.game.activeTracks().length : this.selection().length));
  readonly full = computed(() => this.activeCount() >= this.max);

  readonly mine = computed<MineRow[]>(() => {
    if (this.mode() === 'draft') {
      return this.selection()
        .map((id) => trackDef(id))
        .filter((d): d is TrackDef => !!d)
        .map((def) => ({ def, status: 'active' as const, state: null, sub: 'Tu commenceras à l’échelon 1' }));
    }
    const rows: MineRow[] = [];
    for (const s of [...this.game.activeTracks(), ...this.game.pausedTracks()]) {
      const def = trackDef(s.trackId);
      if (!def) continue;
      rows.push({ def, status: s.status, state: s, sub: `Échelon ${s.rung}/${def.rungs.length}${s.status === 'paused' ? ' · en pause' : ''}` });
    }
    return rows;
  });

  themeName = themeLabel;
  tracksOf = tracksOfTheme;
  minScore = trackRungMinScore;

  /** Statut d'un parcours : actif / en pause / pas commencé (null). */
  statusOf(id: string): 'active' | 'paused' | null {
    if (this.mode() === 'draft') return this.selection().includes(id) ? 'active' : null;
    return this.game.trackState(id)?.status ?? null;
  }

  chosenIn(themeId: string): number {
    return tracksOfTheme(themeId).filter((d) => this.statusOf(d.id) === 'active').length;
  }

  isOpen = (id: string) => this.opened().has(id);
  ladderOpen = (id: string) => this.ladders().has(id);

  private flip(sig: WritableSignal<Set<string>>, id: string): void {
    sig.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  toggle(id: string): void {
    this.flip(this.opened, id);
  }
  toggleLadder(id: string): void {
    this.flip(this.ladders, id);
  }

  toggleDraft(id: string): void {
    const cur = this.selection();
    if (cur.includes(id)) this.selection.set(cur.filter((x) => x !== id));
    else if (cur.length < this.max) this.selection.set([...cur, id]);
  }

  async add(def: TrackDef): Promise<void> {
    if (this.full()) return;
    if (this.mode() === 'draft') return this.toggleDraft(def.id);
    this.busy.set(true);
    try {
      await this.game.startTrack(def.id);
    } finally {
      this.busy.set(false);
    }
    // Le bouton « Commencer » disparaît (il devient la pastille « Actif ») : le focus revient à la ligne du parcours.
    this.focusRow(def.id);
  }

  private focusRow(id: string): void {
    setTimeout(() => (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('#trk-' + CSS.escape(id))?.focus({ preventScroll: true }), 50);
  }

  async pause(r: MineRow): Promise<void> {
    this.busy.set(true);
    try {
      await this.game.pauseTrack(r.def.id, r.status === 'active');
    } finally {
      this.busy.set(false);
    }
  }

  async stop(r: MineRow): Promise<void> {
    this.busy.set(true);
    try {
      await this.ui.stopTrack(r.def.id);
    } finally {
      this.busy.set(false);
    }
  }
}
