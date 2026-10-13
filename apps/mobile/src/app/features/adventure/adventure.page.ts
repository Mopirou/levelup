import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonContent, NavController } from '@ionic/angular';
import { UiService } from '../../core/ui.service';
import { BarComponent, PageHeaderComponent } from '../../shared/ui';
import { ModalComponent } from '../../shared/modal.component';
import { ItemChipComponent } from '../../shared/item-chip.component';
import { fmt } from '../../shared/format';
import type { DungeonEntry, EquipSlot, ItemView } from '../../core/api/types';
import { RaidCardComponent } from '../raid/raid-card.component';
import { SeasonCardComponent } from '../season/season-card.component';
import { GrimoireCardComponent } from './grimoire-card.component';
import { AdventureStore } from './adventure.store';
import {
  ABILITY_NAME, CARD_FLAVOR, CARD_KIND_GLYPH, CARD_KIND_LABEL, CHEST_GLYPH, CHEST_LABEL, CHEST_RARITIES, FAMILY_GLYPH, FAMILY_LABEL, ITEM_LABEL, ITEM_RARITIES, MAX_ITEM_LEVEL, SLOTS, SLOT_GLYPH, SLOT_LABEL, SPELL_FLAVOR, cardInfo, classInfo, isBigCard, isBigSpell, itemInfo, setInfo, spellInfo, tierLabel,
  type ItemRarity,
} from './adventure.model';

/** Onglet « Aventure » (docs/DONJONS.md §13) : puissance, expédition, coffres, équipement, donjons. */
@Component({
  selector: 'app-adventure',
  imports: [IonContent, PageHeaderComponent, BarComponent, ModalComponent, ItemChipComponent, GrimoireCardComponent, RaidCardComponent, SeasonCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content>
      <lu-page-header eyebrow="Aventure" icon="swords" title="Ton aventure" />
      <div class="lu-page">
        <p class="sr-only" role="status" aria-live="polite">{{ s.announce() }}</p>

        @if (st(); as state) {
          <!-- Bandeau puissance et ressources -->
          <section class="lu-card hero" aria-labelledby="h-pp">
            <div class="pp">
              <span class="lu-eyebrow" id="h-pp">PUISSANCE</span>
              <strong class="ppv" data-testid="pp">{{ fmt(state.power) }} PP</strong>
              <span class="xs muted" data-testid="pp-detail">Niveau {{ state.powerBreakdown.level }} · caractéristiques {{ state.powerBreakdown.scores }} · équipement {{ state.powerBreakdown.items }}@if (state.powerBreakdown.sets) { · panoplies {{ state.powerBreakdown.sets }} }@if (state.powerBreakdown.spells) { · capacités {{ state.powerBreakdown.spells }} }</span>
            </div>
            <ul class="res" aria-label="Ressources">
              <li><span aria-hidden="true">🪙</span><strong>{{ fmt(state.gold) }}</strong><span class="xs muted">Or</span></li>
              <li><span aria-hidden="true">🔹</span><strong>{{ fmt(state.fragments) }}</strong><span class="xs muted">Fragments</span></li>
              <li><span aria-hidden="true">🗝️</span><strong>{{ state.keys }}/{{ state.maxKeys }}</strong><span class="xs muted">{{ state.keys > 1 ? 'Clés' : 'Clé' }}</span></li>
            </ul>
            <details class="how">
              <summary>Comment ça marche ?</summary>
              <p class="small muted">Ta puissance grandit avec ton niveau, tes caractéristiques et ton équipement. Elle fait rapporter plus à l’expédition et te mène plus loin dans les donjons. Les coffres viennent de ta discipline : première quête de parcours du jour, échelons, séries. Rater un jour ralentit, mais ne retire jamais rien.</p>
            </details>
          </section>

          <!-- Expédition -->
          <section class="lu-card" aria-labelledby="h-exp">
            <h2 id="h-exp" class="sh"><span aria-hidden="true">🧭</span> Expédition</h2>
            <p class="small muted">Ton héros explore pour toi, même quand tu n’es pas là. Il rapporte jusqu’à {{ state.expedition.capHours }} h de butin.</p>
            <p class="gain" data-testid="expedition-gain">
              <span>🪙 +{{ fmt(state.expedition.gold) }} or</span>
              <span>🔹 +{{ fmt(state.expedition.fragments) }} fragments</span>
            </p>
            <p class="xs muted" data-testid="expedition-hours">En route depuis {{ hoursLabel(state.expedition.hours) }}.</p>
            @if (state.expedition.capped) { <p class="xs gold">Butin au maximum : réclame-le pour relancer l’expédition.</p> }
            @if (!state.expedition.claimable) { <p class="xs muted">L’expédition vient de partir : reviens un peu plus tard.</p> }
            <button type="button" class="lu-btn mint" [disabled]="s.busy() || !state.expedition.claimable" (click)="s.claim()">Réclamer le butin</button>
          </section>

          <!-- Coffres -->
          <section class="lu-card" aria-labelledby="h-chests">
            <div class="row">
              <h2 id="h-chests" class="sh"><span aria-hidden="true">🎁</span> Coffres</h2>
              <span class="lu-chip" data-testid="opens">{{ state.opens.today }} ouvert{{ state.opens.today > 1 ? 's' : '' }} aujourd’hui</span>
            </div>
            @if (totalChests() === 0) {
              <p class="small muted">Aucun coffre pour l’instant. Ils arrivent avec ta discipline : première quête de parcours du jour, échelons, séries.</p>
            } @else {
              <p class="small muted">Ouvre autant de coffres que tu en as. Chaque jour, 2 coffres te sont offerts (bois et argent) ; les autres se méritent ou s’achètent. Fusionne trois coffres de même rareté pour en obtenir un meilleur.</p>
              <ul class="chests">
                @for (r of rarities; track r) {
                  @if (s.chestCounts()[r] > 0) {
                    <li class="crow" [attr.data-rarity]="r">
                      <span class="cg r-bg" aria-hidden="true">{{ chestGlyph[r] }}</span>
                      <span class="ct"><strong>Coffre {{ chestLabel[r] }}</strong><span class="xs muted">x{{ s.chestCounts()[r] }}</span></span>
                      <button type="button" class="lu-btn small" [disabled]="s.busy()" [attr.aria-label]="'Ouvrir un coffre ' + chestLabel[r]" (click)="s.open(r)">
                        Ouvrir
                      </button>
                      @if (r !== 'mythique') {
                        <button type="button" class="lu-btn small ghost" [disabled]="s.busy() || s.chestCounts()[r] < 3" [attr.aria-label]="'Fusionner 3 coffres ' + chestLabel[r] + ' en 1 coffre supérieur'" (click)="s.mergeChests(r)">
                          3 → 1
                        </button>
                      }
                    </li>
                  }
                }
              </ul>
            }
          </section>

          <!-- Boutique : coffres contre fragments -->
          <section class="lu-card" aria-labelledby="h-shop" data-testid="shop">
            <div class="row">
              <h2 id="h-shop" class="sh"><span aria-hidden="true">🛒</span> Boutique</h2>
              <span class="lu-chip" data-testid="shop-fragments" [attr.aria-label]="fmt(state.fragments) + ' fragments'">🔹 {{ fmt(state.fragments) }}</span>
            </div>
            <p class="small muted">Dépense tes fragments pour acheter des coffres, et ouvre-les quand tu veux. Chaque coffre peut cacher un objet, une capacité ou une carte de ta collection.</p>
            <ul class="chests">
              @for (o of s.shop(); track o.rarity) {
                <li class="crow" [attr.data-rarity]="o.rarity" [attr.data-testid]="'shop-' + o.rarity">
                  <span class="cg r-bg" aria-hidden="true">{{ chestGlyph[o.rarity] }}</span>
                  <span class="ct">
                    <strong>Coffre {{ chestLabel[o.rarity] }}</strong>
                    <span class="xs muted">{{ o.price }} 🔹@if (state.fragments < o.price) { · il te manque {{ o.price - state.fragments }} }</span>
                  </span>
                  <button type="button" class="lu-btn small mint" [disabled]="s.busy() || state.fragments < o.price" [attr.aria-label]="'Acheter un coffre ' + chestLabel[o.rarity] + ' pour ' + o.price + ' fragments'" (click)="s.buy(o.rarity)">
                    Acheter
                  </button>
                </li>
              }
            </ul>
            <h3 class="sh2">Acheter des fragments</h3>
            <p class="xs muted">Tu as <strong>🪙 {{ fmt(state.gold) }}</strong>. L’or ne s’obtient pas en échange des fragments.</p>
            <ul class="chests" data-testid="fragment-packs">
              @for (p of s.packs(); track p.id) {
                <li class="crow" [attr.data-testid]="'pack-' + p.id">
                  <span class="cg" aria-hidden="true">🔹</span>
                  <span class="ct"><strong>{{ p.fragments }} fragments</strong><span class="xs muted">{{ fmt(p.gold) }} 🪙@if (state.gold < p.gold) { · il te manque {{ fmt(p.gold - state.gold) }} }</span></span>
                  <button type="button" class="lu-btn small" [disabled]="s.busy() || state.gold < p.gold" [attr.aria-label]="'Acheter ' + p.fragments + ' fragments pour ' + p.gold + ' or'" (click)="s.buyFragments(p)">Acheter</button>
                </li>
              }
            </ul>
            <p class="xs muted">Les fragments viennent de l’expédition, des donjons, des doublons et du démontage d’objets. Les coffres d’or et mythiques se méritent : séries, échelons, boss.</p>
          </section>

          <!-- Collection : Bestiaire & Reliques -->
          <section class="lu-card" aria-labelledby="h-coll" data-testid="collection-card">
            <div class="row">
              <h2 id="h-coll" class="sh"><span aria-hidden="true">🎴</span> Bestiaire &amp; Reliques</h2>
              <span class="lu-chip" data-testid="collection-count">{{ s.collected() }}/{{ s.cardTotal }}</span>
            </div>
            <p class="small muted">Monstres célèbres et objets légendaires à collectionner : on les trouve dans les coffres. Les doublons se changent en fragments.</p>
            <lu-bar [value]="s.collected()" [max]="s.cardTotal" tone="gold" label="Cartes de la collection" />
            <button type="button" class="lu-btn" data-testid="open-collection" (click)="openCollection()">Ouvrir la collection</button>
          </section>

          <!-- Équipement -->
          <section class="lu-card" aria-labelledby="h-eq">
            <h2 id="h-eq" class="sh"><span aria-hidden="true">🛡️</span> Équipement</h2>
            <ul class="slots">
              @for (slot of slots; track slot) {
                <li>
                  @if (equippedIn(slot); as it) {
                    <button type="button" class="slot on r-border" [attr.data-rarity]="it.rarity" [attr.aria-label]="slotLabel[slot] + ' : ' + name(it) + ', ' + itemLabel[it.rarity] + ', niveau ' + it.level + (it.affinity ? ', affinité de classe' : '') + '. Voir le détail'" (click)="selected.set(it.id)">
                      <span class="sg" aria-hidden="true">{{ glyph(it) }}@if (it.affinity) { <span class="aff">★</span> }</span>
                      <span class="sl">{{ slotLabel[slot] }}</span>
                      <span class="sp">{{ it.power }} PP</span>
                    </button>
                  } @else {
                    <div class="slot" role="group" [attr.aria-label]="slotLabel[slot] + ' : vide'">
                      <span class="sg dim" aria-hidden="true">{{ slotGlyph[slot] }}</span>
                      <span class="sl">{{ slotLabel[slot] }}</span>
                      <span class="sp muted">Vide</span>
                    </div>
                  }
                </li>
              }
            </ul>

            <h3 class="sh2">Panoplies</h3>
            <p class="small muted" data-testid="affinity-help">Les objets de ta classe ({{ myClass().icon }} {{ myClass().name }}), marqués d’une ★, donnent +20 % de PP. Les objets universels et ceux des autres classes s’équipent sans bonus.</p>
            <p class="small muted">Équipe plusieurs pièces d’une même panoplie : à 2, 4 puis 6 pièces, elle ajoute de la puissance et un bonus de caractéristique.</p>
            <ul class="sets" data-testid="sets">
              @for (p of s.sets(); track p.setId) {
                <li class="set" [class.active]="!!p.tier" [attr.data-testid]="'set-' + p.setId">
                  <div class="row">
                    <strong>{{ setInfo(p.setId).glyph }} {{ setInfo(p.setId).name }}@if (p.setId === state.heroClass) { <span class="aff" title="Panoplie de ta classe">★<span class="sr-only"> panoplie de ta classe</span></span> }</strong>
                    <span class="lu-chip" [attr.aria-label]="p.equipped + ' pièces équipées sur 6, ' + p.owned + ' possédées'">{{ p.equipped }}/6</span>
                  </div>
                  <ul class="pcs" aria-hidden="true">
                    @for (pc of p.pieces; track pc.slot) {
                      <li [class.eq]="pc.equipped" [class.own]="pc.owned" [attr.title]="slotLabel[pc.slot]">{{ pieceGlyph(pc) }}</li>
                    }
                  </ul>
                  <ul class="tiers">
                    @for (t of setInfo(p.setId).bonuses; track t.pieces) {
                      <li [class.on]="p.equipped >= t.pieces">{{ p.equipped >= t.pieces ? '✓' : '○' }} {{ t.pieces }} pièces : {{ tierLabel(t, setInfo(p.setId).ability) }}@if (p.equipped >= t.pieces) { <span class="sr-only"> (actif)</span> }</li>
                    }
                  </ul>
                </li>
              }
            </ul>

            <h3 class="sh2">Dans ton sac ({{ s.stock().length }})</h3>
            @if (s.stock().length === 0) {
              <p class="small muted">Ton sac est vide. Ouvre un coffre pour trouver ton premier objet.</p>
            } @else {
              <ul class="bag">
                @for (it of sortedStock(); track it.id) {
                  <li>
                    <button type="button" class="irow r-border" [attr.data-rarity]="it.rarity" [attr.aria-label]="name(it) + ', ' + itemLabel[it.rarity] + ', niveau ' + it.level + ', ' + it.power + ' PP. Voir le détail'" (click)="selected.set(it.id)">
                      <lu-item-chip [item]="it" />
                    </button>
                  </li>
                }
              </ul>
              @if (forgeable().length) {
                <h3 class="sh2">Forge</h3>
                @for (r of forgeable(); track r) {
                  <button type="button" class="lu-btn small ghost" [disabled]="s.busy()" [attr.aria-label]="'Fusionner 3 objets ' + itemLabel[r] + ' en 1 objet supérieur'" (click)="mergeItems(r)">
                    ⚒️ Fusionner 3 objets {{ itemLabel[r] }} → 1
                  </button>
                }
              }
            }
          </section>

          <!-- Grimoire : capacités de classe (V4) -->
          <lu-grimoire-card />

          <!-- Raid d'amis (chargé à la demande pour alléger le bundle initial) -->
          @defer (on idle) {
            <lu-raid-card />
          } @placeholder {
            <div class="lu-skeleton" style="height: 120px" aria-busy="true"></div>
          }

          <!-- Saison : classement de puissance entre amis et récompense de fin de saison -->
          @defer (on idle) {
            <lu-season-card />
          } @placeholder {
            <div class="lu-skeleton" style="height: 120px" aria-busy="true"></div>
          }

          <!-- Donjons -->
          <section class="lu-card" aria-labelledby="h-dj">
            <div class="row">
              <h2 id="h-dj" class="sh"><span aria-hidden="true">🏰</span> Donjons</h2>
              <span class="lu-chip" data-testid="keys">🗝️ {{ state.keys }}/{{ state.maxKeys }} {{ state.keys > 1 ? 'Clés' : 'Clé' }}</span>
            </div>
            <p class="small muted">Une expédition dans un donjon coûte une Clé. Plus ta puissance est grande, plus tu vas loin.</p>
            @if (s.dungeons().length === 0) {
              <p class="small muted">Les donjons s’ouvrent au fil de tes niveaux.</p>
            } @else {
              <ul class="dj">
                @for (d of s.dungeons(); track d.dungeon.id) {
                  <li class="drow">
                    <span class="dg" aria-hidden="true">{{ d.dungeon.glyph }}</span>
                    <span class="dt">
                      <strong>{{ d.dungeon.name }}</strong>
                      @if (d.unlocked) {
                        <span class="xs muted">Palier {{ d.dungeon.tier }} · {{ bestLabel(d) }}</span>
                        @if (!d.bossChestClaimed) { <span class="xs muted">Première victoire sur le boss : coffre {{ chestLabel[d.bossChest] }}</span> }
                      } @else {
                        <span class="xs muted">Verrouillé · niveau {{ d.dungeon.unlockLevel }}</span>
                      }
                    </span>
                    <button type="button" class="lu-btn small" [disabled]="s.busy() || !d.unlocked || state.keys < 1" [attr.aria-label]="'Lancer le donjon ' + d.dungeon.name + ' (1 Clé)'" (click)="s.runDungeon(d)">Lancer</button>
                  </li>
                }
              </ul>
            }
          </section>
        } @else if (s.failed()) {
          <section class="lu-card">
            <p class="small">L’aventure n’a pas pu être chargée. Vérifie ta connexion.</p>
            <button type="button" class="lu-btn" (click)="s.load()">Réessayer</button>
          </section>
        } @else {
          <div class="lu-skeleton" style="height: 120px" aria-busy="true"></div>
        }
      </div>

      <!-- Détail d'un objet -->
      @if (current(); as it) {
        <lu-modal [label]="name(it)" (close)="selected.set(null)">
          <div class="dhead r-border" [attr.data-rarity]="it.rarity">
            <span class="big" aria-hidden="true">{{ glyph(it) }}</span>
            <div>
              <h2 class="mt">{{ name(it) }}</h2>
              <p class="xs"><span class="dot r-bg" aria-hidden="true"></span> {{ itemLabel[it.rarity] }} · {{ slotLabel[it.slot] }} · niveau {{ it.level }}/{{ maxLevel }}</p>
            </div>
          </div>
          <p class="small"><strong>{{ it.power }} PP</strong> · +{{ it.abilityBonus }} {{ abilityName(it.ability) }}{{ it.equipped ? ' · équipé' : '' }}</p>
          <p class="xs" data-testid="item-class">
            @if (it.affinity) { <span class="aff" aria-hidden="true">★</span> <strong>Objet de ta classe : +20 % de PP</strong> }
            @else if (it.classId) { {{ classLabel(it.classId) }} : pas d’affinité pour toi }
            @else { 🎒 Objet universel : sans affinité }
          </p>
          @if (it.setId; as sid) { <p class="xs" data-testid="item-set">{{ setInfo(sid).glyph }} Pièce de la {{ setInfo(sid).name }} ({{ setCount(sid) }}/6 équipées)</p> }
          @if (blurb(it)) { <p class="xs muted">{{ blurb(it) }}</p> }
          <div class="acts">
            @if (it.equipped) {
              <button type="button" class="lu-btn" [disabled]="s.busy()" (click)="unequip(it)">Retirer</button>
            } @else {
              <button type="button" class="lu-btn mint" [disabled]="s.busy()" (click)="equip(it)">Équiper</button>
            }
            <button type="button" class="lu-btn ghost" [disabled]="s.busy() || !canAfford(it)" (click)="upgrade(it)">
              @if (it.upgradeCost; as c) { Améliorer ({{ c.fragments }} 🔹 · {{ c.gold }} 🪙) } @else { Niveau maximum }
            </button>
            @if (!it.equipped) {
              <button type="button" class="lu-btn ghost danger" [disabled]="s.busy()" (click)="dismantle(it)">Démonter (+{{ it.dismantleValue }} 🔹)</button>
            }
          </div>
          @if (it.upgradeCost && !canAfford(it)) { <p class="xs muted">Il te manque des fragments ou de l’or pour l’améliorer.</p> }
        </lu-modal>
      }

      <!-- Résultat d'ouverture -->
      @if (s.opened(); as o) {
        <lu-modal label="Coffre ouvert" (close)="s.opened.set(null)">
          <h2 class="mt">Coffre {{ chestLabel[o.chest.rarity] }} ouvert</h2>
          @if (o.spell; as sg) {
            @let sp = spellInfo(sg.spell.id);
            @if (big(sg.spell.rarity)) {
              <p class="wow" data-testid="spell-announce" role="status">✨ {{ sp.name }} !</p>
              <p class="small muted">{{ flavor[sg.spell.rarity] }}</p>
            }
            <div class="dhead r-border" [attr.data-rarity]="sg.spell.rarity" data-testid="open-result">
              <span class="big" aria-hidden="true">{{ sp.glyph }}</span>
              <div>
                <h3 class="mt2">{{ sp.name }}</h3>
                <p class="xs"><span class="dot r-bg" aria-hidden="true"></span> Capacité {{ itemLabel[sg.spell.rarity].toLowerCase() }} · {{ famGlyph[sg.spell.family] }} {{ famLabel[sg.spell.family] }}@if (sg.spell.ownClass) { · ★ ta classe }</p>
                <p class="xs">{{ sg.spell.effect }}</p>
              </div>
            </div>
            <p class="small" data-testid="spell-gain">
              @if (sg.isNew) { Nouvelle capacité ! Elle est dans ton Grimoire, niveau 1. }
              @else if (sg.fragments) { Déjà au niveau maximal ({{ sg.spell.maxLevel }}) : elle se transforme en {{ sg.fragments }} 🔹 fragments. }
              @else { Tu la connaissais déjà : elle passe du niveau {{ sg.levelBefore }} au niveau {{ sg.spell.level }}/{{ sg.spell.maxLevel }}. }
            </p>
          } @else if (o.card; as cg) {
            @let ci = cardInfo(cg.cardId);
            @if (cg.isNew && bigCard(cg.rarity)) {
              <p class="wow" data-testid="card-announce" role="status">✨ {{ ci.name }} !</p>
            }
            <div class="dhead r-border" [attr.data-rarity]="cg.rarity" data-testid="open-result">
              <span class="big" aria-hidden="true">{{ ci.glyph }}</span>
              <div>
                <h3 class="mt2">{{ ci.name }}</h3>
                <p class="xs"><span class="dot r-bg" aria-hidden="true"></span> Carte {{ itemLabel[cg.rarity].toLowerCase() }} · {{ kindGlyph[ci.kind] }} {{ kindLabel[ci.kind] }}</p>
                <p class="xs muted">{{ ci.blurb }}</p>
              </div>
            </div>
            <p class="small" data-testid="card-gain">
              @if (cg.isNew) { Nouvelle carte ! Elle rejoint ta collection ({{ s.collected() }}/{{ s.cardTotal }}). {{ cardFlavor[cg.rarity] }} }
              @else { Tu l’avais déjà (exemplaire {{ cg.copies }}) : le doublon se change en {{ cg.fragments }} 🔹 fragments. }
            </p>
          } @else if (o.item; as it) {
            <div class="dhead r-border" [attr.data-rarity]="it.rarity" data-testid="open-result">
              <span class="big" aria-hidden="true">{{ glyph(it) }}</span>
              <div>
                <h3 class="mt2">{{ name(it) }}</h3>
                <p class="xs"><span class="dot r-bg" aria-hidden="true"></span> {{ itemLabel[it.rarity] }} · {{ slotLabel[it.slot] }} · {{ it.power }} PP@if (it.affinity) { · ★ ta classe }</p>
              </div>
            </div>
          }
          @if (o.guaranteed) { <p class="xs gold">La chance te sourit : un butin {{ o.guaranteed === 'legendaire' ? 'légendaire' : 'épique' }} t’était garanti.</p> }
          <p class="gain"><span>🔹 +{{ o.fragments }} fragments</span><span>🪙 +{{ o.gold }} or</span></p>
          <button type="button" class="lu-btn mint" (click)="s.opened.set(null)">Super</button>
        </lu-modal>
      }

      <!-- Compte-rendu de donjon -->
      @if (s.run(); as r) {
        <lu-modal label="Compte-rendu de donjon" (close)="s.run.set(null)">
          <h2 class="mt">{{ r.dungeonName }}</h2>
          @let res = r.result;
          <p class="small" data-testid="run-summary">
            @if (res.bossDefeated) { <strong>Boss vaincu !</strong> Le donjon est à toi. }
            @else { <strong>Tu as franchi {{ res.reachedRoom }} salle{{ res.reachedRoom > 1 ? 's' : '' }} sur 5.</strong>
              @if (res.missingPower) { Il te manque {{ fmt(res.missingPower) }} PP pour passer l’obstacle suivant. }
            }
          </p>
          @if (res.log.length) {
            <ol class="log" aria-label="Journal de la run">
              @for (l of res.log; track $index) { <li>{{ l }}</li> }
            </ol>
          }
          <p class="gain">
            <span>🪙 +{{ fmt(res.gold) }} or</span><span>🔹 +{{ fmt(res.fragments) }} fragments</span>
            @if (res.chest) { <span>{{ chestGlyph[res.chest] }} Coffre {{ chestLabel[res.chest] }}</span> }
          </p>
          <button type="button" class="lu-btn mint" (click)="s.run.set(null)">Fermer</button>
        </lu-modal>
      }
    </ion-content>
  `,
  styles: `
    :host {
      --r-commun: #8b8f8c; --r-peu_commun: #3f9a5c; --r-rare: #3f7fc4; --r-epique: #9a5fcf; --r-legendaire: #d9822b;
      --r-bois: #8b6a44; --r-bronze: #b0703a; --r-argent: #8f9aa3; --r-or: #d4af37; --r-mythique: #c4478f;
    }
    [data-rarity='commun'] { --r: var(--r-commun); } [data-rarity='peu_commun'] { --r: var(--r-peu_commun); }
    [data-rarity='rare'] { --r: var(--r-rare); } [data-rarity='epique'] { --r: var(--r-epique); } [data-rarity='legendaire'] { --r: var(--r-legendaire); }
    [data-rarity='bois'] { --r: var(--r-bois); } [data-rarity='bronze'] { --r: var(--r-bronze); } [data-rarity='argent'] { --r: var(--r-argent); }
    [data-rarity='or'] { --r: var(--r-or); } [data-rarity='mythique'] { --r: var(--r-mythique); }
    .r-border { border: 2px solid var(--r, var(--lu-border-strong)); }
    .r-bg { background: color-mix(in srgb, var(--r, var(--lu-border)) 28%, transparent); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: 0; }
    .sh { font-size: 19px; margin: 0; display: flex; align-items: center; gap: 8px; }
    .sh2 { font-size: 14px; margin: 6px 0 0; color: var(--lu-text-2); }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .hero { gap: 14px; }
    .pp { display: flex; flex-direction: column; gap: 2px; }
    .ppv { font-family: var(--lu-font-title); font-size: 38px; line-height: 1.1; font-weight: 500; }
    .res { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .res li { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 4px; background: var(--lu-surface-2); border-radius: 14px; font-size: 18px; }
    .res strong { font-size: 16px; font-variant-numeric: tabular-nums; }
    .how summary { cursor: pointer; font-weight: 600; font-size: 14px; padding: 6px 0; }
    .how p { margin: 4px 0 0; }
    .gain { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 0; font-weight: 600; font-size: 15px; }
    .gold { color: var(--lu-gold); }
    .aff { color: var(--lu-gold); font-size: 0.7em; vertical-align: super; font-weight: 700; }
    .wow { font-family: var(--lu-font-title); font-size: 28px; margin: 4px 0 0; text-align: center; color: var(--lu-gold); }
    .chests, .bag, .dj { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .crow, .drow { display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 14px; background: var(--lu-surface-2); border: 1px solid var(--lu-border); }
    .crow { border-left: 4px solid var(--r); flex-wrap: wrap; }
    .cg, .dg { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-size: 22px; flex: none; background: var(--lu-surface); }
    .ct, .dt { flex: 1; min-width: 120px; display: flex; flex-direction: column; gap: 2px; }
    .slots { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .slot { width: 100%; min-height: 92px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 8px 4px; border-radius: 14px; background: var(--lu-surface-2); border: 1.5px dashed var(--lu-border-strong); color: var(--lu-text); font: inherit; }
    button.slot { border-style: solid; cursor: pointer; }
    .sg { font-size: 28px; line-height: 1.1; } .sg.dim { opacity: 0.45; }
    .sl { font-size: 11px; color: var(--lu-text-2); } .sp { font-size: 12px; font-weight: 700; }
    .irow { width: 100%; text-align: left; padding: 8px 10px; border-radius: 14px; background: var(--lu-surface-2); color: var(--lu-text); font: inherit; cursor: pointer; min-height: 52px; }
    .dhead { display: flex; align-items: center; gap: 14px; padding: 12px; border-radius: 16px; background: var(--lu-surface-2); }
    .big { font-size: 40px; line-height: 1; }
    .mt { font-size: 24px; margin: 0; padding-right: 36px; } .mt2 { font-size: 18px; margin: 0; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--r); vertical-align: middle; }
    .acts { display: flex; flex-direction: column; gap: 8px; }
    .danger { color: var(--lu-danger); }
    .sets { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .set { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 14px; background: var(--lu-surface-2); border: 1px solid var(--lu-border); }
    .set.active { border-color: var(--lu-gold); }
    .pcs, .tiers { list-style: none; margin: 0; padding: 0; }
    .pcs { display: flex; gap: 6px; }
    .pcs li { width: 34px; height: 34px; display: grid; place-items: center; font-size: 19px; border-radius: 50%; border: 2px dashed var(--lu-border-strong); opacity: 0.35; filter: grayscale(1); }
    .pcs li.own { opacity: 0.8; border-style: solid; filter: none; }
    .pcs li.eq { opacity: 1; border-color: var(--lu-gold); background: var(--lu-surface); }
    .tiers { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--lu-text-2); }
    .tiers li.on { color: var(--lu-text); font-weight: 700; }
    .log { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; line-height: 1.45; }
  `,
})
export class AdventurePage {
  protected s = inject(AdventureStore);
  private ui = inject(UiService);
  private nav = inject(NavController);
  readonly fmt = fmt;
  readonly st = this.s.state;
  readonly rarities = CHEST_RARITIES;
  readonly slots = SLOTS;
  readonly chestLabel = CHEST_LABEL;
  readonly chestGlyph = CHEST_GLYPH;
  readonly itemLabel = ITEM_LABEL;
  readonly slotLabel = SLOT_LABEL;
  readonly slotGlyph = SLOT_GLYPH;
  readonly maxLevel = MAX_ITEM_LEVEL;
  readonly setInfo = setInfo;
  readonly spellInfo = spellInfo;
  readonly famLabel = FAMILY_LABEL;
  readonly famGlyph = FAMILY_GLYPH;
  readonly flavor = SPELL_FLAVOR;
  readonly big = isBigSpell;
  readonly bigCard = isBigCard;
  readonly cardInfo = cardInfo;
  readonly cardFlavor = CARD_FLAVOR;
  readonly kindGlyph = CARD_KIND_GLYPH;
  readonly kindLabel = CARD_KIND_LABEL;
  readonly tierLabel = tierLabel;
  readonly selected = signal<string | null>(null);

  readonly myClass = computed(() => classInfo(this.st()?.heroClass));
  readonly totalChests = computed(() => this.st()?.chests.length ?? 0);
  readonly current = computed(() => (this.st()?.items ?? []).find((i) => i.id === this.selected()) ?? null);
  readonly sortedStock = computed(() =>
    [...this.s.stock()].sort((a, b) => ITEM_RARITIES.indexOf(b.rarity) - ITEM_RARITIES.indexOf(a.rarity) || b.power - a.power),
  );
  /** Raretés pour lesquelles trois objets non équipés au moins sont disponibles. */
  readonly forgeable = computed(() => ITEM_RARITIES.filter((r) => this.s.mergeable(r).length >= 3));

  constructor() {
    void this.s.load();
  }

  /** Revient sur l'onglet : l'expédition a avancé, de nouveaux coffres sont peut-être arrivés. */
  ionViewWillEnter(): void {
    void this.s.load();
  }

  equippedIn = (slot: EquipSlot): ItemView | undefined => this.s.equipped().find((i) => i.slot === slot);
  abilityName = (a: string) => ABILITY_NAME[a] ?? a;
  classLabel = (id: string) => `${classInfo(id).icon} Objet ${classInfo(id).name === 'Universel' ? '' : 'du ' + classInfo(id).name.toLowerCase()}`;
  pieceGlyph = (pc: { slot: EquipSlot; templateId: string }) => itemInfo(pc).glyph;
  setCount = (setId: string): number => this.s.sets().find((p) => p.setId === setId)?.equipped ?? 0;

  name = (it: ItemView) => itemInfo(it).name;
  glyph = (it: ItemView) => itemInfo(it).glyph;
  blurb = (it: ItemView) => itemInfo(it).blurb;
  canAfford(it: ItemView): boolean {
    const st = this.st();
    return !!st && !!it.upgradeCost && st.fragments >= it.upgradeCost.fragments && st.gold >= it.upgradeCost.gold;
  }
  hoursLabel(h: number): string {
    const m = Math.round(h * 60);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  }
  bestLabel(d: DungeonEntry): string {
    return d.bestRoom >= 6 ? 'Boss vaincu' : d.bestRoom === 0 ? 'Jamais exploré' : `Meilleure salle : ${d.bestRoom}/5`;
  }

  openCollection(): void {
    void this.nav.navigateForward('/collection');
  }

  async equip(it: ItemView): Promise<void> {
    await this.s.equip(it);
    this.selected.set(null);
  }
  async unequip(it: ItemView): Promise<void> {
    await this.s.unequip(it);
    this.selected.set(null);
  }
  async upgrade(it: ItemView): Promise<void> {
    await this.s.upgrade(it);
  }
  async dismantle(it: ItemView): Promise<void> {
    const ok = await this.ui.confirm({
      title: `Démonter ${itemInfo(it).name} ?`,
      message: `Tu récupères ${it.dismantleValue} fragments, mais l’objet disparaît.`,
      confirm: 'Démonter',
      danger: true,
    });
    if (!ok) return;
    this.selected.set(null);
    await this.s.dismantle(it);
  }
  async mergeItems(r: ItemRarity): Promise<void> {
    const three = this.s.mergeable(r).slice(0, 3);
    if (three.length < 3) return;
    const ok = await this.ui.confirm({
      title: `Fusionner 3 objets ${ITEM_LABEL[r]} ?`,
      message: 'Les trois objets disparaissent et donnent un objet de rareté supérieure.',
      confirm: 'Fusionner',
    });
    if (ok) await this.s.mergeItems(three.map((i) => i.id));
  }
}
