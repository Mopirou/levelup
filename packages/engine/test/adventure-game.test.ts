import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHEST_OPENS_PER_DAY,
  DUNGEONS,
  ITEMS,
  MAX_KEYS,
  MemoryStore,
  claimExpedition,
  completeQuestAction,
  createCharacter,
  dismantleItem,
  ensureQuests,
  equipItem,
  getAdventureState,
  grantQuestChests,
  listDungeons,
  mergeChests,
  mergeItems,
  openChest,
  revokeQuestChests,
  runDungeon,
  startTrack,
  undoQuest,
  unequipSlot,
  upgradeItem,
  type Chest,
  type ChestRarity,
  type InventoryItem,
  type ItemRarity,
  type QuestInstance,
  type QuestTemplate,
  type ServerContext,
} from '../src';
import { TEST_RUNG_TEMPLATES } from './track-fixtures';

const catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'quests.fr.json'), 'utf8')).map(
  (q: QuestTemplate) => ({ ...q, source: 'catalog' }),
) as QuestTemplate[];

const U = 'user-adv';
let counter = 0;
const at = (day: number, hour = 9) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+02:00`;
const date = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;

const heroInput = {
  name: 'Aldric',
  classId: 'guerrier',
  scores: { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 },
  portraitId: 'p1',
  frameColor: '#2f5a47',
  timezone: 'Europe/Paris',
};

function setup() {
  const store = new MemoryStore([...catalog, ...TEST_RUNG_TEMPLATES]);
  let nowMs = Date.parse(at(5));
  const ctx: ServerContext = { store, now: () => nowMs, uuid: () => `adv-${++counter}` };
  return { store, ctx, setNow: (iso: string) => (nowMs = Date.parse(iso)), advanceHours: (h: number) => (nowMs += h * 3_600_000) };
}
type S = ReturnType<typeof setup>;

async function hero() {
  const s = setup();
  expect((await createCharacter(s.ctx, U, heroInput)).ok).toBe(true);
  return s;
}

const finish = (s: S, q: QuestInstance) => {
  const v = q.snapshot.validation;
  return completeQuestAction(s.ctx, U, {
    instanceId: q.id,
    useInspiration: false,
    progress: v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : undefined,
    stepsDone: v.type === 'steps' ? v.steps.map(() => true) : undefined,
    journalText: v.type === 'journal' ? 'x'.repeat(60) : undefined,
  });
};

/** Une journée de jeu : on ouvre l'appli ce jour-là, puis on valide la quête du parcours. */
async function playDay(s: S, day: number, trackId: string) {
  s.setNow(at(day));
  await ensureQuests(s.ctx, U);
  const q = (await s.store.listInstances(U, { period: 'daily' })).find((x) => x.trackId === trackId && x.periodStart === date(day))!;
  expect(q).toBeDefined();
  const r = await finish(s, q);
  expect(r.ok).toBe(true);
  return { q, data: r.ok ? r.data : null! };
}

let chestN = 0;
const chestOf = (rarity: ChestRarity, source: Chest['source'] = 'quest', key = `k${++chestN}`): Chest => ({
  id: `c-${++counter}`, rarity, source, sourceKey: key, instanceId: null, createdAt: '2026-10-01T00:00:00Z', openedAt: null,
});
const give = async (s: S, ...rarities: ChestRarity[]) => {
  const out: Chest[] = [];
  for (const r of rarities) {
    const c = chestOf(r);
    await s.store.insertChest(U, c);
    out.push(c);
  }
  return out;
};
const itemOf = (rarity: ItemRarity, slot: InventoryItem['slot'] = 'arme', over: Partial<InventoryItem> = {}): InventoryItem => {
  const t = ITEMS.find((x) => x.slot === slot)!;
  return { id: `it-${++counter}`, templateId: t.id, rarity, slot, ability: t.ability, level: 0, equipped: false, createdAt: '2026-10-01T00:00:00Z', ...over };
};
const giveItems = async (s: S, ...items: InventoryItem[]) => {
  await s.store.insertItems(U, items);
  return items;
};
const patchChar = async (s: S, patch: Record<string, unknown>) => s.store.saveCharacter(U, { ...(await s.store.getCharacter(U))!, ...patch } as never);

describe('personnage et état de l’aventure', () => {
  it('un nouveau personnage a l’expédition en cours, et aucune ressource', async () => {
    const s = await hero();
    const c = (await s.store.getCharacter(U))!;
    expect(c).toMatchObject({ gold: 0, fragments: 0, keys: 0, chestPity: {}, chestOpensDate: null, chestOpensToday: 0 });
    expect(c.expeditionStartedAt).toBe(new Date(Date.parse(at(5))).toISOString());
  });

  it('adventure-state : PP, ressources, expédition, plafond d’ouverture', async () => {
    const s = await hero();
    s.advanceHours(5);
    const r = await getAdventureState(s.ctx, U);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const st = r.state;
    expect(st.power).toBe(st.powerBreakdown.level + st.powerBreakdown.scores + st.powerBreakdown.items + st.powerBreakdown.sets);
    expect(st.powerBreakdown.level).toBe(10);
    expect(st).toMatchObject({ gold: 0, fragments: 0, keys: 0, maxKeys: MAX_KEYS, items: [], opens: { today: 0, max: CHEST_OPENS_PER_DAY, remaining: 2 } });
    // Coffre de bois offert chaque jour, sans aucune quête validée
    expect(st.chests).toHaveLength(1);
    expect(st.chests[0]).toMatchObject({ rarity: 'bois', source: 'daily', sourceKey: date(5) });
    expect(st.chestCounts).toEqual({ bois: 1, bronze: 0, argent: 0, or: 0, mythique: 0 });
    expect(st.expedition).toMatchObject({ hours: 5, capped: false, capHours: 24, claimable: true });
    expect(st.expedition.gold).toBeGreaterThan(0);
    expect(st.today).toBe(date(5));
  });

  it('coffre quotidien offert : un seul par jour de jeu, un nouveau le lendemain', async () => {
    const s = await hero();
    await getAdventureState(s.ctx, U);
    const again = await getAdventureState(s.ctx, U);
    expect(again.ok && again.state.chests.filter((c) => c.source === 'daily')).toHaveLength(1);
    s.advanceHours(24);
    const next = await getAdventureState(s.ctx, U);
    expect(next.ok && next.state.chests.filter((c) => c.source === 'daily')).toHaveLength(2);
  });

  it('sans personnage : no-character partout', async () => {
    const s = setup();
    for (const r of [
      await getAdventureState(s.ctx, 'x'),
      await claimExpedition(s.ctx, 'x'),
      await openChest(s.ctx, 'x', { chestId: 'a' }),
      await mergeChests(s.ctx, 'x', { rarity: 'bois' }),
      await equipItem(s.ctx, 'x', { itemId: 'a' }),
      await unequipSlot(s.ctx, 'x', { slot: 'arme' }),
      await upgradeItem(s.ctx, 'x', { itemId: 'a' }),
      await mergeItems(s.ctx, 'x', { itemIds: ['a', 'b', 'c'] }),
      await dismantleItem(s.ctx, 'x', { itemId: 'a' }),
      await listDungeons(s.ctx, 'x'),
      await runDungeon(s.ctx, 'x', { dungeonId: 'dj-yoga' }),
    ]) {
      expect(r).toMatchObject({ ok: false, error: 'no-character' });
    }
  });

  it('un personnage ancien (sans expédition) la démarre à la première lecture', async () => {
    const s = await hero();
    await patchChar(s, { expeditionStartedAt: null });
    s.advanceHours(2);
    const r = await getAdventureState(s.ctx, U);
    expect(r.ok && r.state.expedition.hours).toBe(0);
    expect((await s.store.getCharacter(U))!.expeditionStartedAt).toBe(new Date(Date.parse(at(5)) + 2 * 3_600_000).toISOString());
  });
});

describe('expédition', () => {
  it('refuse une réclamation immédiate', async () => {
    const s = await hero();
    expect(await claimExpedition(s.ctx, U)).toMatchObject({ ok: false, error: 'nothing-pending' });
  });

  it('réclame or et fragments, puis le compteur repart de maintenant', async () => {
    const s = await hero();
    s.advanceHours(10);
    const state = await getAdventureState(s.ctx, U);
    const r = await claimExpedition(s.ctx, U);
    expect(r.ok).toBe(true);
    if (!r.ok || !state.ok) return;
    expect(r.claim).toMatchObject({ gold: state.state.expedition.gold, fragments: state.state.expedition.fragments, hours: 10, capped: false });
    expect(r.claim.gold).toBeGreaterThan(0);
    const c = (await s.store.getCharacter(U))!;
    expect(c.gold).toBe(r.claim.gold);
    expect(c.fragments).toBe(r.claim.fragments);
    expect(c.expeditionStartedAt).toBe(new Date(Date.parse(at(5)) + 10 * 3_600_000).toISOString());
    expect(await claimExpedition(s.ctx, U)).toMatchObject({ ok: false, error: 'nothing-pending' });
  });

  it('plafonne à 24 h', async () => {
    const a = await hero();
    a.advanceHours(24);
    const b = await hero();
    b.advanceHours(24 * 20);
    const ra = await claimExpedition(a.ctx, U);
    const rb = await claimExpedition(b.ctx, U);
    expect(ra.ok && rb.ok).toBe(true);
    if (ra.ok && rb.ok) {
      expect(rb.claim).toMatchObject({ hours: 24, capped: true });
      expect(rb.claim.gold).toBe(ra.claim.gold);
    }
  });

  it('peut donner une Clé (environ 5 % par réclamation de 24 h), jamais au-delà de 3', async () => {
    const s = await hero();
    let gained = 0;
    for (let i = 0; i < 300; i++) {
      s.setNow(at(5, 9));
      await patchChar(s, { keys: 0, expeditionStartedAt: new Date(Date.parse(at(5)) - (25 + i) * 3_600_000).toISOString() });
      const r = await claimExpedition(s.ctx, U);
      if (r.ok && r.claim.keyGained) {
        gained++;
        expect(r.character.keys).toBe(1);
      } else if (r.ok) expect(r.character.keys).toBe(0);
    }
    expect(gained).toBeGreaterThan(3);
    expect(gained).toBeLessThan(40);
    // stock plein : pas de Clé de plus
    await patchChar(s, { keys: MAX_KEYS, expeditionStartedAt: new Date(Date.parse(at(5)) - 30 * 3_600_000).toISOString() });
    const full = await claimExpedition(s.ctx, U);
    expect(full.ok && full.claim.keyGained).toBe(false);
    expect((await s.store.getCharacter(U))!.keys).toBe(MAX_KEYS);
  });
});

describe('coffres de quête', () => {
  it('la 1re quête de parcours du jour donne un coffre de bois, une seule fois par jour', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    await startTrack(s.ctx, U, { trackId: 'course-fond' });
    const a = await playDay(s, 5, 'muscu-haut');
    expect(a.data.chests).toHaveLength(1);
    expect(a.data.chests![0]).toMatchObject({ rarity: 'bois', source: 'quest', sourceKey: date(5), instanceId: a.q.id });
    expect(a.data.keysGained).toBe(0);
    // la 2e quête du jour ne redonne rien
    const second = (await s.store.listInstances(U, { period: 'daily' })).find((x) => x.trackId === 'course-fond' && x.periodStart === date(5))!;
    const b = await finish(s, second);
    expect(b.ok && b.data.chests).toBeUndefined();
    expect(await s.store.listChests(U)).toHaveLength(1);
    // revalider une quête déjà faite (doublon) : rien de plus
    const dup = await finish(s, a.q);
    expect(dup.ok && dup.data.duplicate).toBe(true);
    expect(await s.store.listChests(U)).toHaveLength(1);
  });

  it('une quête hors parcours ne donne pas de coffre quotidien', async () => {
    const s = await hero();
    const free = (await s.store.listInstances(U, { period: 'daily' })).find((q) => q.free)!;
    await s.ctx.store.updateInstance(U, free.id, { status: 'accepted' });
    const r = await finish(s, { ...free, status: 'accepted' });
    expect(r.ok).toBe(true);
    expect(await s.store.listChests(U)).toHaveLength(0);
  });

  it('annuler la quête retire son coffre (non ouvert) ; la refaire le redonne', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const { q } = await playDay(s, 5, 'muscu-haut');
    expect(await s.store.listChests(U)).toHaveLength(1);
    const u = await undoQuest(s.ctx, U, q.id);
    expect(u.ok).toBe(true);
    expect(await s.store.listChests(U)).toHaveLength(0);
    const again = await finish(s, (await s.store.getInstance(U, q.id))!);
    expect(again.ok && again.data.chests).toHaveLength(1);
  });

  it('annuler une quête dont le coffre est ouvert le garde, et ne le redonne pas', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const { q } = await playDay(s, 5, 'muscu-haut');
    const [chest] = await s.store.listChests(U);
    expect((await openChest(s.ctx, U, { chestId: chest.id })).ok).toBe(true);
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);
    expect(await s.store.listChests(U)).toHaveLength(1);
    const again = await finish(s, (await s.store.getInstance(U, q.id))!);
    expect(again.ok && again.data.chests).toBeUndefined();
    expect(await s.store.listChests(U)).toHaveLength(1);
  });

  it('promotion d’échelon : coffre de bronze + 1 Clé ; jalon de série de 7 jours : coffre d’argent + 1 Clé ; annulation propre', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    for (let d = 5; d <= 8; d++) {
      const r = await playDay(s, d, 'muscu-haut');
      expect(r.data.chests?.map((c) => c.source) ?? []).toEqual(['quest']);
    }
    const promo = await playDay(s, 9, 'muscu-haut');
    expect(promo.data.trackPromoted).toBe(true);
    expect(promo.data.chests!.map((c) => [c.source, c.rarity, c.sourceKey])).toEqual([
      ['quest', 'bois', date(9)],
      ['rung', 'bronze', 'muscu-haut:2'],
    ]);
    expect(promo.data.keysGained).toBe(1);
    expect((await s.store.getCharacter(U))!.keys).toBe(1);
    await playDay(s, 10, 'muscu-haut');
    const seven = await playDay(s, 11, 'muscu-haut');
    // 7 jours de série : le coffre du jour passe en bronze, le jalon donne un coffre d'argent et une Clé
    expect(seven.data.streak).toBe(7);
    expect(seven.data.chests!.map((c) => [c.source, c.rarity])).toEqual([
      ['quest', 'bronze'],
      ['streak', 'argent'],
    ]);
    expect(seven.data.keysGained).toBe(1);
    expect((await s.store.getCharacter(U))!.keys).toBe(2);
    // annulation du jour 7 : coffres et Clé retirés
    expect((await undoQuest(s.ctx, U, seven.q.id)).ok).toBe(true);
    expect((await s.store.getCharacter(U))!.keys).toBe(1);
    expect((await s.store.listChests(U)).map((c) => c.source).sort()).toEqual(['quest', 'quest', 'quest', 'quest', 'quest', 'quest', 'rung']);
    // et les refaire les redonne une seule fois
    const redo = await finish(s, (await s.store.getInstance(U, seven.q.id))!);
    expect(redo.ok && redo.data.chests).toHaveLength(2);
    expect((await s.store.getCharacter(U))!.keys).toBe(2);
  });

  it('le stock de Clés est plafonné', async () => {
    const s = await hero();
    await patchChar(s, { keys: MAX_KEYS });
    const base = {
      store: s.store as never, userId: U, uuid: () => `g-${++counter}`, nowIso: '2026-10-05T00:00:00Z', instanceId: 'i', completedDay: date(5),
      isTrackQuest: true, isDaily: true, streak: 7, prevStreak: 6, promotion: { trackId: 't', rung: 3 }, character: (await s.store.getCharacter(U))!,
    };
    const r = await grantQuestChests(base);
    expect(r.chests.map((c) => c.source)).toEqual(['quest', 'rung', 'streak']);
    expect(r.character.keys).toBe(MAX_KEYS);
    expect(r.keysGained).toBe(0);
    // idempotent : rien de nouveau
    const again = await grantQuestChests({ ...base, character: r.character });
    expect(again.chests).toEqual([]);
    expect(await revokeQuestChests(s.store as never, U, 'inconnue')).toEqual({ removed: 0, keysLost: 0 });
    expect(await revokeQuestChests(s.store as never, U, 'i')).toEqual({ removed: 3, keysLost: 2 });
  });
});

describe('ouverture des coffres', () => {
  it('donne un objet, des fragments et de l’or ; 2 ouvertures par jour de jeu, puis plafond', async () => {
    const s = await hero();
    const [a, b, c] = await give(s, 'bois', 'bronze', 'argent');
    const r1 = await openChest(s.ctx, U, { chestId: a.id });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.opening).toMatchObject({ gold: 50, fragments: 5, opensToday: 1 });
    expect(r1.opening.item).toMatchObject({ equipped: false, level: 0 });
    expect(ITEMS.some((t) => t.id === r1.opening.item!.templateId)).toBe(true);
    expect(r1.opening.chest.openedAt).not.toBeNull();
    expect(r1.character).toMatchObject({ gold: 50, fragments: 5, chestOpensDate: date(5), chestOpensToday: 1 });
    expect((await s.store.listItems(U))).toHaveLength(1);
    expect((await openChest(s.ctx, U, { chestId: b.id })).ok).toBe(true);
    expect(await openChest(s.ctx, U, { chestId: c.id })).toMatchObject({ ok: false, error: 'daily-cap' });
    expect((await s.store.listChests(U, { opened: false })).map((x) => x.id)).toEqual([c.id]);
    // le lendemain (après la réinitialisation de 4 h), le plafond repart de zéro
    s.setNow(at(6));
    const r3 = await openChest(s.ctx, U, { chestId: c.id });
    expect(r3.ok && r3.opening.opensToday).toBe(1);
    expect((await getAdventureState(s.ctx, U)).ok).toBe(true);
  });

  it('avant l’heure de réinitialisation, on est encore le jour précédent', async () => {
    const s = await hero();
    const chests = await give(s, 'bois', 'bois', 'bois');
    s.setNow(at(6, 3));
    await openChest(s.ctx, U, { chestId: chests[0].id });
    await openChest(s.ctx, U, { chestId: chests[1].id });
    // 3 h du matin le 6 = encore le jour de jeu du 5 : plafond atteint, y compris à 3 h 59
    s.setNow(at(6, 3));
    expect(await openChest(s.ctx, U, { chestId: chests[2].id })).toMatchObject({ ok: false, error: 'daily-cap' });
    s.setNow(at(6, 5));
    expect((await openChest(s.ctx, U, { chestId: chests[2].id })).ok).toBe(true);
  });

  it('un coffre ne s’ouvre qu’une fois, un inconnu est introuvable', async () => {
    const s = await hero();
    const [a] = await give(s, 'bois');
    expect((await openChest(s.ctx, U, { chestId: a.id })).ok).toBe(true);
    expect(await openChest(s.ctx, U, { chestId: a.id })).toMatchObject({ ok: false, error: 'not-found' });
    expect(await openChest(s.ctx, U, { chestId: 'fantome' })).toMatchObject({ ok: false, error: 'not-found' });
    expect(await s.store.listItems(U)).toHaveLength(1);
    // course entre deux ouvertures : le second appel perd l'ouverture atomique
    const [b] = await give(s, 'bois');
    const real = s.store.markChestOpened.bind(s.store);
    s.store.markChestOpened = async () => false;
    expect(await openChest(s.ctx, U, { chestId: b.id })).toMatchObject({ ok: false, error: 'not-found' });
    s.store.markChestOpened = real;
    expect(await s.store.listItems(U)).toHaveLength(1);
  });

  it('est déterministe (graine = profil + nombre d’ouvertures) et suit la pitié', async () => {
    const run = async () => {
      const s = await hero();
      const [a] = await give(s, 'argent');
      const r = await openChest(s.ctx, U, { chestId: a.id });
      return r.ok ? [r.opening.item?.templateId ?? r.opening.spell?.spell.id, r.opening.item?.rarity ?? r.opening.spell?.spell.rarity] : null;
    };
    expect(await run()).toEqual(await run());
    const s = await hero();
    await patchChar(s, { chestPity: { bronze: 8 } });
    const [a] = await give(s, 'bronze');
    const r = await openChest(s.ctx, U, { chestId: a.id });
    expect(r.ok && ['epique', 'legendaire']).toBeTruthy();
    if (r.ok) {
      // la pitié garantit la rareté, que le coffre donne un objet ou une capacité
      const rarity = r.opening.item?.rarity ?? r.opening.spell!.spell.rarity;
      expect(['epique', 'legendaire']).toContain(rarity);
      expect(r.opening.guaranteed).toBe(rarity === 'epique' ? 'epique' : null);
      expect(r.character.chestPity.bronze).toBe(0);
    }
  });
});

describe('fusion de coffres', () => {
  it('3 coffres de même rareté donnent 1 coffre supérieur ; les autres restent', async () => {
    const s = await hero();
    await give(s, 'bois', 'bois', 'bois', 'bois', 'bronze');
    const r = await mergeChests(s.ctx, U, { rarity: 'bois' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chest).toMatchObject({ rarity: 'bronze', source: 'merge', openedAt: null });
    const closed = await s.store.listChests(U, { opened: false });
    expect(closed.map((c) => c.rarity).sort()).toEqual(['bois', 'bronze', 'bronze']);
    // la fusion ne compte pas dans le plafond d'ouverture
    expect((await getAdventureState(s.ctx, U)).ok && (await getAdventureState(s.ctx, U)).ok).toBe(true);
    expect((await s.store.getCharacter(U))!.chestOpensToday).toBe(0);
  });

  it('refuse sans assez de coffres, pour une rareté inconnue ou mythique', async () => {
    const s = await hero();
    await give(s, 'or', 'or', 'mythique', 'mythique', 'mythique');
    expect(await mergeChests(s.ctx, U, { rarity: 'or' })).toMatchObject({ ok: false, error: 'insufficient' });
    expect(await mergeChests(s.ctx, U, { rarity: 'mythique' })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await mergeChests(s.ctx, U, { rarity: 'diamant' as ChestRarity })).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('un coffre fusionné garde sa clé : une quête annulée puis refaite ne redonne pas de coffre', async () => {
    const s = await hero();
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    const { q } = await playDay(s, 5, 'muscu-haut');
    await give(s, 'bois', 'bois');
    expect((await mergeChests(s.ctx, U, { rarity: 'bois' })).ok).toBe(true);
    expect((await undoQuest(s.ctx, U, q.id)).ok).toBe(true);
    const again = await finish(s, (await s.store.getInstance(U, q.id))!);
    expect(again.ok && again.data.chests).toBeUndefined();
  });
});

describe('équipement', () => {
  it('équipe, remplace, retire ; un seul objet par emplacement', async () => {
    const s = await hero();
    const [a, b, tete] = await giveItems(s, itemOf('rare'), itemOf('commun'), itemOf('rare', 'tete'));
    const r1 = await equipItem(s.ctx, U, { itemId: a.id });
    expect(r1).toMatchObject({ ok: true, replaced: null });
    expect(r1.ok && r1.item.equipped).toBe(true);
    // déjà équipé : sans effet
    expect(await equipItem(s.ctx, U, { itemId: a.id })).toMatchObject({ ok: true, replaced: null });
    const r2 = await equipItem(s.ctx, U, { itemId: b.id });
    expect(r2).toMatchObject({ ok: true, replaced: a.id });
    await equipItem(s.ctx, U, { itemId: tete.id });
    const items = await s.store.listItems(U);
    expect(items.filter((i) => i.equipped).map((i) => i.id).sort()).toEqual([b.id, tete.id].sort());
    const st = await getAdventureState(s.ctx, U);
    expect(st.ok && st.state.equipped).toEqual({ arme: b.id, tete: tete.id });
    expect(st.ok && st.state.powerBreakdown.items).toBe(6 + 34); // espadon et heaume : objets du Guerrier, +20 % de PP (affinité de classe)
    expect(await equipItem(s.ctx, U, { itemId: 'nope' })).toMatchObject({ ok: false, error: 'not-found' });
    const u = await unequipSlot(s.ctx, U, { slot: 'arme' });
    expect(u.ok && u.item.equipped).toBe(false);
    expect(await unequipSlot(s.ctx, U, { slot: 'arme' })).toMatchObject({ ok: false, error: 'not-found' });
    expect(await unequipSlot(s.ctx, U, { slot: 'dos' as never })).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('un objet équipé augmente la puissance et le bonus de caractéristique s’ajoute aux scores d’aventure', async () => {
    const s = await hero();
    const before = await getAdventureState(s.ctx, U);
    const [it] = await giveItems(s, itemOf('legendaire', 'arme', { ability: 'FOR', level: 10 }));
    await equipItem(s.ctx, U, { itemId: it.id });
    const after = await getAdventureState(s.ctx, U);
    if (!before.ok || !after.ok) throw new Error('état');
    // espadon : objet du Guerrier -> +20 % : 130 × 2 × 1,2 = 312
    expect(after.state.power - before.state.power).toBe(312);
    expect(after.state.scores.FOR - before.state.scores.FOR).toBe(Math.floor(312 / 12));
    const view = after.state.items[0];
    expect(view).toMatchObject({ power: 312, abilityBonus: 26, upgradeCost: null, dismantleValue: 80 });
  });

  it('améliore : coûte des fragments et de l’or, refuse sans ressources ou au niveau max', async () => {
    const s = await hero();
    const [it] = await giveItems(s, itemOf('rare'));
    expect(await upgradeItem(s.ctx, U, { itemId: it.id })).toMatchObject({ ok: false, error: 'insufficient' });
    await patchChar(s, { fragments: 100, gold: 5000 });
    const r = await upgradeItem(s.ctx, U, { itemId: it.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.level).toBe(1);
    expect(r.character).toMatchObject({ fragments: 95, gold: 4900 });
    expect((await s.store.listItems(U))[0].level).toBe(1);
    expect(await upgradeItem(s.ctx, U, { itemId: 'nope' })).toMatchObject({ ok: false, error: 'not-found' });
    await s.store.updateItem(U, it.id, { level: 10 });
    expect(await upgradeItem(s.ctx, U, { itemId: it.id })).toMatchObject({ ok: false, error: 'invalid' });
  });

  it('démonte : fragments selon la rareté, pas pour un objet équipé', async () => {
    const s = await hero();
    const [a, b] = await giveItems(s, itemOf('epique'), itemOf('commun', 'tete', { equipped: true }));
    const r = await dismantleItem(s.ctx, U, { itemId: a.id });
    expect(r).toMatchObject({ ok: true, fragments: 30 });
    expect((await s.store.getCharacter(U))!.fragments).toBe(30);
    expect(await s.store.listItems(U)).toHaveLength(1);
    expect(await dismantleItem(s.ctx, U, { itemId: b.id })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await dismantleItem(s.ctx, U, { itemId: a.id })).toMatchObject({ ok: false, error: 'not-found' });
  });

  it('fusionne 3 objets de même rareté en 1 objet supérieur, à l’emplacement du premier', async () => {
    const s = await hero();
    const [a, b, c, d] = await giveItems(s, itemOf('rare', 'torse'), itemOf('rare', 'arme'), itemOf('rare', 'tete'), itemOf('rare', 'tete'));
    const r = await mergeItems(s.ctx, U, { itemIds: [a.id, b.id, c.id] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item).toMatchObject({ rarity: 'epique', slot: 'torse', level: 0, equipped: false });
    const left = await s.store.listItems(U);
    expect(left.map((i) => i.id).sort()).toEqual([d.id, r.item.id].sort());
    // validations
    const [e, f, g] = await giveItems(s, itemOf('commun'), itemOf('commun'), itemOf('peu_commun'));
    expect(await mergeItems(s.ctx, U, { itemIds: [e.id, f.id] })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await mergeItems(s.ctx, U, { itemIds: [e.id, e.id, f.id] })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await mergeItems(s.ctx, U, { itemIds: [e.id, f.id, g.id] })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await mergeItems(s.ctx, U, { itemIds: [e.id, f.id, 'nope'] })).toMatchObject({ ok: false, error: 'not-found' });
    await s.store.updateItem(U, e.id, { equipped: true });
    const h = (await giveItems(s, itemOf('commun')))[0];
    expect(await mergeItems(s.ctx, U, { itemIds: [e.id, f.id, h.id] })).toMatchObject({ ok: false, error: 'invalid' });
    // jamais au-delà de légendaire
    const leg = await giveItems(s, itemOf('legendaire'), itemOf('legendaire'), itemOf('legendaire'));
    expect(await mergeItems(s.ctx, U, { itemIds: leg.map((i) => i.id) })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await mergeItems(s.ctx, U, { itemIds: undefined as never })).toMatchObject({ ok: false, error: 'invalid' });
  });
});

describe('donjons', () => {
  const strongHero = async (s: S, keys = 3) => {
    await patchChar(s, { level: 20, keys });
    const slots = ['arme', 'tete', 'torse', 'mains', 'bottes', 'amulette'] as const;
    await giveItems(s, ...slots.map((slot) => itemOf('legendaire', slot, { level: 10, equipped: true })));
  };

  it('liste 26 donjons : un par discipline, paliers croissants, déblocage par niveau', async () => {
    const s = await hero();
    const r = await listDungeons(s.ctx, U);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dungeons).toHaveLength(DUNGEONS.length);
    expect(r.dungeons[0]).toMatchObject({ unlocked: false, bestRoom: 0, bossDefeatedTier: 0, bossChestClaimed: false, bossChest: 'bronze' });
    expect(r.dungeons[0].roomPowers).toHaveLength(5);
    expect(r.keys).toBe(0);
    await patchChar(s, { level: 3 });
    const r2 = await listDungeons(s.ctx, U);
    expect(r2.ok && r2.dungeons.filter((d) => d.unlocked).map((d) => d.dungeon.tier)).toEqual([1, 1, 1, 1]);
  });

  it('refuse un donjon inconnu, verrouillé, ou sans Clé', async () => {
    const s = await hero();
    const tier1 = DUNGEONS[0];
    expect(await runDungeon(s.ctx, U, { dungeonId: 'dj-nope' })).toMatchObject({ ok: false, error: 'not-found' });
    await patchChar(s, { keys: 2 });
    expect(await runDungeon(s.ctx, U, { dungeonId: DUNGEONS[DUNGEONS.length - 1].id })).toMatchObject({ ok: false, error: 'level-too-low' });
    await patchChar(s, { level: tier1.unlockLevel, keys: 0 });
    expect(await runDungeon(s.ctx, U, { dungeonId: tier1.id })).toMatchObject({ ok: false, error: 'no-key' });
    expect((await s.store.getCharacter(U))!.keys).toBe(0);
  });

  it('une run consomme une Clé, verse or et fragments, enregistre le meilleur résultat', async () => {
    const s = await hero();
    const d = DUNGEONS[0];
    await patchChar(s, { level: 3, keys: 2 });
    const r = await runDungeon(s.ctx, U, { dungeonId: d.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.character.keys).toBe(1);
    expect(r.result.dungeonId).toBe(d.id);
    expect(r.result.bossDefeated).toBe(false);
    expect(r.result.reachedRoom).toBeLessThan(5);
    expect(r.result.missingPower).toBeGreaterThan(0);
    expect(r.result.log.length).toBeGreaterThan(0);
    expect(r.character.gold).toBe(r.result.gold);
    expect(r.progress).toMatchObject({ dungeonId: d.id, bestRoom: r.result.reachedRoom, bossDefeatedTier: 0, lastRunDate: date(5) });
    expect(await s.store.listDungeonProgress(U)).toEqual([r.progress]);
    // une run moins bonne ne dégrade pas le meilleur résultat
    await s.store.saveDungeonProgress(U, { ...r.progress, bestRoom: 5 });
    const r2 = await runDungeon(s.ctx, U, { dungeonId: d.id });
    expect(r2.ok && r2.progress.bestRoom).toBe(5);
    // la liste le reflète
    const l = await listDungeons(s.ctx, U);
    expect(l.ok && l.dungeons[0]).toMatchObject({ bestRoom: 5, lastRunDate: date(5) });
  });

  it('le boss vaincu donne un coffre une seule fois', async () => {
    const s = await hero();
    await strongHero(s);
    const d = DUNGEONS[0];
    const first = await runDungeon(s.ctx, U, { dungeonId: d.id });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.result).toMatchObject({ bossDefeated: true, reachedRoom: 5, missingPower: null, chest: 'bronze' });
    expect(first.chest).toMatchObject({ rarity: 'bronze', source: 'dungeon', sourceKey: d.id });
    expect(first.progress).toMatchObject({ bestRoom: 6, bossDefeatedTier: d.tier });
    const second = await runDungeon(s.ctx, U, { dungeonId: d.id });
    expect(second.ok && second.result.chest).toBeNull();
    expect(second.ok && second.chest).toBeNull();
    expect((await s.store.listChests(U)).filter((c) => c.source === 'dungeon')).toHaveLength(1);
    const l = await listDungeons(s.ctx, U);
    expect(l.ok && l.dungeons[0]).toMatchObject({ bossChestClaimed: true, bestRoom: 6 });
    // un palier 5+ promet de l'argent
    const tier5 = DUNGEONS.find((x) => x.tier === 5)!;
    const r5 = await runDungeon(s.ctx, U, { dungeonId: tier5.id });
    expect(r5.ok && r5.result.chest).toBe('argent');
  });
});
