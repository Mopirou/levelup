import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { PageHeaderComponent, BarComponent } from '../../shared/ui';
import { ModalComponent } from '../../shared/modal.component';
import { AdventureStore } from '../adventure/adventure.store';
import { CARDS, CARD_KIND_GLYPH, CARD_KIND_LABEL, ITEM_LABEL, ITEM_RARITIES, type CardKind, type CardTemplate, type ItemRarity } from '../adventure/adventure.model';

type Filter = 'all' | CardKind;

/**
 * Collection « Bestiaire & Reliques » (docs/COLLECTION.md) : 60 cartes de D&D trouvées dans les coffres.
 * Une carte inconnue reste cachée (sa rareté seule est révélée). Aucune image : un glyphe, un nom, la rareté écrite en toutes lettres.
 */
@Component({
  selector: 'app-collection',
  imports: [IonContent, PageHeaderComponent, BarComponent, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content>
      <lu-page-header [back]="true" backTo="/tabs/adventure" eyebrow="Collection" icon="library" title="Bestiaire & Reliques" />
      <div class="lu-page">
        <p class="sr-only" role="status" aria-live="polite">{{ announce() }}</p>

        <section class="lu-card" aria-labelledby="h-prog" data-testid="collection-progress">
          <div class="row">
            <h2 id="h-prog" class="sh">{{ s.collected() }} / {{ s.cardTotal }} cartes</h2>
            <span class="lu-chip">{{ pct() }} %</span>
          </div>
          <lu-bar [value]="s.collected()" [max]="s.cardTotal" tone="gold" [thick]="true" label="Cartes de la collection" />
          <p class="small muted">Chaque coffre peut cacher une carte : plus il est rare, plus les cartes rares sont proches. Une carte en double se change en fragments.</p>
          <ul class="rar" aria-label="Avancement par rareté">
            @for (r of rarities; track r) {
              <li [attr.data-rarity]="r"><span class="dot r-bg" aria-hidden="true"></span> {{ label[r] }} <strong>{{ count(r) }}/{{ total(r) }}</strong></li>
            }
          </ul>
        </section>

        <div class="filters" role="group" aria-label="Filtrer la collection">
          @for (f of filters(); track f.id) {
            <button type="button" class="lu-chip fl" [class.on]="filter() === f.id" [attr.aria-pressed]="filter() === f.id" (click)="filter.set(f.id)">{{ f.label }} <span class="muted">{{ f.owned }}/{{ f.total }}</span></button>
          }
        </div>

        <ul class="grid" data-testid="card-grid">
          @for (c of shown(); track c.id) {
            @let n = s.cards().get(c.id) ?? 0;
            <li>
              @if (n > 0) {
                <button type="button" class="card on r-border" [attr.data-rarity]="c.rarity" [attr.data-testid]="'card-' + c.id" [attr.aria-label]="c.name + ', ' + label[c.rarity] + (n > 1 ? ', ' + n + ' exemplaires' : '') + '. Voir le détail'" (click)="open(c)">
                  <span class="cg" aria-hidden="true">{{ c.glyph }}</span>
                  <span class="cn">{{ c.name }}</span>
                  @if (n > 1) { <span class="cx" aria-hidden="true">×{{ n }}</span> }
                </button>
              } @else {
                <div class="card r-border off" [attr.data-rarity]="c.rarity" role="group" [attr.aria-label]="'Carte inconnue, ' + label[c.rarity] + ' : ' + kindLabel[c.kind]">
                  <span class="cg dim" aria-hidden="true">?</span>
                  <span class="cn muted">{{ label[c.rarity] }}</span>
                </div>
              }
            </li>
          }
        </ul>
        @if (s.state() === null && s.failed()) {
          <section class="lu-card">
            <p class="small">La collection n’a pas pu être chargée. Vérifie ta connexion.</p>
            <button type="button" class="lu-btn" (click)="s.load()">Réessayer</button>
          </section>
        }
      </div>

      @if (current(); as c) {
        <lu-modal [label]="c.name" (close)="selected.set(null)">
          <div class="dhead r-border" [attr.data-rarity]="c.rarity" data-testid="card-detail">
            <span class="big" aria-hidden="true">{{ c.glyph }}</span>
            <div>
              <h2 class="mt">{{ c.name }}</h2>
              <p class="xs"><span class="dot r-bg" aria-hidden="true"></span> {{ label[c.rarity] }} · {{ kindGlyph[c.kind] }} {{ kindLabel[c.kind] }}</p>
            </div>
          </div>
          <p class="small">{{ c.blurb }}</p>
          <p class="xs muted">{{ (s.cards().get(c.id) ?? 0) > 1 ? s.cards().get(c.id) + ' exemplaires trouvés.' : 'Un exemplaire trouvé.' }}</p>
          <button type="button" class="lu-btn mint" (click)="selected.set(null)">Fermer</button>
        </lu-modal>
      }
    </ion-content>
  `,
  styles: `
    :host {
      --r-commun: #8b8f8c; --r-peu_commun: #3f9a5c; --r-rare: #3f7fc4; --r-epique: #9a5fcf; --r-legendaire: #d9822b;
    }
    [data-rarity='commun'] { --r: var(--r-commun); } [data-rarity='peu_commun'] { --r: var(--r-peu_commun); }
    [data-rarity='rare'] { --r: var(--r-rare); } [data-rarity='epique'] { --r: var(--r-epique); } [data-rarity='legendaire'] { --r: var(--r-legendaire); }
    .r-border { border: 2px solid var(--r, var(--lu-border-strong)); }
    .r-bg { background: color-mix(in srgb, var(--r, var(--lu-border)) 40%, transparent); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: 0; }
    .sh { font-size: 19px; margin: 0; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .muted { color: var(--lu-text-2); }
    .rar { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px 12px; font-size: 13px; }
    .rar strong { font-variant-numeric: tabular-nums; margin-left: 4px; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--r); vertical-align: middle; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; }
    .fl { cursor: pointer; min-height: 40px; font: inherit; font-weight: 600; color: var(--lu-text); background: var(--lu-surface-2); border: 1.5px solid var(--lu-border-strong); }
    .fl.on { border-color: var(--lu-gold); background: var(--lu-surface); }
    .grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .card { position: relative; width: 100%; min-height: 112px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 8px 4px; border-radius: 14px; background: var(--lu-surface-2); color: var(--lu-text); font: inherit; text-align: center; }
    button.card { cursor: pointer; }
    .card.off { border-style: dashed; opacity: 0.7; }
    .cg { font-size: 34px; line-height: 1.1; } .cg.dim { opacity: 0.4; font-family: var(--lu-font-title); }
    .cn { font-size: 11.5px; font-weight: 700; line-height: 1.2; overflow-wrap: anywhere; }
    .cx { position: absolute; right: 6px; top: 4px; font-size: 11px; font-weight: 800; color: var(--lu-gold); }
    .dhead { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 16px; background: var(--lu-surface-2); }
    .big { font-size: 44px; line-height: 1; }
    .mt { font-size: 22px; margin: 0; padding-right: 36px; }
    .xs { font-size: 12px; margin: 2px 0 0; }
  `,
})
export class CollectionPage {
  protected s = inject(AdventureStore);
  readonly rarities = ITEM_RARITIES;
  readonly label = ITEM_LABEL;
  readonly kindLabel = CARD_KIND_LABEL;
  readonly kindGlyph = CARD_KIND_GLYPH;
  readonly filter = signal<Filter>('all');
  readonly selected = signal<string | null>(null);
  readonly announce = signal('');

  readonly pct = computed(() => Math.round((this.s.collected() / this.s.cardTotal) * 100));
  readonly shown = computed(() => CARDS.filter((c) => this.filter() === 'all' || c.kind === this.filter()));
  readonly current = computed(() => CARDS.find((c) => c.id === this.selected() && (this.s.cards().get(c.id) ?? 0) > 0) ?? null);
  readonly filters = computed(() => {
    const own = this.s.cards();
    const tally = (list: readonly CardTemplate[]) => list.filter((c) => own.has(c.id)).length;
    const kinds = (['bestiaire', 'relique'] as CardKind[]).map((k) => {
      const list = CARDS.filter((c) => c.kind === k);
      return { id: k as Filter, label: `${CARD_KIND_GLYPH[k]} ${CARD_KIND_LABEL[k]}`, owned: tally(list), total: list.length };
    });
    return [{ id: 'all' as Filter, label: 'Toutes', owned: tally(CARDS), total: CARDS.length }, ...kinds];
  });

  constructor() {
    void this.s.load();
  }

  /** Revient sur la page : de nouvelles cartes sont peut-être arrivées. */
  ionViewWillEnter(): void {
    void this.s.load();
  }

  count = (r: ItemRarity): number => CARDS.filter((c) => c.rarity === r && this.s.cards().has(c.id)).length;
  total = (r: ItemRarity): number => CARDS.filter((c) => c.rarity === r).length;

  open(c: CardTemplate): void {
    this.selected.set(c.id);
    this.announce.set(`${c.name}, ${ITEM_LABEL[c.rarity]}.`);
  }
}
