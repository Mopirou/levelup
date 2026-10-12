import { Injectable, computed, inject, signal } from '@angular/core';
import { GameService } from '../../core/game.service';
import type { ChestOpening, ChestRarity, DungeonEntry, DungeonRunResult, ItemView } from '../../core/api/types';
import { CARDS, CHEST_LABEL, SPELL_FLAVOR, cardInfo, gearOf, isBigSpell, itemInfo, spellInfo, type ItemRarity } from './adventure.model';

export interface RunReport { dungeonName: string; result: DungeonRunResult }

/** État de l'écran Aventure : lit et agit via GameService (qui affiche déjà le toast d'erreur), rafraîchit après chaque action. */
@Injectable({ providedIn: 'root' })
export class AdventureStore {
  private game = inject(GameService);

  readonly state = this.game.adventure;
  readonly dungeons = signal<DungeonEntry[]>([]);
  readonly busy = signal(false);
  readonly failed = signal(false);
  /** Dernier résultat d'ouverture de coffre / de run (affichés dans une feuille). */
  readonly opened = signal<ChestOpening | null>(null);
  readonly run = signal<RunReport | null>(null);
  /** Annonce vocale (lecteurs d'écran) du dernier résultat. */
  readonly announce = signal('');

  readonly items = computed(() => this.state()?.items ?? []);
  readonly equipped = computed(() => this.items().filter((i) => i.equipped));
  /** Équipement porté, pour l'anneau du portrait (glyphes et rareté) */
  readonly gear = computed(() => gearOf(this.equipped()));
  /** Progression des panoplies */
  readonly sets = computed(() => this.state()?.sets ?? []);
  /** Grimoire (V4) : capacités connues, emplacements, bonus actifs */
  readonly grimoire = computed(() => this.state()?.grimoire ?? null);
  readonly heroClass = computed(() => this.state()?.heroClass ?? '');
  readonly stock = computed(() => this.items().filter((i) => !i.equipped));
  readonly chestCounts = computed(() => this.state()?.chestCounts ?? { bois: 0, bronze: 0, argent: 0, or: 0, mythique: 0 });
  readonly opensLeft = computed(() => this.state()?.opens.remaining ?? 0);
  /** Boutique : coffres en vente contre des fragments */
  readonly shop = computed(() => this.state()?.shop ?? []);
  /** Collection : exemplaires possédés par carte, et nombre de cartes différentes */
  readonly cards = computed(() => new Map((this.state()?.collection.cards ?? []).map((c) => [c.cardId, c.copies])));
  readonly collected = computed(() => this.state()?.collection.progress.owned ?? 0);
  readonly cardTotal = CARDS.length;

  /** Exécute une action ; `null` si une autre est en cours ou si elle a échoué (toast déjà affiché). */
  private async call<T>(fn: () => Promise<T | null>): Promise<T | null> {
    if (this.busy()) return null;
    this.busy.set(true);
    try {
      return await fn();
    } catch {
      this.game.toast('Pas de connexion : réessaie dans un instant.', 'error');
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  async load(): Promise<void> {
    try {
      const [s, d] = await Promise.all([this.game.loadAdventure(), this.game.loadDungeons()]);
      if (d) this.dungeons.set(d.dungeons);
      this.failed.set(!s && !this.state());
    } catch {
      this.failed.set(!this.state());
    }
  }

  async claim(): Promise<void> {
    const c = await this.call(() => this.game.claimExpedition());
    if (!c) return;
    this.game.toast(`Expédition : +${c.gold} or, +${c.fragments} fragments${c.keyGained ? ', et une Clé de donjon !' : '.'}`, 'success');
    this.announce.set(`Expédition réclamée : ${c.gold} or, ${c.fragments} fragments${c.keyGained ? ', une Clé' : ''}.`);
    await this.load();
  }

  async open(rarity: ChestRarity): Promise<void> {
    const chest = (this.state()?.chests ?? []).find((c) => c.rarity === rarity);
    if (!chest) return;
    const o = await this.call(() => this.game.openChest(chest.id));
    if (!o) return;
    this.opened.set(o);
    if (o.spell) {
      const sp = o.spell;
      const name = spellInfo(sp.spell.id).name;
      const big = isBigSpell(sp.spell.rarity);
      this.announce.set(`Coffre ${rarity} ouvert : ${big ? 'capacité exceptionnelle, ' : 'capacité, '}${name}, ${sp.isNew ? 'nouvelle' : sp.fragments ? 'déjà au niveau maximal' : 'niveau ' + sp.spell.level}. ${big ? SPELL_FLAVOR[sp.spell.rarity] ?? '' : ''}`);
    } else if (o.card) {
      const c = cardInfo(o.card.cardId);
      this.announce.set(`Coffre ${rarity} ouvert : carte ${c.name}, ${o.card.isNew ? 'nouvelle' : 'doublon, exemplaire ' + o.card.copies}.`);
    } else if (o.item) {
      this.announce.set(`Coffre ${rarity} ouvert : ${itemInfo(o.item).name}, ${o.item.rarity}.`);
    }
    await this.load();
  }

  async buy(rarity: ChestRarity): Promise<void> {
    const b = await this.call(() => this.game.buyChest(rarity));
    if (!b) return;
    this.game.toast(`Coffre ${CHEST_LABEL[rarity].toLowerCase()} acheté pour ${b.price} fragments.`, 'success');
    this.announce.set(`Coffre ${CHEST_LABEL[rarity]} acheté : ${b.price} fragments dépensés.`);
    await this.load();
  }

  async equipSpell(spellId: string, slot?: number): Promise<void> {
    if (await this.call(() => this.game.equipSpell(spellId, slot))) {
      this.announce.set(`${spellInfo(spellId).name} équipé dans le Grimoire.`);
      await this.load();
    }
  }
  async unequipSpell(spellId: string, slot: number): Promise<void> {
    if (await this.call(() => this.game.unequipSpell(slot))) {
      this.announce.set(`${spellInfo(spellId).name} retiré du Grimoire.`);
      await this.load();
    }
  }

  async mergeChests(rarity: ChestRarity): Promise<void> {
    const c = await this.call(() => this.game.mergeChests(rarity));
    if (!c) return;
    this.game.toast(`Trois coffres fusionnés en un coffre ${c.rarity}.`, 'success');
    await this.load();
  }

  async equip(item: ItemView): Promise<void> {
    if (await this.call(() => this.game.equipItem(item.id))) await this.load();
  }
  async unequip(item: ItemView): Promise<void> {
    if (await this.call(() => this.game.unequipSlot(item.slot))) await this.load();
  }
  async upgrade(item: ItemView): Promise<void> {
    if (await this.call(() => this.game.upgradeItem(item.id))) {
      this.game.toast(`${itemInfo(item).name} passe au niveau ${item.level + 1}.`, 'success');
      await this.load();
    }
  }
  async dismantle(item: ItemView): Promise<void> {
    const fragments = await this.call(() => this.game.dismantleItem(item.id));
    if (fragments === null) return;
    this.game.toast(`${itemInfo(item).name} démonté : +${fragments} fragments.`, 'info');
    await this.load();
  }
  async mergeItems(ids: string[]): Promise<void> {
    const made = await this.call(() => this.game.mergeItems(ids));
    if (!made) return;
    this.game.toast(`Forge : ${itemInfo(made).name} !`, 'success');
    await this.load();
  }

  async runDungeon(e: DungeonEntry): Promise<void> {
    const r = await this.call(() => this.game.runDungeon(e.dungeon.id));
    if (!r) return;
    this.run.set({ dungeonName: e.dungeon.name, result: r.result });
    this.announce.set(r.result.bossDefeated ? `${e.dungeon.name} : boss vaincu.` : `${e.dungeon.name} : salle ${r.result.reachedRoom} atteinte.`);
    await this.load();
  }

  /** Objets non équipés d'une rareté (la forge en exige trois, hors légendaire). */
  mergeable(rarity: ItemRarity): ItemView[] {
    return rarity === 'legendaire' ? [] : this.stock().filter((i) => i.rarity === rarity);
  }
}
