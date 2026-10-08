import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import {
  ABILITIES,
  ABILITY_LABEL,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  PERIOD_SHORT,
  VALIDATION_LABEL,
  questXp,
  type AbilityId,
  type Difficulty,
  type Period,
  type QuestInstance,
  type QuestTemplate,
  type ValidationSpec,
  type ValidationType,
} from '@levelup/engine';
import { GameService } from '../../core/game.service';
import { UiService } from '../../core/ui.service';
import { PageHeaderComponent, AbilityBadgeComponent, EmptyComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { QuestCardComponent } from '../../shared/quest-card.component';

const EFFORT: Record<Difficulty, string> = {
  easy: 'Moins de 10 minutes, aucune préparation',
  medium: '15 à 45 minutes, un petit effort de volonté',
  high: '1 à 2 heures, ou un inconfort réel',
  expert: 'Plusieurs heures ou étapes, sortie nette de la zone de confort',
};
const EPIC_PREFIX = ['L’Épreuve de', 'Le Serment du', 'La Traversée de', 'Le Défi du', 'La Quête de', 'Le Chemin de'];
const FLAVOR_MODELS = [
  'Les anciens racontent que {x}. Aujourd’hui, c’est ton tour d’essayer.',
  'Il y a, dans chaque royaume, une épreuve qui ne se refuse pas. La tienne : {x}.',
  'Le voyageur qui accomplit « {x} » ne revient jamais tout à fait le même.',
  'Personne ne t’y oblige. Mais tu sais déjà que « {x} » te ferait du bien.',
];
const TAG_SUGGESTIONS = ['sans matériel', 'extérieur', 'social', 'moins de 10 min', 'sport', 'cuisine'];

@Component({
  selector: 'app-forge',
  imports: [IonContent, PageHeaderComponent, AbilityBadgeComponent, EmptyComponent, IconComponent, QuestCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <lu-page-header [back]="true" eyebrow="La Forge" icon="hammer" [title]="editing() ? 'Modifier ma quête' : 'Forger une quête'" />
      @if (!game.unlocks().forge) {
        <div class="lu-page"><lu-empty icon="lock" title="La Forge s’ouvre au niveau 2" text="Accomplis tes premières quêtes pour inventer les tiennes." /></div>
      } @else {
        <div class="lu-page">
          <section class="lu-section">
            <span class="lu-eyebrow">APERÇU EN DIRECT</span>
            <lu-quest-card [inst]="previewInst()" />
            <p class="xs muted">{{ xpPreview() }}</p>
          </section>

          <section class="lu-card form">
            <div class="lu-field">
              <label for="ti">Titre</label>
              <div class="row"><input id="ti" class="lu-input" maxlength="60" [value]="title()" (input)="title.set($any($event.target).value)" placeholder="Le Souffle du Matin" /><button type="button" class="lu-btn small ghost inline" (click)="epicTitle()">Titre épique</button></div>
              <span class="hint">{{ title().trim().length }}/60 · 3 caractères minimum</span>
            </div>

            <div class="lu-field">
              <span class="lu-label">Caractéristique</span>
              <div class="abil">@for (a of abilities; track a) { <button type="button" [class.on]="ability() === a" (click)="ability.set(a)" [attr.aria-pressed]="ability() === a"><lu-ability-badge [ability]="a" [size]="34" /><span class="xs">{{ label(a) }}</span></button> }</div>
            </div>

            <div class="lu-field">
              <span class="lu-label">Difficulté</span>
              <div class="diffs">@for (d of difficulties; track d) { <button type="button" [class.on]="difficulty() === d" (click)="difficulty.set(d)" [attr.aria-pressed]="difficulty() === d"><strong>{{ dl(d) }}</strong><span class="xs muted">{{ effort[d] }}</span></button> }</div>
            </div>

            <div class="lu-field">
              <span class="lu-label">Périodes</span>
              <div class="lu-pills">@for (p of periodOptions; track p) { <button type="button" [class.on]="periods().includes(p)" (click)="togglePeriod(p)" [attr.aria-pressed]="periods().includes(p)">{{ pname(p) }}</button> }</div>
            </div>

            <div class="lu-field">
              <label for="vt">Type de validation</label>
              <select id="vt" class="lu-input" [value]="vtype()" (change)="vtype.set($any($event.target).value)">
                @for (v of vtypes; track v) { <option [value]="v">{{ vlabel(v) }}</option> }
              </select>
              @switch (vtype()) {
                @case ('counter') {
                  <div class="row"><input class="lu-input" type="number" min="2" max="9999" [value]="target()" (input)="target.set(+$any($event.target).value)" aria-label="Cible" /><input class="lu-input" [value]="unit()" (input)="unit.set($any($event.target).value)" placeholder="unité (pages, séances…)" aria-label="Unité" /></div>
                }
                @case ('timer') { <input class="lu-input" type="number" min="1" max="600" [value]="minutes()" (input)="minutes.set(+$any($event.target).value)" aria-label="Minutes" /> <span class="hint">Durée en minutes</span> }
                @case ('steps') {
                  <textarea class="lu-input area" rows="4" [value]="stepsText()" (input)="stepsText.set($any($event.target).value)" placeholder="Une étape par ligne"></textarea>
                  <span class="hint">2 étapes minimum, une par ligne.</span>
                }
                @case ('journal') { <span class="hint">Un texte d’au moins 50 caractères sera demandé à la validation.</span> }
              }
            </div>

            <div class="lu-field">
              <label for="ob">Objectif concret</label>
              <textarea id="ob" class="lu-input area" rows="2" maxlength="200" [value]="objective()" (input)="objective.set($any($event.target).value)" placeholder="Marcher 20 minutes sans écran."></textarea>
              <span class="hint">{{ objective().trim().length }}/200 · 10 caractères minimum. Un verbe, un chiffre, une condition de réussite.</span>
            </div>

            <div class="lu-field">
              <label for="fl">Texte d’ambiance</label>
              <textarea id="fl" class="lu-input area" rows="3" maxlength="500" [value]="flavor()" (input)="flavor.set($any($event.target).value)" placeholder="Une image, puis le lien avec l’action réelle."></textarea>
              <button type="button" class="lu-btn small ghost inline" style="align-self: flex-start" (click)="inspire()"><lu-icon name="sparkles" [size]="14" /> Inspirer</button>
            </div>

            <div class="lu-field">
              <span class="lu-label">Conseils · 0 à 4</span>
              @for (t of tips(); track $index; let i = $index) {
                <div class="row"><input class="lu-input" [value]="t" (input)="setTip(i, $any($event.target).value)" aria-label="Conseil" maxlength="140" /><button type="button" class="lu-icon-btn" (click)="removeTip(i)" aria-label="Retirer"><lu-icon name="x" [size]="14" /></button></div>
              }
              @if (tips().length < 4) { <button type="button" class="lu-btn small ghost inline" style="align-self: flex-start" (click)="tips.set([...tips(), ''])"><lu-icon name="plus" [size]="14" /> Ajouter un conseil</button> }
            </div>

            <div class="lu-field">
              <span class="lu-label">Tags</span>
              <div class="lu-pills">@for (t of tagOptions; track t) { <button type="button" [class.on]="tags().includes(t)" (click)="toggleTag(t)">{{ t }}</button> }</div>
            </div>

            <div class="swrow">
              <div><strong>Épinglée</strong><span class="xs muted">Revient à chaque période, sans tirage.</span></div>
              <button type="button" class="lu-switch" role="switch" [attr.aria-checked]="pinned()" (click)="pinned.set(!pinned())" aria-label="Épinglée"></button>
            </div>

            @if (difficulty() === 'expert') {
              <div class="lu-field warn">
                <label for="ju">Justifie cette difficulté</label>
                <textarea id="ju" class="lu-input area" rows="2" [value]="justification()" (input)="justification.set($any($event.target).value)" placeholder="Pourquoi cette quête est-elle vraiment légendaire ?"></textarea>
                <span class="hint">Pour éviter l’inflation d’XP, une quête Légendaire demande une confirmation et une justification (20 caractères min.).</span>
              </div>
            }
            @if (errors().length) { <ul class="errs" role="alert">@for (e of errors(); track e) { <li>{{ e }}</li> }</ul> }
            <button type="button" class="lu-btn mint" [disabled]="busy()" (click)="save()"><lu-icon name="hammer" [size]="17" /> {{ editing() ? 'Enregistrer' : 'Forger' }}</button>
            @if (editing()) { <button type="button" class="lu-btn danger" (click)="disable()">Désactiver cette quête</button> }
            <button type="button" class="lu-btn text" (click)="cancel()">Annuler</button>
          </section>
        </div>
      }
    </ion-content>
  `,
  styles: `
    .form { gap: 18px; } .row { display: flex; gap: 8px; align-items: center; } .row .lu-input { min-width: 0; }
    .abil { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
    .abil button { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 2px; border-radius: 12px; border: 1px solid var(--lu-border); background: var(--lu-surface-2); color: var(--lu-text-2); cursor: pointer; }
    .abil button.on { border-color: var(--lu-accent); background: color-mix(in srgb, var(--lu-accent) 14%, var(--lu-surface-2)); color: var(--lu-text); }
    .diffs { display: grid; gap: 8px; } .diffs button { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--lu-border); background: var(--lu-surface-2); color: var(--lu-text); cursor: pointer; }
    .diffs button.on { border-color: var(--lu-accent); background: color-mix(in srgb, var(--lu-accent) 12%, var(--lu-surface-2)); }
    .swrow { display: flex; justify-content: space-between; align-items: center; gap: 12px; } .swrow div { display: flex; flex-direction: column; gap: 2px; }
    .warn { padding: 12px; border-radius: 14px; background: var(--lu-gold-bg); }
    .errs { margin: 0; padding: 10px 12px 10px 28px; border-radius: 12px; background: var(--lu-danger-bg); color: var(--lu-danger); font-size: 12px; line-height: 1.6; }
  `,
})
export class ForgePage {
  /** `/forge/:id` pour modifier, `?from=<id>` pour dupliquer */
  readonly id = input<string | undefined>(undefined);
  readonly from = input<string | undefined>(undefined);
  protected game = inject(GameService);
  private ui = inject(UiService);
  readonly abilities = ABILITIES;
  readonly difficulties = DIFFICULTIES;
  readonly effort = EFFORT;
  readonly periodOptions: Period[] = ['daily', 'weekly', 'monthly'];
  readonly vtypes: ValidationType[] = ['simple', 'counter', 'timer', 'steps', 'journal'];
  readonly tagOptions = TAG_SUGGESTIONS;

  readonly title = signal('');
  readonly ability = signal<AbilityId>('INT');
  readonly difficulty = signal<Difficulty>('easy');
  readonly periods = signal<Period[]>(['daily']);
  readonly vtype = signal<ValidationType>('simple');
  readonly target = signal(10);
  readonly unit = signal('pages');
  readonly minutes = signal(10);
  readonly stepsText = signal('');
  readonly objective = signal('');
  readonly flavor = signal('');
  readonly tips = signal<string[]>([]);
  readonly tags = signal<string[]>([]);
  readonly pinned = signal(false);
  readonly justification = signal('');
  readonly errors = signal<string[]>([]);
  readonly busy = signal(false);
  readonly editing = computed(() => !!this.id());

  label = (a: AbilityId) => ABILITY_LABEL[a];
  dl = (d: Difficulty) => DIFFICULTY_LABEL[d];
  vlabel = (v: ValidationType) => VALIDATION_LABEL[v];
  pname = (p: Period) => ({ daily: 'Jour (J)', weekly: 'Semaine (S)', monthly: 'Mois (M)', epic: 'Épique' })[p] ?? PERIOD_SHORT[p];

  readonly validation = computed<ValidationSpec>(() => {
    switch (this.vtype()) {
      case 'counter': return { type: 'counter', target: Math.max(this.target(), 2), unit: this.unit().trim() || 'fois' };
      case 'timer': return { type: 'timer', minutes: Math.max(this.minutes(), 1) };
      case 'steps': return { type: 'steps', steps: this.stepsText().split('\n').map((s) => s.trim()).filter(Boolean) };
      case 'journal': return { type: 'journal', minChars: 50 };
      default: return { type: 'simple' };
    }
  });

  readonly previewInst = computed<QuestInstance>(() => ({
    id: 'preview',
    templateId: 'preview',
    snapshot: {
      ability: this.ability(), difficulty: this.difficulty(), title: this.title().trim() || 'Le titre de ta quête', flavor: this.flavor(), objective: this.objective(),
      tips: this.tips(), validation: this.validation().type === 'steps' && (this.validation() as { steps: string[] }).steps.length < 2 ? { type: 'steps', steps: ['Étape 1', 'Étape 2'] } : this.validation(), tags: this.tags(),
    },
    period: this.periods()[0] ?? 'daily',
    periodStart: this.game.today(),
    periodEnd: this.game.today(),
    status: 'proposed',
    progress: 0,
    xpAwarded: 0,
    inspirationUsed: false,
  }));

  readonly xpPreview = computed(() =>
    this.periods().map((p) => `${{ daily: 'Jour', weekly: 'Semaine', monthly: 'Mois', epic: 'Épique' }[p]} : ${questXp({ difficulty: this.difficulty(), period: p, ability: this.ability(), level: this.game.level(), masteries: this.game.masteries(), pathAbility: this.game.pathAbility() }).total} XP`).join(' · ') || 'Choisis au moins une période.',
  );

  constructor() {
    queueMicrotask(() => {
      const src = this.id() ?? this.from();
      const t = src ? this.game.templates().find((x) => x.id === src) : undefined;
      if (t) this.load(t, !!this.id());
    });
  }

  private load(t: QuestTemplate, edit: boolean): void {
    this.title.set(edit ? t.title : t.title + ' (variante)');
    this.ability.set(t.ability);
    this.difficulty.set(t.difficulty);
    this.periods.set(t.periods.filter((p) => p !== 'epic'));
    this.vtype.set(t.validation.type);
    if (t.validation.type === 'counter') { this.target.set(t.validation.target); this.unit.set(t.validation.unit); }
    if (t.validation.type === 'timer') this.minutes.set(t.validation.minutes);
    if (t.validation.type === 'steps') this.stepsText.set(t.validation.steps.join('\n'));
    this.objective.set(t.objective);
    this.flavor.set(t.flavor);
    this.tips.set([...t.tips]);
    this.tags.set([...t.tags]);
    this.pinned.set(!!this.game.prefs()[t.id]?.isPinned);
  }

  togglePeriod(p: Period): void {
    this.periods.update((l) => (l.includes(p) ? l.filter((x) => x !== p) : [...l, p]));
  }
  toggleTag(t: string): void {
    this.tags.update((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));
  }
  setTip(i: number, v: string): void {
    this.tips.update((l) => l.map((x, k) => (k === i ? v : x)));
  }
  removeTip(i: number): void {
    this.tips.update((l) => l.filter((_, k) => k !== i));
  }

  epicTitle(): void {
    const base = (this.title().replace(/^(L’|Le |La |Les )?(Épreuve|Serment|Traversée|Défi|Quête|Chemin) (de |du |des |de la |d’)?/i, '').trim() || this.objective().split(' ').slice(0, 3).join(' ') || 'ton royaume').toLowerCase();
    const prefix = EPIC_PREFIX[Math.floor(Math.random() * EPIC_PREFIX.length)];
    this.title.set(`${prefix} ${base}`.replace(/\s+/g, ' ').slice(0, 60));
  }
  inspire(): void {
    const x = this.objective().trim().replace(/\.$/, '') || this.title().trim() || 'cette quête';
    this.flavor.set(FLAVOR_MODELS[Math.floor(Math.random() * FLAVOR_MODELS.length)].replace('{x}', x.charAt(0).toLowerCase() + x.slice(1)));
  }

  private validate(): string[] {
    const e: string[] = [];
    const t = this.title().trim();
    if (t.length < 3 || t.length > 60) e.push('Le titre doit faire entre 3 et 60 caractères.');
    const o = this.objective().trim();
    if (o.length < 10 || o.length > 200) e.push('L’objectif doit faire entre 10 et 200 caractères.');
    if (!this.periods().length) e.push('Choisis au moins une période.');
    if (this.vtype() === 'steps' && (this.validation() as { steps: string[] }).steps.length < 2) e.push('Une check-list demande au moins 2 étapes.');
    if (this.vtype() === 'counter' && this.target() < 2) e.push('Un compteur demande une cible d’au moins 2.');
    if (this.difficulty() === 'expert' && this.justification().trim().length < 20 && !this.editing()) e.push('Justifie la difficulté Légendaire (20 caractères minimum).');
    return e;
  }

  async save(): Promise<void> {
    const errs = this.validate();
    this.errors.set(errs);
    if (errs.length) return;
    if (this.difficulty() === 'expert' && !this.editing()) {
      if (!(await this.ui.confirm({ title: 'Quête Légendaire', message: 'Elle rapportera beaucoup d’XP : es-tu sûr qu’elle représente un vrai défi ?', confirm: 'Oui, la forger' }))) return;
    }
    this.busy.set(true);
    const existing = this.editing() ? this.game.templates().find((x) => x.id === this.id()) : undefined;
    const tips = [...this.tips().map((t) => t.trim()).filter(Boolean)];
    if (this.difficulty() === 'expert' && this.justification().trim()) tips.unshift(`Justification : ${this.justification().trim()}`);
    const t: QuestTemplate = {
      id: existing?.id ?? `custom-${crypto.randomUUID()}`,
      source: 'custom',
      ability: this.ability(),
      difficulty: this.difficulty(),
      periods: this.periods(),
      title: this.title().trim(),
      flavor: this.flavor().trim(),
      objective: this.objective().trim(),
      tips: tips.slice(0, 5),
      validation: this.validation(),
      tags: this.tags(),
      isActive: true,
    };
    try {
      await this.game.be.game.saveTemplate(t);
      if (this.pinned() || this.game.prefs()[t.id]?.isPinned) await this.game.setPreference({ templateId: t.id, isPinned: this.pinned() });
      await this.game.refresh();
      this.game.toast(this.editing() ? 'Quête enregistrée.' : 'Quête forgée ! Elle entrera dans le tirage.', 'success');
      this.ui.nav.navigateBack('/grimoire');
    } catch {
      this.errors.set(['Impossible d’enregistrer pour le moment. Réessaie.']);
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    const t = this.game.templates().find((x) => x.id === this.id());
    if (!t) return;
    if (!(await this.ui.confirm({ title: 'Désactiver cette quête ?', message: 'Elle quitte le tirage ; l’historique est conservé.', confirm: 'Désactiver', danger: true }))) return;
    await this.game.be.game.saveTemplate({ ...t, isActive: false });
    await this.game.refresh();
    this.ui.nav.navigateBack('/grimoire');
  }

  cancel(): void {
    this.ui.nav.back();
  }
}
