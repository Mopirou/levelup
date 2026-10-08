import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import {
  ABILITIES,
  ABILITY_LABEL,
  ABILITY_TAGLINE,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  PERIOD_SHORT,
  VALIDATION_LABEL,
  expertUnlocked,
  questLock,
  questXp,
  type AbilityId,
  type Difficulty,
  type Period,
  type QuestInstance,
  type QuestTemplate,
} from '@levelup/engine';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { UiService } from '../../core/ui.service';
import { PageHeaderComponent, AbilityBadgeComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';

const TAGS = ['sans matériel', 'extérieur', 'social', 'moins de 10 min', 'sport', 'cuisine', 'langue', 'détox'];
const CHAPTER_TEXT: Record<AbilityId, string> = {
  FOR: 'Le Courage ne se mesure pas qu’en kilos : il se mesure à ce que tu oses, un petit pas hors de ta zone de confort à la fois.',
  DEX: 'La Créativité, c’est la précision et la souplesse : le geste juste, au bon moment, qu’il tienne un crayon ou une idée.',
  CON: 'La Vitalité, c’est l’endurance : tenir la distance, récupérer, rester debout quand les autres flanchent.',
  INT: 'Le Savoir, c’est le raisonnement et la mémoire : comprendre, retenir, relier les idées.',
  SAG: 'L’Équilibre ne se mesure ni en kilos ni en pages lues. Il se mesure à la qualité de ton attention.',
  CHA: 'Les Liens, c’est la force de la personnalité : oser parler, créer du lien, laisser une trace chez les autres.',
};

type StatusFilter = 'all' | 'never' | 'favorite' | 'excluded';

@Component({
  selector: 'app-grimoire',
  imports: [IonContent, PageHeaderComponent, AbilityBadgeComponent, IconComponent, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <lu-page-header [back]="true" eyebrow="Le Grimoire" icon="library" title="Toutes les quêtes" />
      <div class="lu-page">
        <div class="search">
          <lu-icon name="search" [size]="17" />
          <input type="search" class="inp" placeholder="Chercher dans le Grimoire…" [value]="query()" (input)="query.set($any($event.target).value)" aria-label="Recherche plein texte" />
        </div>
        <div class="filters">
          <button type="button" class="lu-chip big" [class.mint]="!!period()" (click)="pickPeriod()">{{ period() ? periodName(period()!) : 'Période' }} ⌄</button>
          <button type="button" class="lu-chip big" [class.mint]="!!difficulty()" (click)="pickDifficulty()">{{ difficulty() ? dl(difficulty()!) : 'Difficulté' }} ⌄</button>
          <button type="button" class="lu-chip big" [class.mint]="!!tag()" (click)="pickTag()">{{ tag() ?? 'Tags' }} ⌄</button>
          <button type="button" class="lu-chip big" [class.mint]="source() !== 'all'" (click)="pickSource()">{{ source() === 'all' ? 'Source' : source() === 'catalog' ? 'Catalogue' : 'Perso' }} ⌄</button>
          <button type="button" class="lu-chip big" [class.mint]="status() !== 'all'" (click)="pickStatus()">{{ statusText() }} ⌄</button>
          @if (filtered()) { <button type="button" class="lu-chip big" (click)="clear()">Effacer</button> }
        </div>

        @for (a of abilities; track a) {
          <section class="chapter" [class.open]="opened().has(a) || filtered()">
            <button type="button" class="chead" (click)="toggle(a)" [attr.aria-expanded]="opened().has(a) || filtered()">
              <lu-ability-badge [ability]="a" [size]="52" />
              <span class="ct"><strong>{{ label(a) }}</strong><span class="xs muted">{{ discovered(a) }} / {{ total(a) }} quêtes découvertes</span></span>
              <lu-icon [name]="opened().has(a) || filtered() ? 'chevron-down' : 'chevron-right'" [size]="18" />
            </button>
            @if (opened().has(a) || filtered()) {
              <div class="cbody fade-in">
                <p class="illum">{{ chapterText(a) }}</p>
                @for (d of difficulties; track d) {
                  @if (rows(a, d).length) {
                    <h4 class="dh">{{ dl(d) }}</h4>
                    @for (t of rows(a, d); track t.id) {
                      <div class="qrow" [class.excl]="pref(t.id)?.isExcluded" role="button" tabindex="0" (click)="detail.set(t)" (keydown.enter)="detail.set(t)">
                        <div class="qm">
                          <strong>@if (lock(t).locked) { <lu-icon name="lock" [size]="13" /> } {{ t.title }}</strong>
                          <span class="xs muted">
                            @for (p of t.periods; track p) { <i class="pp">{{ ps(p) }}</i> }
                            {{ vlabel(t) }} · {{ doneCount(t) ? doneCount(t) + ' fois' : 'jamais faite' }}{{ lastDone(t) ? ' · ' + lastDone(t) : '' }}
                          </span>
                          @if (lock(t).locked) { <span class="xs gold">{{ lock(t).reason }}</span> }
                        </div>
                        <div class="qa" (click)="$event.stopPropagation()">
                          <button type="button" class="ib" [class.on]="pref(t.id)?.isFavorite" (click)="fav(t)" [attr.aria-label]="pref(t.id)?.isFavorite ? 'Retirer des favorites' : 'Marquer favorite'" [attr.aria-pressed]="!!pref(t.id)?.isFavorite"><lu-icon name="star" [size]="16" /></button>
                          <button type="button" class="ib" [class.on]="pref(t.id)?.isExcluded" (click)="exclude(t)" [attr.aria-label]="pref(t.id)?.isExcluded ? 'Ne plus exclure' : 'Exclure du tirage'" [attr.aria-pressed]="!!pref(t.id)?.isExcluded"><lu-icon name="ban" [size]="16" /></button>
                        </div>
                      </div>
                    }
                  }
                }
              </div>
            }
          </section>
        }
        @if (game.unlocks().forge) {
          <button type="button" class="fab lu-btn mint" (click)="ui.go('/forge')"><lu-icon name="hammer" [size]="18" /> Forger une quête</button>
        }
      </div>

      @if (detail(); as t) {
        <lu-modal [label]="t.title" (close)="detail.set(null)">
          <div class="dhd"><lu-ability-badge [ability]="t.ability" [size]="44" /><div><h2>{{ t.title }}</h2><p class="xs muted">{{ label(t.ability) }} · {{ dl(t.difficulty) }} · {{ vlabel(t) }}</p></div></div>
          <p class="flav">{{ t.flavor }}</p>
          <div class="goal"><span class="lu-eyebrow">OBJECTIF</span><p>{{ t.objective }}</p></div>
          @if (t.tips.length) { <ul class="tips">@for (x of t.tips; track x) { <li>{{ x }}</li> }</ul> }
          <div class="lu-label">XP selon la période</div>
          <div class="xps">@for (p of t.periods; track p) { <span class="lu-chip gold">{{ periodName(p) }} · {{ xp(t, p) }} XP</span> }</div>
          @if (lock(t).locked) { <p class="small gold"><lu-icon name="lock" [size]="13" /> {{ lock(t).reason }}</p> }
          <div class="row2">
            <button type="button" class="lu-btn ghost small" (click)="fav(t)"><lu-icon name="star" [size]="15" /> {{ pref(t.id)?.isFavorite ? 'Favorite' : 'Favori' }}</button>
            <button type="button" class="lu-btn ghost small" (click)="exclude(t)"><lu-icon name="ban" [size]="15" /> {{ pref(t.id)?.isExcluded ? 'Exclue' : 'Exclure' }}</button>
          </div>
          @if (game.unlocks().forge) { <button type="button" class="lu-btn" (click)="duplicate(t)"><lu-icon name="hammer" [size]="16" /> Dupliquer dans la Forge</button> }
        </lu-modal>
      }
    </ion-content>
  `,
  styles: `
    .search { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px; border-radius: 16px; background: var(--lu-surface-2); border: 1px solid var(--lu-border); color: var(--lu-muted); }
    .inp { flex: 1; background: none; border: 0; outline: 0; color: var(--lu-text); font: 400 14px var(--lu-font-body); min-width: 0; }
    .filters { display: flex; gap: 8px; overflow-x: auto; margin: -8px calc(-1 * var(--lu-gutter)) 0; padding: 0 var(--lu-gutter) 2px; scrollbar-width: none; } .filters .lu-chip { cursor: pointer; flex: none; height: 28px; }
    .chapter { border-radius: 20px; background: var(--lu-surface-grad); border: 1px solid var(--lu-border); overflow: hidden; }
    .chead { width: 100%; display: flex; align-items: center; gap: 14px; padding: 16px; background: none; border: 0; color: inherit; text-align: left; cursor: pointer; }
    .ct { flex: 1; display: flex; flex-direction: column; gap: 3px; } .ct strong { font-family: var(--lu-font-title); font-size: 22px; font-weight: 500; }
    .cbody { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 6px; }
    .illum { font-family: var(--lu-font-title); font-style: italic; font-size: 14px; line-height: 1.6; color: var(--lu-text-2); padding: 12px 14px; border-left: 3px solid var(--lu-gold); background: var(--lu-surface-2); border-radius: 0 12px 12px 0; margin-bottom: 6px; }
    .dh { font: 700 11px var(--lu-font-body); letter-spacing: .1em; text-transform: uppercase; color: var(--lu-muted); margin: 10px 0 2px; }
    .qrow { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--lu-border); cursor: pointer; }
    .qrow.excl .qm { opacity: .45; text-decoration: line-through; }
    .qm { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; } .qm strong { font-size: 14px; font-weight: 600; display: flex; gap: 6px; align-items: center; }
    .pp { font-style: normal; font-weight: 700; font-size: 9px; padding: 1px 5px; margin-right: 3px; border-radius: 4px; background: var(--lu-surface-2); color: var(--lu-text-2); }
    .qa { display: flex; gap: 4px; } .ib { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--lu-border); background: transparent; color: var(--lu-muted); display: grid; place-items: center; cursor: pointer; }
    .ib.on { color: var(--lu-gold); border-color: var(--lu-gold); background: var(--lu-gold-bg); }
    .fab { position: sticky; bottom: 12px; align-self: center; width: auto; padding: 0 20px; box-shadow: var(--lu-shadow); }
    .dhd { display: flex; gap: 12px; align-items: center; padding-right: 40px; } .dhd h2 { font-size: 24px; }
    .flav { font-family: var(--lu-font-title); font-style: italic; line-height: 1.6; font-size: 15px; }
    .goal { padding: 12px 14px; border-radius: 12px; background: var(--lu-surface-2); display: flex; flex-direction: column; gap: 4px; } .goal p { font-size: 13px; font-weight: 500; }
    .tips { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; color: var(--lu-text-2); }
    .xps { display: flex; flex-wrap: wrap; gap: 8px; } .row2 { display: flex; gap: 10px; } .row2 .lu-btn { flex: 1; }
  `,
})
export class GrimoirePage {
  protected game = inject(GameService);
  protected ui = inject(UiService);
  private be = inject(BackendService);
  readonly abilityParam = input<string | undefined>(undefined, { alias: 'ability' });
  readonly abilities = ABILITIES;
  readonly difficulties = DIFFICULTIES;
  readonly query = signal('');
  readonly period = signal<Period | null>(null);
  readonly difficulty = signal<Difficulty | null>(null);
  readonly tag = signal<string | null>(null);
  readonly source = signal<'all' | 'catalog' | 'custom'>('all');
  readonly status = signal<StatusFilter>('all');
  readonly opened = signal<Set<AbilityId>>(new Set());
  readonly detail = signal<QuestTemplate | null>(null);
  readonly history = signal<QuestInstance[]>([]);

  label = (a: AbilityId) => ABILITY_LABEL[a];
  chapterText = (a: AbilityId) => CHAPTER_TEXT[a] ?? ABILITY_TAGLINE[a];
  dl = (d: Difficulty) => DIFFICULTY_LABEL[d];
  ps = (p: Period) => PERIOD_SHORT[p];
  vlabel = (t: QuestTemplate) => VALIDATION_LABEL[t.validation.type];
  periodName = (p: Period) => ({ daily: 'Jour', weekly: 'Semaine', monthly: 'Mois', epic: 'Épique' })[p];
  pref = (id: string): { isFavorite?: boolean; isExcluded?: boolean; isPinned?: boolean } | undefined => this.game.prefs()[id];
  statusText = computed(() => ({ all: 'Statut', never: 'Jamais faite', favorite: 'Favorites', excluded: 'Exclues' })[this.status()]);
  readonly filtered = computed(() => !!(this.query() || this.period() || this.difficulty() || this.tag() || this.source() !== 'all' || this.status() !== 'all'));

  private counts = computed(() => {
    const m = new Map<string, { n: number; last: string }>();
    for (const i of this.history()) {
      if (i.status !== 'completed' || !i.completedAt) continue;
      const c = m.get(i.templateId) ?? { n: 0, last: '' };
      c.n++;
      if (i.completedAt > c.last) c.last = i.completedAt;
      m.set(i.templateId, c);
    }
    return m;
  });
  doneCount = (t: QuestTemplate) => this.counts().get(t.id)?.n ?? 0;
  lastDone = (t: QuestTemplate) => {
    const l = this.counts().get(t.id)?.last;
    return l ? new Date(l).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
  };
  discovered = (a: AbilityId) => this.game.templates().filter((t) => t.ability === a && this.counts().has(t.id)).length;
  total = (a: AbilityId) => this.game.templates().filter((t) => t.ability === a).length;
  lock = (t: QuestTemplate) => questLock(t.difficulty, this.game.scores()[t.ability], this.game.level(), ABILITY_LABEL[t.ability]);

  private matches = (t: QuestTemplate): boolean => {
    const q = this.query().trim().toLowerCase();
    if (q && !`${t.title} ${t.flavor} ${t.objective} ${t.tags.join(' ')}`.toLowerCase().includes(q)) return false;
    if (this.period() && !t.periods.includes(this.period()!)) return false;
    if (this.difficulty() && t.difficulty !== this.difficulty()) return false;
    if (this.tag() && !t.tags.includes(this.tag()!)) return false;
    if (this.source() !== 'all' && t.source !== this.source()) return false;
    const p = this.pref(t.id);
    switch (this.status()) {
      case 'never': return !this.counts().has(t.id);
      case 'favorite': return !!p?.isFavorite;
      case 'excluded': return !!p?.isExcluded;
      default: return true;
    }
  };
  rows = (a: AbilityId, d: Difficulty) => this.game.templates().filter((t) => t.ability === a && t.difficulty === d && this.matches(t));

  constructor() {
    queueMicrotask(() => {
      const a = this.abilityParam();
      if (a && (ABILITIES as readonly string[]).includes(a)) this.opened.set(new Set([a as AbilityId]));
    });
    void this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    try {
      this.history.set(await this.be.game.store.listInstances(this.be.game.userId(), { status: 'completed' }));
    } catch {
      /* hors ligne */
    }
  }

  toggle(a: AbilityId): void {
    this.opened.update((s) => {
      const n = new Set(s);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });
  }
  clear(): void {
    this.query.set('');
    this.period.set(null);
    this.difficulty.set(null);
    this.tag.set(null);
    this.source.set('all');
    this.status.set('all');
  }

  async pickPeriod(): Promise<void> {
    const v = await this.ui.choose('Période', [...(['daily', 'weekly', 'monthly', 'epic'] as Period[]).map((p) => ({ text: this.periodName(p), value: p as string })), { text: 'Toutes', value: '' }]);
    if (v !== null) this.period.set((v || null) as Period | null);
  }
  async pickDifficulty(): Promise<void> {
    const v = await this.ui.choose('Difficulté', [...DIFFICULTIES.map((d) => ({ text: DIFFICULTY_LABEL[d], value: d as string })), { text: 'Toutes', value: '' }]);
    if (v !== null) this.difficulty.set((v || null) as Difficulty | null);
  }
  async pickTag(): Promise<void> {
    const v = await this.ui.choose('Tags', [...TAGS.map((t) => ({ text: t, value: t })), { text: 'Tous', value: '' }]);
    if (v !== null) this.tag.set(v || null);
  }
  async pickSource(): Promise<void> {
    const v = await this.ui.choose('Source', [{ text: 'Catalogue', value: 'catalog' }, { text: 'Mes quêtes', value: 'custom' }, { text: 'Toutes', value: 'all' }]);
    if (v !== null) this.source.set(v as 'all' | 'catalog' | 'custom');
  }
  async pickStatus(): Promise<void> {
    const v = await this.ui.choose('Statut', [{ text: 'Jamais faite', value: 'never' }, { text: 'Favorites', value: 'favorite' }, { text: 'Exclues', value: 'excluded' }, { text: 'Toutes', value: 'all' }]);
    if (v !== null) this.status.set(v as StatusFilter);
  }

  async fav(t: QuestTemplate): Promise<void> {
    const p = this.pref(t.id);
    await this.game.setPreference({ templateId: t.id, isFavorite: !p?.isFavorite, isExcluded: false, isPinned: p?.isPinned });
  }
  async exclude(t: QuestTemplate): Promise<void> {
    const p = this.pref(t.id);
    await this.game.setPreference({ templateId: t.id, isExcluded: !p?.isExcluded, isFavorite: false, isPinned: p?.isPinned });
  }
  xp(t: QuestTemplate, p: Period): number {
    return questXp({ difficulty: t.difficulty, period: p, ability: t.ability, level: this.game.level(), masteries: this.game.masteries(), pathAbility: this.game.pathAbility() }).total;
  }
  duplicate(t: QuestTemplate): void {
    this.detail.set(null);
    this.ui.go('/forge', { queryParams: { from: t.id } });
  }
}
void expertUnlocked;
