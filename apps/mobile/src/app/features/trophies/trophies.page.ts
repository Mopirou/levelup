import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { ACHIEVEMENTS, type AchievementDef, type AchievementProgress } from '@levelup/engine';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { UiService } from '../../core/ui.service';
import { PageHeaderComponent, BarComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';

const CATEGORIES: { id: AchievementDef['category']; label: string; icon: string }[] = [
  { id: 'constance', label: 'Constance', icon: 'flame' },
  { id: 'maitrise', label: 'Maîtrise', icon: 'crown' },
  { id: 'exploration', label: 'Exploration', icon: 'compass' },
  { id: 'exploits', label: 'Objectifs', icon: 'target' },
  { id: 'equilibre', label: 'Équilibre', icon: 'scale' },
  { id: 'secrets', label: 'Secrets', icon: 'gem' },
];

/** Succès. */
@Component({
  selector: 'app-trophies',
  imports: [IonContent, PageHeaderComponent, BarComponent, IconComponent, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <lu-page-header [back]="true" eyebrow="Succès" icon="trophy" title="Tes succès" />
      <div class="lu-page">
        <section class="lu-card gold head">
          <div><span class="lu-eyebrow">COLLECTION</span><strong class="big">{{ unlockedCount() }} / {{ all.length }}</strong><span class="xs">succès obtenus</span></div>
          <button type="button" class="lu-chip gold big" (click)="pickTitle()">{{ game.displayTitle() }} ⌄</button>
        </section>
        <div class="lu-pills cats">
          <button type="button" [class.on]="!cat()" (click)="cat.set(null)">Tous</button>
          @for (c of cats; track c.id) { <button type="button" [class.on]="cat() === c.id" (click)="cat.set(c.id)">{{ c.label }}</button> }
        </div>
        @for (c of shownCats(); track c.id) {
          <section class="lu-section">
            <div class="lu-section-title"><h2><lu-icon [name]="c.icon" [size]="18" /> {{ c.label }}</h2><span class="lu-link" style="color: var(--lu-text-2)">{{ countIn(c.id) }}</span></div>
            <div class="grid">
              @for (a of list(c.id); track a.id) {
                <button type="button" class="lu-card flat t" [class.done]="done(a)" [class.locked]="!done(a)" (click)="detail.set(a)">
                  <span class="ic" [class.gold]="done(a)"><lu-icon [name]="done(a) ? 'award' : a.isSecret ? 'lock' : 'trophy'" [size]="22" /></span>
                  <strong>{{ done(a) || !a.isSecret ? a.name : '???' }}</strong>
                  @if (!done(a)) {
                    @if (a.isSecret) { <span class="xs muted">{{ a.hint }}</span> }
                    @else { <lu-bar [value]="prog(a).current" [max]="prog(a).target" /><span class="xs muted">{{ prog(a).current }} / {{ prog(a).target }}</span> }
                  } @else { <span class="xs gold">{{ when(a) }}</span> }
                </button>
              }
            </div>
          </section>
        }
      </div>
      @if (detail(); as a) {
        <lu-modal [label]="a.name" (close)="detail.set(null)">
          <div class="dd"><span class="ic big" [class.gold]="done(a)"><lu-icon [name]="done(a) ? 'award' : 'trophy'" [size]="34" /></span>
            <h2>{{ done(a) || !a.isSecret ? a.name : '???' }}</h2>
            <p class="lead">{{ done(a) || !a.isSecret ? a.description : a.hint }}</p>
            @if (done(a)) { <span class="lu-chip mint">Obtenu {{ when(a) }}</span> } @else if (!a.isSecret) { <lu-bar [value]="prog(a).current" [max]="prog(a).target" /><p class="small muted">{{ prog(a).current }} / {{ prog(a).target }}</p> }
            @if (a.xpBonus) { <span class="lu-chip gold">+{{ a.xpBonus }} XP{{ done(a) ? '' : ' à l’obtention' }}</span> }
            @if (a.titleUnlocked) { <span class="lu-chip">Titre : {{ a.titleUnlocked }}</span> }
          </div>
        </lu-modal>
      }
    </ion-content>
  `,
  styles: `
    .head { flex-direction: row; justify-content: space-between; align-items: center; } .head div { display: flex; flex-direction: column; gap: 2px; }
    .big { font-family: var(--lu-font-title); font-size: 34px; font-weight: 500; line-height: 1.1; }
    .cats { overflow-x: auto; flex-wrap: nowrap; margin: 0 calc(-1 * var(--lu-gutter)); padding: 0 var(--lu-gutter); scrollbar-width: none; } .cats button { flex: none; }
    .lu-section-title h2 { display: inline-flex; align-items: center; gap: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .t { padding: 14px 12px; gap: 8px; align-items: center; text-align: center; cursor: pointer; color: inherit; font: inherit; }
    .t strong { font-size: 13px; line-height: 1.25; } .t.locked { opacity: .78; } .t.done { border-color: color-mix(in srgb, var(--lu-gold) 40%, transparent); }
    .ic { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: var(--lu-surface-2); color: var(--lu-dim); }
    .ic.gold { background: var(--lu-gold-bg); color: var(--lu-gold); } .ic.big { width: 72px; height: 72px; }
    .t lu-bar { width: 100%; } .dd { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding-top: 8px; } .dd h2 { font-size: 26px; }
    .lead { font-size: 14px; line-height: 1.55; color: var(--lu-text-2); }
  `,
})
export class TrophiesPage {
  protected game = inject(GameService);
  private ui = inject(UiService);
  private be = inject(BackendService);
  readonly all = ACHIEVEMENTS;
  readonly cats = CATEGORIES;
  readonly cat = signal<AchievementDef['category'] | null>(null);
  readonly detail = signal<AchievementDef | null>(null);
  readonly progress = signal<Map<string, AchievementProgress>>(new Map());
  readonly shownCats = computed(() => (this.cat() ? CATEGORIES.filter((c) => c.id === this.cat()) : CATEGORIES));
  readonly unlockedIds = computed(() => new Map(this.game.unlocked().map((u) => [u.achievementId, u.unlockedAt])));
  readonly unlockedCount = computed(() => this.unlockedIds().size);

  constructor() {
    void this.be.game.achievementProgress().then((p) => this.progress.set(new Map(p.map((x) => [x.id, x])))).catch(() => undefined);
  }

  list = (c: AchievementDef['category']) => ACHIEVEMENTS.filter((a) => a.category === c);
  countIn = (c: AchievementDef['category']) => `${this.list(c).filter((a) => this.unlockedIds().has(a.id)).length} / ${this.list(c).length}`;
  done = (a: AchievementDef) => this.unlockedIds().has(a.id);
  prog = (a: AchievementDef) => this.progress().get(a.id) ?? { id: a.id, current: 0, target: 1, done: false };
  when = (a: AchievementDef) => {
    const d = this.unlockedIds().get(a.id);
    return d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  };

  async pickTitle(): Promise<void> {
    const titles = this.game.titles();
    if (!titles.length) return this.game.toast('Débloque des succès pour gagner des titres honorifiques.', 'info');
    const choice = await this.ui.choose('Titre affiché', [{ text: 'Titre de palier : ' + this.game.tier().name, value: '__tier__' }, ...titles.map((t) => ({ text: t, value: t }))]);
    if (choice !== null) await this.game.equipTitle(choice === '__tier__' ? null : choice);
  }
}
