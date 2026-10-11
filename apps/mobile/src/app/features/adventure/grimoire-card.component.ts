import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { SpellView } from '../../core/api/types';
import { AdventureStore } from './adventure.store';
import { ABILITY_NAME, FAMILY_GLYPH, FAMILY_LABEL, ITEM_LABEL, ITEM_RARITIES, classInfo, classSpells, spellInfo } from './adventure.model';

/**
 * Carte « Grimoire » (docs/CLASSES.md) : 3 emplacements, les capacités connues avec leur niveau, équiper et retirer, bonus actifs.
 * Les capacités de sa classe donnent +25 % d'effet. Aucune image : un glyphe, un nom, la rareté écrite en toutes lettres.
 */
@Component({
  selector: 'lu-grimoire-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (g(); as gr) {
      <section class="lu-card" aria-labelledby="h-grim" data-testid="grimoire">
        <div class="row">
          <h2 id="h-grim" class="sh"><span aria-hidden="true">📖</span> Grimoire</h2>
          <span class="lu-chip" data-testid="grimoire-count">{{ known() }}/{{ total() }} {{ cls().name }}</span>
        </div>
        <p class="small muted">
          Équipe jusqu’à {{ gr.slots }} capacités. Celles de ta classe ({{ cls().icon }} {{ cls().name }}) donnent +25 % d’effet ; elles montent de niveau (jusqu’à 5) quand tu en retrouves un doublon dans un coffre.
        </p>

        <ol class="slots" aria-label="Emplacements du Grimoire">
          @for (id of gr.equipped; track $index) {
            <li>
              @if (viewOf(id); as sp) {
                <div class="slot on r-border" [attr.data-rarity]="sp.rarity" role="group" [attr.aria-label]="'Emplacement ' + ($index + 1) + ' : ' + info(sp).name + ', ' + rar[sp.rarity] + ', niveau ' + sp.level">
                  <span class="sg" aria-hidden="true">{{ info(sp).glyph }}</span>
                  <span class="sn">{{ info(sp).name }}</span>
                  <span class="xs muted">Niv. {{ sp.level }}/{{ sp.maxLevel }}</span>
                  <button type="button" class="lu-btn small ghost" [disabled]="s.busy()" [attr.aria-label]="'Retirer ' + info(sp).name + ' de l’emplacement ' + ($index + 1)" (click)="s.unequipSpell(sp.id, $index + 1)">Retirer</button>
                </div>
              } @else {
                <div class="slot" role="group" [attr.aria-label]="'Emplacement ' + ($index + 1) + ' : libre'">
                  <span class="sg dim" aria-hidden="true">✦</span>
                  <span class="sn muted">Libre</span>
                </div>
              }
            </li>
          }
        </ol>

        @if (bonusLines().length) {
          <div class="bonus" data-testid="grimoire-bonus">
            <h3 class="sh2">Bonus actifs</h3>
            <ul>
              @for (l of bonusLines(); track l) { <li>{{ l }}</li> }
            </ul>
          </div>
        }

        <h3 class="sh2">Capacités connues ({{ sorted().length }})</h3>
        @if (sorted().length === 0) {
          <p class="small muted" data-testid="grimoire-empty">Aucune capacité pour l’instant. Les coffres de bronze et mieux peuvent en contenir : plus le coffre est rare, plus la chance est grande.</p>
        } @else {
          <ul class="list">
            @for (sp of sorted(); track sp.id) {
              <li class="spell r-border" [attr.data-rarity]="sp.rarity" [attr.data-testid]="'spell-' + sp.id">
                <span class="sg" aria-hidden="true">{{ info(sp).glyph }}</span>
                <span class="st">
                  <strong>{{ info(sp).name }} @if (sp.ownClass) { <span class="own" title="Capacité de ta classe : +25 % d’effet">★<span class="sr-only"> capacité de ta classe, +25 % d’effet</span></span> }</strong>
                  <span class="xs"><span class="dot r-bg" aria-hidden="true"></span> {{ rar[sp.rarity] }} · niveau {{ sp.level }}/{{ sp.maxLevel }} · {{ famGlyph[sp.family] }} {{ famLabel[sp.family] }}</span>
                  <span class="xs">{{ sp.effect }}</span>
                  <span class="xs muted">{{ info(sp).blurb }}</span>
                </span>
                @if (sp.equippedSlot) {
                  <button type="button" class="lu-btn small ghost" [disabled]="s.busy()" [attr.aria-label]="'Retirer ' + info(sp).name + ' du Grimoire'" (click)="s.unequipSpell(sp.id, sp.equippedSlot)">Retirer</button>
                } @else if (full(gr.equipped)) {
                  <button type="button" class="lu-btn small" [disabled]="s.busy()" [attr.aria-expanded]="choosing() === sp.id" [attr.aria-label]="'Équiper ' + info(sp).name + ' : choisir l’emplacement à remplacer'" (click)="choosing.set(choosing() === sp.id ? null : sp.id)">Équiper</button>
                } @else {
                  <button type="button" class="lu-btn small mint" [disabled]="s.busy()" [attr.aria-label]="'Équiper ' + info(sp).name" (click)="s.equipSpell(sp.id)">Équiper</button>
                }
                @if (choosing() === sp.id) {
                  <div class="pick" role="group" [attr.aria-label]="'Remplacer quel emplacement par ' + info(sp).name + ' ?'">
                    @for (id of gr.equipped; track $index) {
                      <button type="button" class="lu-btn small ghost" [disabled]="s.busy()" [attr.aria-label]="'Remplacer ' + (id ? info(viewOf(id)!).name : 'l’emplacement libre') + ' (emplacement ' + ($index + 1) + ')'" (click)="pick(sp.id, $index + 1)">
                        {{ $index + 1 }} · {{ id ? info(viewOf(id)!).glyph : '✦' }}
                      </button>
                    }
                  </div>
                }
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    :host-context(app-adventure), :host {
      --r-commun: #8b8f8c; --r-peu_commun: #3f9a5c; --r-rare: #3f7fc4; --r-epique: #9a5fcf; --r-legendaire: #d9822b;
    }
    [data-rarity='commun'] { --r: var(--r-commun); } [data-rarity='peu_commun'] { --r: var(--r-peu_commun); }
    [data-rarity='rare'] { --r: var(--r-rare); } [data-rarity='epique'] { --r: var(--r-epique); } [data-rarity='legendaire'] { --r: var(--r-legendaire); }
    .r-border { border: 2px solid var(--r, var(--lu-border-strong)); }
    .r-bg { background: color-mix(in srgb, var(--r, var(--lu-border)) 28%, transparent); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: 0; }
    .sh { font-size: 19px; margin: 0; display: flex; align-items: center; gap: 8px; }
    .sh2 { font-size: 14px; margin: 6px 0 0; color: var(--lu-text-2); }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .slots { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .slot { min-height: 128px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; padding: 8px 4px; border-radius: 14px; background: var(--lu-surface-2); border: 1.5px dashed var(--lu-border-strong); text-align: center; }
    .slot.on { border-style: solid; }
    .sg { font-size: 28px; line-height: 1.1; } .sg.dim { opacity: 0.45; }
    .sn { font-size: 12px; font-weight: 700; line-height: 1.2; }
    .bonus ul { margin: 4px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .spell { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px; border-radius: 14px; background: var(--lu-surface-2); }
    .st { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 2px; }
    .st strong { font-size: 14px; }
    .xs { font-size: 12px; } .muted { color: var(--lu-text-2); }
    .own { color: var(--lu-gold); }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--r); vertical-align: middle; }
    .pick { flex-basis: 100%; display: flex; gap: 8px; }
  `,
})
export class GrimoireCardComponent {
  protected s = inject(AdventureStore);
  readonly g = this.s.grimoire;
  readonly rar = ITEM_LABEL;
  readonly famLabel = FAMILY_LABEL;
  readonly famGlyph = FAMILY_GLYPH;
  readonly choosing = signal<string | null>(null);
  readonly cls = computed(() => classInfo(this.s.heroClass()));
  readonly total = computed(() => classSpells(this.s.heroClass()).length);
  readonly known = computed(() => (this.g()?.spells ?? []).filter((x) => x.classId === this.s.heroClass()).length);
  /** Les plus rares d'abord ; à rareté égale, celles de sa classe puis le niveau */
  readonly sorted = computed(() =>
    [...(this.g()?.spells ?? [])].sort(
      (a, b) => ITEM_RARITIES.indexOf(b.rarity) - ITEM_RARITIES.indexOf(a.rarity) || Number(b.ownClass) - Number(a.ownClass) || b.level - a.level,
    ),
  );
  /** Phrases des bonus actifs (déjà plafonnés par le serveur) */
  readonly bonusLines = computed<string[]>(() => {
    const b = this.g()?.bonus;
    if (!b) return [];
    const pct = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
    const out: string[] = [];
    for (const [a, v] of Object.entries(b.xp)) if (v) out.push(`+${pct(v)} % d’XP en ${ABILITY_NAME[a] ?? a} (plafond 25 %)`);
    for (const [a, v] of Object.entries(b.stats)) if (v) out.push(`+${v} en ${ABILITY_NAME[a] ?? a} (aventure)`);
    if (b.raid) out.push(`+${pct(b.raid)} % de dégâts de raid`);
    if (b.gold) out.push(`+${pct(b.gold)} % d’or d’expédition`);
    if (b.chest) out.push(`butin de coffre meilleur de ${pct(b.chest)} points`);
    if (b.dungeon) out.push(`+${pct(b.dungeon)} % de Constitution en donjon`);
    if (b.pp) out.push(`+${b.pp} PP`);
    return out;
  });

  info = (sp: Pick<SpellView, 'id'>) => spellInfo(sp.id);
  viewOf = (id: string | null): SpellView | undefined => (id ? this.g()?.spells.find((x) => x.id === id) : undefined);
  full = (equipped: readonly (string | null)[]): boolean => equipped.every((x) => !!x);

  async pick(spellId: string, slot: number): Promise<void> {
    this.choosing.set(null);
    await this.s.equipSpell(spellId, slot);
  }
}
