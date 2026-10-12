import { describe, expect, it } from 'vitest';
import {
  CARD_CHANCE,
  CARD_DEFS,
  CARD_DUPLICATE_FRAGMENTS,
  CARD_KINDS,
  CHEST_RARITIES,
  ITEMS,
  ITEM_RARITIES,
  MemoryStore,
  SHOP_OFFERS,
  SPELL_DEFS,
  SPELL_CHANCE,
  buyChest,
  cardDuplicateFragments,
  collectionProgress,
  createCharacter,
  drawChest,
  getAdventureState,
  openChest,
  pickCard,
  shopPrice,
  type Chest,
  type ChestRarity,
  type ServerContext,
} from '../src';
import { createRng } from '../src/random';

const U = 'user-collection';
let counter = 0;

const heroInput = {
  name: 'Aldric',
  classId: 'guerrier',
  scores: { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 },
  portraitId: 'p1',
  frameColor: '#2f5a47',
  timezone: 'Europe/Paris',
};

async function hero() {
  const store = new MemoryStore([]);
  let nowMs = Date.parse('2026-10-05T09:00:00+02:00');
  const ctx: ServerContext = { store, now: () => nowMs, uuid: () => `col-${++counter}` };
  expect((await createCharacter(ctx, U, heroInput)).ok).toBe(true);
  return { store, ctx, advanceDay: () => (nowMs += 86_400_000) };
}

const giveFragments = async (store: MemoryStore, n: number) => {
  const c = (await store.getCharacter(U))!;
  await store.saveCharacter(U, { ...c, fragments: n });
};

describe('contenu de la collection', () => {
  it('60 cartes distinctes : 16 / 14 / 12 / 10 / 8 par rareté, créatures et objets magiques', () => {
    expect(CARD_DEFS).toHaveLength(60);
    expect(new Set(CARD_DEFS.map((c) => c.id)).size).toBe(60);
    const count = (r: string) => CARD_DEFS.filter((c) => c.rarity === r).length;
    expect(ITEM_RARITIES.map(count)).toEqual([16, 14, 12, 10, 8]);
    for (const k of CARD_KINDS) expect(CARD_DEFS.filter((c) => c.kind === k).length).toBeGreaterThanOrEqual(20);
  });

  it('chaque carte a un nom, un glyphe et une description', () => {
    for (const c of CARD_DEFS) {
      expect(c.name.trim(), c.id).not.toBe('');
      expect(c.glyph.trim(), c.id).not.toBe('');
      expect(c.blurb.trim().length, c.id).toBeGreaterThan(10);
    }
  });

  it('contient les grands classiques', () => {
    const ids = new Set(CARD_DEFS.map((c) => c.id));
    for (const id of ['mimique', 'tyrannoeil', 'tarasque', 'sac-sans-fond', 'jeu-du-destin']) expect(ids.has(id), id).toBe(true);
  });
});

describe('boutique : prix', () => {
  it('trois coffres en vente (bois, bronze, argent), prix croissants, jamais or ni mythique', () => {
    expect(SHOP_OFFERS.map((o) => o.rarity)).toEqual(['bois', 'bronze', 'argent']);
    expect(SHOP_OFFERS.map((o) => o.price)).toEqual([...SHOP_OFFERS.map((o) => o.price)].sort((a, b) => a - b));
    expect(shopPrice('bois')).toBe(25);
    expect(shopPrice('or')).toBeNull();
    expect(shopPrice('mythique')).toBeNull();
  });

  it('acheter ne coûte jamais moins cher que fusionner : 3 coffres coûtent au moins le prix du rang suivant', () => {
    for (let i = 0; i < SHOP_OFFERS.length - 1; i++) expect(SHOP_OFFERS[i].price * 3).toBeGreaterThanOrEqual(SHOP_OFFERS[i + 1].price);
  });
});

describe('pickCard et avancement', () => {
  const pool = CARD_DEFS.filter((c) => c.rarity === 'commun');

  it('ne tire rien d’un lot vide, et reste déterministe pour une graine', () => {
    expect(pickCard([], createRng('x'))).toBeNull();
    expect(pickCard(pool, createRng('a'))?.id).toBe(pickCard(pool, createRng('a'))?.id);
  });

  it('favorise les cartes inconnues une fois sur deux, sans jamais en exclure les autres', () => {
    const owned = new Set(pool.slice(0, pool.length - 1).map((c) => c.id));
    const last = pool[pool.length - 1].id;
    let fresh = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = pickCard(pool, createRng(`bias-${i}`), owned)!;
      seen.add(c.id);
      if (c.id === last) fresh++;
    }
    expect(fresh / 2000).toBeGreaterThan(0.45);
    expect(fresh / 2000).toBeLessThan(0.6);
    expect(seen.size).toBeGreaterThan(pool.length / 2);
  });

  it('sans carte inconnue, tire dans tout le lot', () => {
    const all = new Set(pool.map((c) => c.id));
    expect(pickCard(pool, createRng('z'), all)).not.toBeNull();
  });

  it('avancement par rareté et par type', () => {
    expect(collectionProgress(CARD_DEFS, [])).toMatchObject({ owned: 0, total: 60 });
    const p = collectionProgress(CARD_DEFS, [{ cardId: 'mimique' }, { cardId: 'gobelin' }, { cardId: 'inconnue' }]);
    expect(p.owned).toBe(2);
    expect(p.byRarity.rare).toEqual({ owned: 1, total: 12 });
    expect(p.byRarity.commun).toEqual({ owned: 1, total: 16 });
    expect(p.byKind.bestiaire.owned).toBe(2);
    expect(p.byKind.relique.owned).toBe(0);
  });

  it('un doublon rend des fragments croissants avec la rareté, sous la valeur du démontage', () => {
    const values = ITEM_RARITIES.map(cardDuplicateFragments);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(values[0]).toBeGreaterThan(0);
    expect(CARD_DUPLICATE_FRAGMENTS.legendaire).toBe(50);
  });
});

describe('tirage de coffre avec la collection', () => {
  const draw = (chest: ChestRarity, seed: string, withCards = true, owned?: Set<string>) =>
    drawChest({ chest, sag: 0, pity: {}, seed, templates: ITEMS, spells: SPELL_DEFS, cards: withCards ? CARD_DEFS : undefined, ownedCards: owned });

  it('sans cartes en entrée, jamais de carte (le tirage reste celui d’avant)', () => {
    for (let i = 0; i < 300; i++) expect(draw('bois', `n${i}`, false).card).toBeNull();
  });

  it('une carte exclut l’objet et la capacité, et sa rareté est celle du tirage', () => {
    for (const chest of CHEST_RARITIES) {
      for (let i = 0; i < 300; i++) {
        const d = draw(chest, `${chest}-${i}`);
        if (d.card) {
          expect(d.template).toBeNull();
          expect(d.spell).toBeNull();
          expect(d.card.rarity).toBe(d.rarity);
        } else {
          expect(d.template !== null || d.spell !== null).toBe(true);
        }
      }
    }
  });

  it('la part de cartes suit CARD_CHANCE de chaque coffre', () => {
    for (const chest of CHEST_RARITIES) {
      let cards = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) if (draw(chest, `p-${chest}-${i}`).card) cards++;
      const pct = (cards / n) * 100;
      expect(Math.abs(pct - CARD_CHANCE[chest]), `${chest} : ${pct.toFixed(1)} %`).toBeLessThan(2.5);
    }
  });

  it('les cartes ne mordent pas sur les capacités', () => {
    for (const chest of CHEST_RARITIES) {
      let spells = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) if (draw(chest, `s-${chest}-${i}`).spell) spells++;
      expect(Math.abs((spells / n) * 100 - SPELL_CHANCE[chest]), chest).toBeLessThan(3);
    }
  });
});

describe('ouverture de coffre : cartes et doublons', () => {
  it('ouvre des coffres jusqu’à obtenir une carte : nouvelle, puis doublon avec des fragments', async () => {
    const { store, ctx, advanceDay } = await hero();
    let first: ReturnType<typeof gain> | null = null;
    const gain = (r: Awaited<ReturnType<typeof openChest>>) => (r.ok ? r.opening : null);
    // Les coffres de bois sont donnés un par jour, deux ouvertures par jour au maximum : on en fabrique.
    let day = 0;
    while (day < 80) {
      day++;
      advanceDay();
      for (let k = 0; k < 2; k++) {
        const chest: Chest = { id: ctx.uuid(), rarity: 'bois', source: 'daily', sourceKey: `t-${day}-${k}`, createdAt: new Date().toISOString(), openedAt: null };
        await store.insertChest(U, chest);
        const o = gain(await openChest(ctx, U, { chestId: chest.id }));
        expect(o).not.toBeNull();
        if (!o!.card) continue;
        const cards = await store.listCards(U);
        const owned = cards.find((c) => c.cardId === o!.card!.cardId)!;
        expect(owned.copies).toBe(o!.card!.copies);
        if (!first) {
          first = o;
          expect(o!.card!.isNew).toBe(true);
          expect(o!.card!.copies).toBe(1);
          expect(o!.card!.fragments).toBe(0);
          expect(o!.item).toBeNull();
          expect(o!.spell).toBeNull();
        } else if (!o!.card!.isNew) {
          expect(o!.card!.copies).toBeGreaterThan(1);
          expect(o!.card!.fragments).toBe(cardDuplicateFragments(o!.card!.rarity));
          expect(o!.fragments).toBeGreaterThanOrEqual(o!.card!.fragments);
          return;
        }
      }
    }
    throw new Error('aucun doublon obtenu en 160 coffres de bois');
  });

  it('l’état d’aventure expose la boutique et la collection', async () => {
    const { ctx, store } = await hero();
    await store.saveCard(U, { cardId: 'mimique', copies: 2 });
    const r = await getAdventureState(ctx, U);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.shop.map((o) => o.rarity)).toEqual(['bois', 'bronze', 'argent']);
    expect(r.state.collection.cards).toEqual([{ cardId: 'mimique', copies: 2 }]);
    expect(r.state.collection.progress).toMatchObject({ owned: 1, total: 60 });
  });
});

describe('boutique : achat de coffres', () => {
  it('achète un coffre contre des fragments, sans toucher à l’or ni au plafond d’ouverture', async () => {
    const { ctx, store } = await hero();
    await giveFragments(store, 100);
    const before = (await store.getCharacter(U))!;
    const r = await buyChest(ctx, U, { rarity: 'bronze' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.price).toBe(75);
    expect(r.chest).toMatchObject({ rarity: 'bronze', source: 'shop', openedAt: null });
    expect(r.character.fragments).toBe(25);
    expect((await store.getCharacter(U))!.fragments).toBe(25);
    expect((await store.getCharacter(U))!.gold).toBe(before.gold);
    expect((await store.listChests(U, { opened: false })).map((c) => c.rarity)).toContain('bronze');
  });

  it('refuse sans assez de fragments, sans rien retirer ni créer', async () => {
    const { ctx, store } = await hero();
    await giveFragments(store, 24);
    const r = await buyChest(ctx, U, { rarity: 'bois' });
    expect(r).toMatchObject({ ok: false, error: 'insufficient' });
    expect((await store.getCharacter(U))!.fragments).toBe(24);
    expect((await store.listChests(U)).filter((c) => c.source === 'shop')).toHaveLength(0);
  });

  it('refuse les coffres hors boutique (or, mythique, inconnu) même avec beaucoup de fragments', async () => {
    const { ctx, store } = await hero();
    await giveFragments(store, 100_000);
    for (const rarity of ['or', 'mythique', 'diamant'] as ChestRarity[]) {
      expect(await buyChest(ctx, U, { rarity })).toMatchObject({ ok: false, error: 'invalid' });
    }
    expect((await store.getCharacter(U))!.fragments).toBe(100_000);
  });

  it('plusieurs achats de suite donnent autant de coffres distincts', async () => {
    const { ctx, store } = await hero();
    await giveFragments(store, 100);
    for (let i = 0; i < 4; i++) expect((await buyChest(ctx, U, { rarity: 'bois' })).ok).toBe(true);
    expect((await store.getCharacter(U))!.fragments).toBe(0);
    expect(await buyChest(ctx, U, { rarity: 'bois' })).toMatchObject({ ok: false, error: 'insufficient' });
    const shop = (await store.listChests(U)).filter((c) => c.source === 'shop');
    expect(shop).toHaveLength(4);
    expect(new Set(shop.map((c) => c.id)).size).toBe(4);
  });

  it('personnage inexistant', async () => {
    const { ctx } = await hero();
    expect(await buyChest(ctx, 'fantome', { rarity: 'bois' })).toMatchObject({ ok: false, error: 'no-character' });
  });
});
