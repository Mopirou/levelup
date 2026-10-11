import { describe, expect, it } from 'vitest';
import {
  ITEMS,
  MemoryStore,
  SETS,
  createCharacter,
  equipItem,
  evaluateSeasons,
  getAdventureState,
  getSeasonState,
  heroCombatStats,
  recordPower,
  syncHeroPower,
  unequipSlot,
  upgradeItem,
  type InventoryItem,
  type ServerContext,
} from '../src';

const heroInput = (name: string) => ({
  name,
  classId: 'guerrier',
  scores: { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 },
  portraitId: 'p1',
  frameColor: '#2f5a47',
  timezone: 'Europe/Paris',
});

const T = (iso: string) => Date.parse(`${iso}T09:00:00+02:00`);
const A = 'user-a';
const B = 'user-b';
const C = 'user-c';

let n = 0;
async function world(users: string[] = [A, B, C]) {
  const store = new MemoryStore([]);
  let nowMs = T('2026-10-05');
  const ctx: ServerContext = { store, now: () => nowMs, uuid: () => `s-${++n}` };
  for (const u of users) expect((await createCharacter(ctx, u, heroInput(u))).ok).toBe(true);
  return { store, ctx, at: (iso: string) => (nowMs = T(iso)) };
}
type W = Awaited<ReturnType<typeof world>>;

const item = (templateId: string, rarity: InventoryItem['rarity'] = 'legendaire', equipped = true): InventoryItem => {
  const t = ITEMS.find((x) => x.id === templateId)!;
  return { id: `i-${++n}`, templateId, rarity, slot: t.slot, ability: t.ability, level: 0, equipped, createdAt: '2026-10-01T00:00:00Z' };
};
const wearSet = (setIdx: number, count: number) => Object.values(SETS[setIdx].pieces).slice(0, count).map((id) => item(id, 'epique'));

/** Joue deux dates de la saison pour qu’un joueur ait assez participé. */
async function play(w: W, user: string, first = '2026-10-05', last = '2026-10-12') {
  w.at(first);
  await getAdventureState(w.ctx, user);
  w.at(last);
  await getAdventureState(w.ctx, user);
}

describe('publication de la puissance', () => {
  it('adventure-state publie la puissance sur le personnage et pour la saison', async () => {
    const w = await world([A]);
    const r = await getAdventureState(w.ctx, A);
    expect(r.ok && r.state.power).toBeGreaterThan(0);
    if (!r.ok) return;
    expect((await w.store.getCharacter(A))!.power).toBe(r.state.power);
    expect(r.character.power).toBe(r.state.power);
    expect(await w.store.listSeasonScores(A)).toEqual([{ seasonKey: 'S1', power: r.state.power, firstDay: '2026-10-05', lastDay: '2026-10-05' }]);
  });

  it('garde le premier jour, avance le dernier, suit la puissance', async () => {
    const w = await world([A]);
    await play(w, A);
    await w.store.insertItems(A, [item('espadon', 'legendaire', false)]);
    const equipped = (await w.store.listItems(A))[0];
    w.at('2026-10-14');
    expect((await equipItem(w.ctx, A, { itemId: equipped.id })).ok).toBe(true);
    const [s] = await w.store.listSeasonScores(A);
    expect(s).toMatchObject({ seasonKey: 'S1', firstDay: '2026-10-05', lastDay: '2026-10-14' });
    expect(s.power).toBe((await w.store.getCharacter(A))!.power);
    expect(s.power).toBeGreaterThan(30);
  });

  it('équiper, retirer et améliorer remettent la puissance à jour', async () => {
    const w = await world([A]);
    await getAdventureState(w.ctx, A);
    const base = (await w.store.getCharacter(A))!.power;
    const it = item('espadon', 'rare', false);
    await w.store.insertItems(A, [it]);
    await equipItem(w.ctx, A, { itemId: it.id });
    const equipped = (await w.store.getCharacter(A))!.power;
    expect(equipped).toBeGreaterThan(base);
    await w.store.saveCharacter(A, { ...(await w.store.getCharacter(A))!, gold: 5000, fragments: 500 });
    const up = await upgradeItem(w.ctx, A, { itemId: it.id });
    expect(up.ok).toBe(true);
    const upgraded = (await w.store.getCharacter(A))!.power;
    expect(upgraded).toBeGreaterThan(equipped);
    // la réponse porte le personnage à jour
    expect(up.ok && up.character.power).toBe(upgraded);
    await unequipSlot(w.ctx, A, { slot: 'arme' });
    expect((await w.store.getCharacter(A))!.power).toBe(base);
    // améliorer un objet non équipé ne touche pas la puissance
    const spare = item('gourdin-de-voyageur', 'commun', false);
    await w.store.insertItems(A, [spare]);
    const r = await upgradeItem(w.ctx, A, { itemId: spare.id });
    expect(r.ok && r.character.power).toBe(base);
  });

  it('les panoplies équipées comptent dans la puissance et les scores', async () => {
    const w = await world([A]);
    await getAdventureState(w.ctx, A);
    const base = await getAdventureState(w.ctx, A);
    await w.store.insertItems(A, wearSet(0, 4));
    const r = await getAdventureState(w.ctx, A);
    if (!r.ok || !base.ok) throw new Error('état');
    expect(r.state.powerBreakdown.sets).toBe(12);
    expect(r.state.setBonus).toMatchObject({ pp: 12, abilities: { FOR: 3 } });
    expect(r.state.power).toBe(r.state.powerBreakdown.level + r.state.powerBreakdown.scores + r.state.powerBreakdown.items + 12);
    expect(r.state.scores.FOR - base.state.scores.FOR).toBeGreaterThanOrEqual(3);
    expect(r.state.sets.find((s) => s.setId === 'guerrier')).toMatchObject({ equipped: 4, owned: 4, tier: { pieces: 4 } });
    expect(r.state.items.every((i) => i.setId === 'guerrier')).toBe(true);
    // les autres modes (raids) voient les mêmes PP
    const stats = await heroCombatStats(w.store, A, r.character);
    expect(stats.power).toBe(r.state.power);
    expect(stats.scores).toEqual(r.state.scores);
  });

  it('recordPower et syncHeroPower : sans changement, le personnage n’est pas réécrit ; sans personnage, rien', async () => {
    const w = await world([A]);
    const c = (await w.store.getCharacter(A))!;
    const same = await recordPower(w.ctx, A, { ...c, power: 77 }, 77, '2026-10-05');
    expect(same.power).toBe(77);
    await syncHeroPower(w.ctx, 'inconnu');
    expect(await w.store.listSeasonScores('inconnu')).toEqual([]);
    await syncHeroPower(w.ctx, A);
    expect((await w.store.getCharacter(A))!.power).toBeGreaterThan(0);
  });
});

describe('évaluation de fin de saison', () => {
  it('récompense paresseuse : cadre, coffre d’or, notification ; rien tant que la saison court', async () => {
    const w = await world([A]);
    await play(w, A);
    w.at('2026-11-22'); // dernier jour de la saison 1
    const during = await getSeasonState(w.ctx, A);
    expect(during.ok && during.state.evaluated).toEqual([]);
    expect(await w.store.listChests(A).then((l) => l.filter((c) => c.source === 'season'))).toHaveLength(0);

    w.at('2026-11-24'); // saison 2
    const r = await getSeasonState(w.ctx, A);
    if (!r.ok) throw new Error('état');
    expect(r.state.season.key).toBe('S2');
    expect(r.state.evaluated).toHaveLength(1);
    expect(r.state.evaluated[0]).toMatchObject({ seasonKey: 'S1', name: 'Saison 1', rank: 1, participants: 1, frame: 'laurier', chest: true });
    expect(r.character.frameStyle).toBe('S1:laurier');
    expect(r.state.frame).toMatchObject({ season: 'S1', frame: 'laurier', label: 'Cadre de laurier' });
    const chests = await w.store.listChests(A).then((l) => l.filter((c) => c.source === 'season'));
    expect(chests).toEqual([expect.objectContaining({ rarity: 'or', source: 'season', sourceKey: 'S1', openedAt: null })]);
    expect(w.store.notifications.filter((x) => x.type === 'season_end')).toEqual([
      { userId: A, type: 'season_end', payload: { season: 'S1', name: 'Saison 1', rank: 1, participants: 1, frame: 'laurier' } },
    ]);
    expect(r.state.results.map((x) => x.seasonKey)).toEqual(['S1']);
  });

  it('idempotente : rejouée ou lue par plusieurs chemins, un seul coffre et une seule notification', async () => {
    const w = await world([A]);
    await play(w, A);
    w.at('2026-11-24');
    await getAdventureState(w.ctx, A);
    await getSeasonState(w.ctx, A);
    await getSeasonState(w.ctx, A);
    const c = (await w.store.getCharacter(A))!;
    const again = await evaluateSeasons(w.ctx, A, c, '2026-11-24', await w.store.getSettings(A));
    expect(again.evaluated).toEqual([]);
    expect(await w.store.listChests(A).then((l) => l.filter((c) => c.source === 'season'))).toHaveLength(1);
    expect(w.store.notifications.filter((x) => x.type === 'season_end')).toHaveLength(1);
    expect(await w.store.listSeasonResults(A)).toHaveLength(1);
    // un coffre déjà ouvert n'est jamais redonné
    const chest = (await w.store.listChests(A).then((l) => l.filter((c) => c.source === 'season')))[0];
    await w.store.markChestOpened(A, chest.id, '2026-11-24T10:00:00Z');
    await getSeasonState(w.ctx, A);
    expect(await w.store.listChests(A).then((l) => l.filter((c) => c.source === 'season'))).toHaveLength(1);
  });

  it('classement entre amis : podium, cadres et rangs', async () => {
    const w = await world();
    w.store.addFriendship(A, B);
    w.store.addFriendship(A, C);
    w.store.addFriendship(B, C);
    await w.store.insertItems(A, wearSet(0, 6));
    await w.store.insertItems(B, wearSet(1, 2));
    await play(w, A);
    await play(w, B);
    await play(w, C);
    w.at('2026-11-30');
    const ra = await getSeasonState(w.ctx, A);
    const rb = await getSeasonState(w.ctx, B);
    const rc = await getSeasonState(w.ctx, C);
    if (!ra.ok || !rb.ok || !rc.ok) throw new Error('état');
    expect(ra.state.evaluated[0]).toMatchObject({ rank: 1, participants: 3, frame: 'or' });
    expect(rb.state.evaluated[0]).toMatchObject({ rank: 2, participants: 3, frame: 'argent' });
    expect(rc.state.evaluated[0]).toMatchObject({ rank: 3, participants: 3, frame: 'bronze' });
    expect(ra.character.frameStyle).toBe('S1:or');
    expect(rc.character.frameStyle).toBe('S1:bronze');
    for (const u of [A, B, C]) expect((await w.store.listChests(u)).filter((c) => c.source === 'season')).toHaveLength(1);
  });

  it('classement refusé : pas classé, mais récompense de participation', async () => {
    const w = await world();
    w.store.addFriendship(A, B);
    await play(w, A);
    await play(w, B);
    await w.store.saveSettings(A, { ...(await w.store.getSettings(A)), leaderboardOptIn: false });
    w.at('2026-11-30');
    const ra = await getSeasonState(w.ctx, A);
    const rb = await getSeasonState(w.ctx, B);
    if (!ra.ok || !rb.ok) throw new Error('état');
    expect(ra.state.evaluated[0]).toMatchObject({ rank: null, participants: 0, frame: 'laurier' });
    expect(ra.state.optedIn).toBe(false);
    expect(ra.state.rank).toBeNull();
    // l'ami qui accepte le classement ne voit pas celui qui l'a refusé
    expect(rb.state.evaluated[0]).toMatchObject({ rank: 1, participants: 1, frame: 'laurier' });
    expect(await w.store.seasonRanking(A, 'S1')).toEqual([]);
    expect((await w.store.seasonRanking(B, 'S1')).map((r) => r.profileId)).toEqual([B]);
  });

  it('seuls les amis comptent : un inconnu n’entre pas dans le classement', async () => {
    const w = await world();
    await play(w, A);
    await play(w, B);
    const ranking = await w.store.seasonRanking(A, 'S1');
    expect(ranking.map((r) => r.profileId)).toEqual([A]);
  });

  it('pas assez joué : résultat enregistré sans coffre ni cadre ni notification', async () => {
    const w = await world([A]);
    w.at('2026-10-05');
    await getAdventureState(w.ctx, A);
    w.at('2026-10-08');
    await getAdventureState(w.ctx, A);
    w.at('2026-11-30');
    const r = await getSeasonState(w.ctx, A);
    if (!r.ok) throw new Error('état');
    expect(r.state.evaluated[0]).toMatchObject({ seasonKey: 'S1', frame: null, chest: false, rank: null });
    expect(await w.store.listChests(A).then((l) => l.filter((c) => c.source === 'season'))).toHaveLength(0);
    expect(w.store.notifications.filter((x) => x.type === 'season_end')).toEqual([]);
    expect(r.character.frameStyle).toBeNull();
    // et il ne sera pas réévalué
    expect((await getSeasonState(w.ctx, A)).ok).toBe(true);
    expect(await w.store.listSeasonResults(A)).toHaveLength(1);
  });

  it('plusieurs saisons manquées : évaluées dans l’ordre, le dernier cadre gagné reste', async () => {
    const w = await world([A]);
    await play(w, A, '2026-10-05', '2026-10-12');
    await play(w, A, '2026-11-24', '2026-12-01');
    w.at('2027-02-01');
    const r = await getSeasonState(w.ctx, A);
    if (!r.ok) throw new Error('état');
    // la saison 1 a été évaluée à la première lecture de la saison 2 ; la saison 2 reste à évaluer
    expect(r.state.evaluated.map((e) => e.seasonKey)).toEqual(['S2']);
    expect(r.character.frameStyle).toBe('S2:laurier');
    expect(r.state.results.map((e) => e.seasonKey)).toEqual(['S2', 'S1']);
    expect((await w.store.listChests(A).then((l) => l.filter((c) => c.source === 'season'))).map((c) => c.sourceKey)).toEqual(['S1', 'S2']);
  });

  it('une notification manquée ne bloque pas la lecture', async () => {
    const w = await world([A]);
    await play(w, A);
    w.store.notify = async () => {
      throw new Error('boom');
    };
    w.at('2026-11-30');
    const r = await getSeasonState(w.ctx, A);
    expect(r.ok && r.state.evaluated).toHaveLength(1);
  });
});

describe('état de la saison', () => {
  it('jours restants, semaine, mon rang provisoire et la récompense en jeu', async () => {
    const w = await world();
    w.store.addFriendship(A, B);
    await w.store.insertItems(A, wearSet(2, 3));
    await getAdventureState(w.ctx, B);
    w.at('2026-10-14');
    const r = await getSeasonState(w.ctx, A);
    if (!r.ok) throw new Error('état');
    const s = r.state;
    expect(s.season).toMatchObject({ key: 'S1', week: 3, daysLeft: 56 - 16 });
    expect(s.power).toBe(r.character.power);
    expect(s).toMatchObject({ optedIn: true, rank: 1, participants: 2, qualifies: false, daysPlayed: 1 });
    expect(s.reward).toMatchObject({ frame: 'or', chest: 'or', frameLabel: 'Cadre d’or', frameGlyph: '🥇', frameColor: '#d4af37' });
    expect(s.frame).toBeNull();
    expect(s.results).toEqual([]);
  });

  it('sans personnage : no-character', async () => {
    const w = await world([]);
    expect(await getSeasonState(w.ctx, 'inconnu')).toMatchObject({ ok: false, error: 'no-character' });
  });

  it('daysPlayed et qualifies après une semaine de jeu', async () => {
    const w = await world([A]);
    await play(w, A);
    const r = await getSeasonState(w.ctx, A);
    expect(r.ok && r.state).toMatchObject({ qualifies: true, daysPlayed: 8 });
  });

  it('les anciens enregistrements sans champs de saison se chargent', async () => {
    const w = await world([A]);
    const d = w.store.data(A) as { seasonScores?: unknown; seasonResults?: unknown };
    delete d.seasonScores;
    delete d.seasonResults;
    expect(await w.store.listSeasonScores(A)).toEqual([]);
    expect(await w.store.listSeasonResults(A)).toEqual([]);
  });
});
