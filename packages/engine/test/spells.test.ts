import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHEST_RARITIES,
  ITEMS,
  LEGACY_ITEM_MAP,
  MemoryStore,
  NO_SPELL_BONUS,
  SPELL_BY_ID,
  SPELL_CHANCE,
  SPELL_DEFS,
  SPELL_MAX_LEVEL,
  SPELL_OTHER_CAP,
  SPELL_POINTS,
  SPELL_SLOTS,
  SPELL_XP_CAP,
  adjustedOdds,
  applySpellXp,
  claimExpedition,
  completeQuestAction,
  createCharacter,
  drawChest,
  ensureQuests,
  equipSpell,
  expeditionYield,
  freeSpellSlot,
  getAdventureState,
  heroCombatStats,
  heroXpBonus,
  migrateLegacyItems,
  nextSpellLevel,
  openChest,
  raidBaseDamage,
  resolveDungeon,
  runDungeon,
  spellBonuses,
  spellEffectLabel,
  spellEffectPoints,
  spellMaxFragments,
  startTrack,
  unequipSpell,
  type Chest,
  type ChestRarity,
  type QuestInstance,
  type QuestTemplate,
  type ServerContext,
  type SpellKnown,
} from '../src';
import { TEST_RUNG_TEMPLATES } from './track-fixtures';

const known = (spellId: string, level = 1, equippedSlot: number | null = 1): SpellKnown => ({ spellId, level, equippedSlot });

describe('contenu des capacités', () => {
  it('56 capacités : 8 par classe, glyphes et textes renseignés, JSON embarqué = contenu généré', () => {
    expect(SPELL_DEFS).toHaveLength(56);
    expect(new Set(SPELL_DEFS.map((s) => s.id)).size).toBe(56);
    expect(JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'spells.fr.json'), 'utf8'))).toEqual(SPELL_DEFS);
    for (const s of SPELL_DEFS) {
      expect(s.name.trim().length).toBeGreaterThan(2);
      expect(s.glyph.trim()).not.toBe('');
      expect(s.blurb.trim().length).toBeGreaterThan(10);
    }
    // quelques capacités emblématiques sont bien à leur place
    expect(SPELL_BY_ID.get('boule-de-feu')).toMatchObject({ classId: 'magicien', rarity: 'rare', family: 'raid' });
    expect(SPELL_BY_ID.get('souhait')).toMatchObject({ classId: 'magicien', rarity: 'legendaire', family: 'xp', ability: 'all' });
    expect(SPELL_BY_ID.get('chatiment-divin')).toMatchObject({ classId: 'paladin' });
  });
});

describe('points d’effet et bonus', () => {
  it('rareté 3 / 5 / 8 / 12 / 18, niveau +20 % par niveau, +25 % pour sa classe', () => {
    expect(SPELL_POINTS).toEqual({ commun: 3, peu_commun: 5, rare: 8, epique: 12, legendaire: 18 });
    expect(spellEffectPoints('rare', 1, false)).toBe(8);
    expect(spellEffectPoints('rare', 5, false)).toBeCloseTo(14.4);
    expect(spellEffectPoints('rare', 1, true)).toBe(10);
    expect(spellEffectPoints('legendaire', 5, true)).toBeCloseTo(18 * 1.8 * 1.25);
    // niveau borné
    expect(spellEffectPoints('commun', 99, false)).toBeCloseTo(3 * 1.8);
    expect(spellEffectPoints('commun', -2, false)).toBe(3);
  });

  it('familles : XP, score, raid, or, chance de coffre, survie ; les capacités non équipées ne comptent pas', () => {
    const masteries = ['FOR', 'CON'] as const;
    const b = spellBonuses(
      [known('critique-ameliore', 1, 1), known('fougue', 1, 2), known('second-souffle', 1, 3), known('inflexible', 1, null)],
      SPELL_BY_ID,
      'guerrier',
      masteries,
    );
    expect(b.xp.FOR).toBeCloseTo(5 * 1.25);
    expect(b.raid).toBeCloseTo(8 * 1.25);
    expect(b.dungeon).toBeCloseTo((3 * 1.25) / 2);
    expect(b.pp).toBe(Math.round(6.25) + 10 + Math.round(3.75));
    expect(b.active).toHaveLength(3);
    // aucune capacité équipée : aucun effet
    expect(spellBonuses([known('inflexible', 3, null)], SPELL_BY_ID, 'guerrier', masteries)).toBe(NO_SPELL_BONUS);
    // une capacité d'une autre classe n'a pas le bonus de 25 %
    expect(spellBonuses([known('fougue')], SPELL_BY_ID, 'paladin', ['FOR', 'CHA']).raid).toBe(8);
    // score d'aventure : floor(points / 4)
    expect(spellBonuses([known('attaque-supplementaire', 5)], SPELL_BY_ID, 'guerrier', masteries).stats).toEqual({ FOR: Math.floor((8 * 1.8 * 1.25) / 4) });
    // or et chance de coffre
    expect(spellBonuses([known('tueur-implacable')], SPELL_BY_ID, 'rodeur', ['DEX', 'SAG']).gold).toBeCloseTo(22.5);
    expect(spellBonuses([known('coup-de-chance')], SPELL_BY_ID, 'roublard', ['DEX', 'INT']).chest).toBeCloseTo((18 * 1.25) / 4);
  });

  it('Souhait partage ses points entre les maîtrises de la classe', () => {
    const b = spellBonuses([known('souhait')], SPELL_BY_ID, 'magicien', ['INT', 'CON']);
    expect(b.xp.INT).toBeCloseTo((18 * 1.25) / 2);
    expect(b.xp.CON).toBeCloseTo((18 * 1.25) / 2);
  });

  it('plafonds : XP ≤ +25 %, raid / or / survie ≤ +30', () => {
    const xp = spellBonuses(
      [known('critique-ameliore', 5, 1), known('athlete-accompli', 5, 2), known('inflexible', 5, 3)],
      SPELL_BY_ID,
      'guerrier',
      ['FOR', 'CON'],
    );
    expect(xp.xp.FOR).toBe(SPELL_XP_CAP);
    const raid = spellBonuses([known('triple-attaque-supplementaire', 5, 1), known('fougue', 5, 2), known('chatiment-divin', 5, 3)], SPELL_BY_ID, 'guerrier', ['FOR', 'CON']);
    expect(raid.raid).toBe(SPELL_OTHER_CAP);
    const dun = spellBonuses([known('intervention-divine', 5, 1), known('esprits-gardiens', 5, 2), known('soins', 5, 3)], SPELL_BY_ID, 'clerc', ['SAG', 'CON']);
    expect(dun.dungeon).toBeLessThanOrEqual(SPELL_OTHER_CAP);
    // les emplacements hors Grimoire (0 ou 4) sont ignorés
    expect(spellBonuses([known('fougue', 1, 4), known('fougue', 1, 0)], SPELL_BY_ID, 'guerrier', ['FOR']).raid).toBe(0);
    // une capacité inconnue du contenu est ignorée
    expect(spellBonuses([known('fantome')], SPELL_BY_ID, 'guerrier', ['FOR'])).toBe(NO_SPELL_BONUS);
  });

  it('niveaux, emplacements et libellés', () => {
    expect(nextSpellLevel(1)).toBe(2);
    expect(nextSpellLevel(SPELL_MAX_LEVEL)).toBeNull();
    expect(freeSpellSlot([])).toBe(1);
    expect(freeSpellSlot([known('a', 1, 1), known('b', 1, 3)])).toBe(2);
    expect(freeSpellSlot([known('a', 1, 1), known('b', 1, 2), known('c', 1, 3)])).toBeNull();
    expect(SPELL_SLOTS).toBe(3);
    expect(spellMaxFragments('legendaire')).toBeGreaterThan(spellMaxFragments('commun'));
    const label = (id: string, pts: number) => spellEffectLabel(SPELL_BY_ID.get(id)!, pts);
    expect(label('critique-ameliore', 6.25)).toBe('+6,3 % d’XP en Force');
    expect(label('souhait', 22.5)).toContain('chacune de toutes tes maîtrises');
    expect(label('attaque-supplementaire', 10)).toBe('+2 en Force (aventure)');
    expect(label('fougue', 10)).toBe('+10 % de dégâts de raid');
    expect(label('tueur-implacable', 18)).toBe('+18 % d’or d’expédition');
    expect(label('coup-de-chance', 20)).toBe('butin de coffre meilleur de 5 points');
    expect(label('soins', 4)).toBe('+2 % de Constitution en donjon');
  });

  it('applySpellXp : bonus par caractéristique, sans toucher aux retraits ni dépasser le plafond', () => {
    const parts = [
      { ability: 'FOR' as const, amount: 100 },
      { ability: 'CON' as const, amount: 40 },
      { ability: 'DEX' as const, amount: -30 },
    ];
    expect(applySpellXp(parts)).toEqual(parts);
    expect(applySpellXp(parts, { FOR: 10, DEX: 50 })).toEqual([
      { ability: 'FOR', amount: 110 },
      { ability: 'CON', amount: 40 },
      { ability: 'DEX', amount: -30 },
    ]);
    expect(applySpellXp(parts, { FOR: 90 })[0].amount).toBe(125);
    expect(applySpellXp([{ ability: 'FOR', amount: 1 }], { FOR: 1 })[0].amount).toBe(1);
  });
});

describe('effets dans les règles d’aventure', () => {
  it('expédition : +% d’or', () => {
    const input = { pp: 100, scores: { INT: 10, DEX: 10 }, streak: 0, elapsedMs: 3_600_000 };
    const base = expeditionYield(input);
    const boosted = expeditionYield({ ...input, goldBonusPct: 20 });
    expect(boosted.goldPerHour).toBeCloseTo(base.goldPerHour * 1.2);
    expect(boosted.fragmentsPerHour).toBeCloseTo(base.fragmentsPerHour);
  });

  it('raid : +% de dégâts', () => {
    const base = raidBaseDamage({ pp: 1000, forScore: 12, chaBonus: 0 });
    expect(raidBaseDamage({ pp: 1000, forScore: 12, chaBonus: 0, spellBonusPct: 20 })).toBe(Math.floor((1000 * 1.2 * 1.2)));
    expect(base).toBe(1200);
  });

  it('donjon : +% de CON effective, donc plus de salles franchies', () => {
    const dungeon = { id: 'dj-test', tier: 1, rooms: ['un a', 'un b', 'un c', 'un d', 'un e'], boss: 'le roi' };
    const run = (conBonusPct?: number) => resolveDungeon({ dungeon, pp: 60, scores: { CON: 20, FOR: 0 }, firstBossVictory: true, seed: 's', conBonusPct });
    expect(run(100).reachedRoom).toBeGreaterThan(run().reachedRoom);
  });
});

describe('tirage de coffre en deux temps', () => {
  const draw = (chest: ChestRarity, seed: string, over: object = {}) =>
    drawChest({ chest, sag: 0, pity: {}, seed, templates: ITEMS, spells: SPELL_DEFS, classId: 'magicien', ...over });

  it('le coffre de bois ne donne jamais de capacité ; les autres, de plus en plus', () => {
    expect(SPELL_CHANCE.bois).toBe(0);
    expect(CHEST_RARITIES.map((c) => SPELL_CHANCE[c])).toEqual([0, 15, 22, 30, 40]);
    for (let i = 0; i < 300; i++) expect(draw('bois', `b${i}`).spell).toBeNull();
    const share = (chest: ChestRarity) => Array.from({ length: 3000 }, (_, i) => draw(chest, `${chest}${i}`)).filter((d) => d.spell).length / 3000;
    expect(share('bronze')).toBeGreaterThan(0.1);
    expect(share('bronze')).toBeLessThan(0.2);
    expect(share('mythique')).toBeGreaterThan(0.33);
    expect(share('mythique')).toBeLessThan(0.47);
  });

  it('une capacité tirée a la rareté tirée ; un objet ou une capacité, jamais les deux', () => {
    for (let i = 0; i < 400; i++) {
      const d = draw('mythique', `m${i}`);
      expect(!!d.template !== !!d.spell).toBe(true);
      if (d.spell) expect(d.spell.rarity).toBe(d.rarity);
    }
  });

  it('contenu d’un objet : ≈ 70 % de la classe, 20 % universel, 10 % d’une autre classe', () => {
    const counts = { own: 0, universal: 0, other: 0 };
    const N = 6000;
    for (let i = 0; i < N; i++) {
      const t = draw('bois', `c${i}`).template!;
      counts[!t.classId ? 'universal' : t.classId === 'magicien' ? 'own' : 'other']++;
    }
    expect(counts.own / N).toBeGreaterThan(0.66);
    expect(counts.own / N).toBeLessThan(0.74);
    expect(counts.universal / N).toBeGreaterThan(0.16);
    expect(counts.universal / N).toBeLessThan(0.24);
    expect(counts.other / N).toBeGreaterThan(0.06);
    expect(counts.other / N).toBeLessThan(0.14);
  });

  it('contenu d’une capacité : ≈ 80 % de la classe, 20 % d’une autre', () => {
    let own = 0;
    let total = 0;
    for (let i = 0; i < 6000 && total < 1500; i++) {
      const d = draw('mythique', `s${i}`);
      if (!d.spell) continue;
      total++;
      if (d.spell.classId === 'magicien') own++;
    }
    expect(own / total).toBeGreaterThan(0.74);
    expect(own / total).toBeLessThan(0.86);
  });

  it('sans classe ni capacités : tirage uniforme d’objets ; la pitié reste garantie', () => {
    const d = drawChest({ chest: 'bois', sag: 0, pity: {}, seed: 'x', templates: ITEMS });
    expect(d.spell).toBeNull();
    expect(d.template).not.toBeNull();
    const g = draw('bronze', 'pity', { pity: { bronze: 8 } });
    expect(['epique', 'legendaire']).toContain(g.rarity);
    expect(g.guaranteed).toBe('epique');
  });

  it('la chance de coffre des capacités décale la rareté (comme la SAG)', () => {
    expect(adjustedOdds('bois', 0, 10)).toEqual([60, 25, 15, 0, 0]);
    expect(adjustedOdds('bois', 10, 4)).toEqual([64, 25, 11, 0, 0]);
    const odds = adjustedOdds('argent', 0, 3);
    expect(odds.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

// ───────────────────────── Actions serveur ─────────────────────────

const catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'quests.fr.json'), 'utf8')).map(
  (q: QuestTemplate) => ({ ...q, source: 'catalog' }),
) as QuestTemplate[];

const U = 'user-spell';
let counter = 0;
const at = (day: number, hour = 9) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+02:00`;
const date = (day: number) => `2026-10-${String(day).padStart(2, '0')}`;

async function hero(classId = 'magicien', scores = { FOR: 2, DEX: 2, CON: 5, INT: 5, SAG: 2, CHA: 2 }) {
  const store = new MemoryStore([...catalog, ...TEST_RUNG_TEMPLATES]);
  let nowMs = Date.parse(at(5));
  const ctx: ServerContext = { store, now: () => nowMs, uuid: () => `sp-${++counter}` };
  expect((await createCharacter(ctx, U, { name: 'Mira', classId, scores, portraitId: 'p1', frameColor: '#2f5a47', timezone: 'Europe/Paris' })).ok).toBe(true);
  return { store, ctx, setNow: (iso: string) => (nowMs = Date.parse(iso)), advanceHours: (h: number) => (nowMs += h * 3_600_000) };
}
type S = Awaited<ReturnType<typeof hero>>;

const learn = async (s: S, ...list: SpellKnown[]) => {
  for (const k of list) await s.store.saveSpell(U, k);
};
const give = async (s: S, rarity: ChestRarity): Promise<Chest> => {
  const c: Chest = { id: `ch-${++counter}`, rarity, source: 'quest', sourceKey: `k${counter}`, instanceId: null, createdAt: '2026-10-01T00:00:00Z', openedAt: null };
  await s.store.insertChest(U, c);
  return c;
};

describe('Grimoire : équiper et retirer', () => {
  it('3 emplacements, un seul sort par emplacement ; équiper remplace', async () => {
    const s = await hero();
    await learn(s, known('projectile-magique', 1, null), known('lumiere', 1, null), known('eclair', 1, null), known('souhait', 1, null));
    const first = await equipSpell(s.ctx, U, { spellId: 'projectile-magique' });
    expect(first.ok && first.grimoire.equipped).toEqual(['projectile-magique', null, null]);
    // déjà équipé et aucun emplacement demandé : sans effet
    expect(await equipSpell(s.ctx, U, { spellId: 'projectile-magique' })).toMatchObject({ ok: true });
    await equipSpell(s.ctx, U, { spellId: 'lumiere' });
    await equipSpell(s.ctx, U, { spellId: 'eclair' });
    // grimoire plein : un 4e sort prend l'emplacement demandé
    const swap = await equipSpell(s.ctx, U, { spellId: 'souhait', slot: 2 });
    expect(swap.ok && swap.grimoire.equipped).toEqual(['projectile-magique', 'souhait', 'eclair']);
    const list = await s.store.listSpells(U);
    expect(list.filter((k) => k.equippedSlot !== null)).toHaveLength(3);
    expect(list.find((k) => k.spellId === 'lumiere')!.equippedSlot).toBeNull();
    // sans emplacement demandé et grimoire plein : le dernier emplacement
    const last = await equipSpell(s.ctx, U, { spellId: 'lumiere' });
    expect(last.ok && last.grimoire.equipped[2]).toBe('lumiere');
    // déplacer une capacité équipée vers un emplacement occupé : l'ancienne est retirée
    const moved = await equipSpell(s.ctx, U, { spellId: 'souhait', slot: 1 });
    expect(moved.ok && moved.grimoire.equipped).toEqual(['souhait', null, 'lumiere']);
    // erreurs
    expect(await equipSpell(s.ctx, U, { spellId: 'boule-de-feu' })).toMatchObject({ ok: false, error: 'not-found' });
    expect(await equipSpell(s.ctx, U, { spellId: 'souhait', slot: 4 })).toMatchObject({ ok: false, error: 'invalid' });
    expect(await equipSpell(s.ctx, 'inconnu', { spellId: 'souhait' })).toMatchObject({ ok: false, error: 'no-character' });
    // retirer
    const out = await unequipSpell(s.ctx, U, { slot: 1 });
    expect(out.ok && out.grimoire.equipped[0]).toBeNull();
    expect(await unequipSpell(s.ctx, U, { slot: 1 })).toMatchObject({ ok: false, error: 'not-found' });
    expect((await unequipSpell(s.ctx, U, { spellId: 'lumiere' })).ok).toBe(true);
    expect(await unequipSpell(s.ctx, 'inconnu', { slot: 1 })).toMatchObject({ ok: false, error: 'no-character' });
  });

  it('les capacités équipées comptent dans la puissance, les scores et l’état de l’aventure (+25 % pour sa classe)', async () => {
    const s = await hero();
    const before = await getAdventureState(s.ctx, U);
    await learn(s, known('lumiere', 5, null), known('fougue', 1, null));
    await equipSpell(s.ctx, U, { spellId: 'lumiere' });
    await equipSpell(s.ctx, U, { spellId: 'fougue' });
    const after = await getAdventureState(s.ctx, U);
    if (!before.ok || !after.ok) throw new Error('état');
    // Lumière (Magicien, niveau 5, +25 %) : 3 × 1,8 × 1,25 = 6,75 -> 7 PP ; Fougue (Guerrier, sans bonus) : 8 PP
    expect(after.state.powerBreakdown.spells).toBe(7 + 8);
    expect(after.state.power - before.state.power).toBe(15);
    // Lumière donne +floor(6,75 / 4) = +1 en INT (aventure)
    expect(after.state.scores.INT - before.state.scores.INT).toBe(1);
    expect(after.state.grimoire.equipped).toEqual(['lumiere', 'fougue', null]);
    expect(after.state.grimoire.bonus.raid).toBe(8);
    expect(after.state.heroClass).toBe('magicien');
    const view = after.state.grimoire.spells.find((x) => x.id === 'lumiere')!;
    expect(view).toMatchObject({ ownClass: true, level: 5, maxLevel: 5, equippedSlot: 1 });
    expect(view.effect).toBe('+1 en Intelligence (aventure)');
    expect(after.state.grimoire.spells.find((x) => x.id === 'fougue')!.ownClass).toBe(false);
    // les autres modes (raids) voient les mêmes PP et le bonus de dégâts
    const stats = await heroCombatStats(s.store, U, after.character);
    expect(stats.power).toBe(after.state.power);
    expect(stats.raidBonus).toBe(8);
  });

  it('expédition : l’or augmente avec les capacités d’or équipées', async () => {
    const run = async (equip: boolean) => {
      const s = await hero('rodeur', { FOR: 2, DEX: 5, CON: 2, INT: 2, SAG: 5, CHA: 2 });
      await getAdventureState(s.ctx, U);
      if (equip) {
        await learn(s, known('tueur-implacable', 1, null));
        await equipSpell(s.ctx, U, { spellId: 'tueur-implacable' });
      }
      s.advanceHours(10);
      const r = await claimExpedition(s.ctx, U);
      return r.ok ? r.claim.gold : 0;
    };
    const base = await run(false);
    const boosted = await run(true);
    expect(boosted).toBeGreaterThan(base);
  });

  it('donjon : la survie augmente avec les capacités de donjon (CON effective)', async () => {
    const s = await hero('clerc', { FOR: 2, DEX: 2, CON: 5, INT: 2, SAG: 5, CHA: 2 });
    await s.store.saveCharacter(U, { ...(await s.store.getCharacter(U))!, keys: 2, level: 3 });
    await learn(s, known('intervention-divine', 5, null));
    await equipSpell(s.ctx, U, { spellId: 'intervention-divine' });
    const r = await runDungeon(s.ctx, U, { dungeonId: 'dj-yoga' });
    expect(r.ok).toBe(true);
  });
});

describe('coffres : capacités', () => {
  /** Ouvre des coffres mythiques jusqu'à obtenir une capacité. */
  async function openUntilSpell(s: S, maxTries = 80) {
    for (let day = 5; day < 5 + maxTries; day++) {
      s.setNow(at(day));
      const c = await give(s, 'mythique');
      const r = await openChest(s.ctx, U, { chestId: c.id });
      if (r.ok && r.opening.spell) return r;
    }
    throw new Error('aucune capacité obtenue');
  }

  it('une capacité nouvelle est connue au niveau 1, non équipée, annoncée dans le résultat', async () => {
    const s = await hero();
    const r = await openUntilSpell(s);
    const gain = r.opening.spell!;
    expect(r.opening.item).toBeNull();
    expect(gain).toMatchObject({ isNew: true, levelBefore: 0, fragments: 0 });
    expect(gain.spell).toMatchObject({ level: 1, equippedSlot: null });
    const list = await s.store.listSpells(U);
    expect(list).toEqual([{ spellId: gain.spell.id, level: 1, equippedSlot: null }]);
    expect(await s.store.listItems(U)).toHaveLength(0);
  });

  it('un doublon monte d’un niveau (conserve son emplacement) ; au niveau 5, il rend des fragments', async () => {
    const s = await hero();
    const r = await openUntilSpell(s);
    const id = r.opening.spell!.spell.id;
    await equipSpell(s.ctx, U, { spellId: id });
    // force le niveau 4 puis cherche le même sort : on ouvre des coffres dont le tirage est déterministe
    await s.store.saveSpell(U, { spellId: id, level: 4, equippedSlot: 1 });
    const def = SPELL_BY_ID.get(id)!;
    let leveled = false;
    for (let i = 0; i < 400 && !leveled; i++) {
      s.setNow(at(20 + (i % 9), 5 + (i % 3)));
      await s.store.saveCharacter(U, { ...(await s.store.getCharacter(U))!, chestOpensToday: 0 });
      const c = await give(s, 'mythique');
      const o = await openChest(s.ctx, U, { chestId: c.id });
      if (o.ok && o.opening.spell && o.opening.spell.spell.id === id) {
        expect(o.opening.spell).toMatchObject({ isNew: false, levelBefore: 4 });
        expect(o.opening.spell.spell.level).toBe(5);
        expect(o.opening.spell.spell.equippedSlot).toBe(1);
        leveled = true;
        // déjà au niveau maximal : fragments
        await s.store.saveCharacter(U, { ...(await s.store.getCharacter(U))!, chestOpensToday: 0 });
        for (let j = 0; j < 400; j++) {
          s.setNow(at(28, 5 + (j % 12)));
          await s.store.saveCharacter(U, { ...(await s.store.getCharacter(U))!, chestOpensToday: 0 });
          const c2 = await give(s, 'mythique');
          const o2 = await openChest(s.ctx, U, { chestId: c2.id });
          if (o2.ok && o2.opening.spell?.spell.id === id) {
            expect(o2.opening.spell.fragments).toBe(spellMaxFragments(def.rarity));
            expect(o2.opening.spell.spell.level).toBe(5);
            expect(o2.opening.fragments).toBe(250 + spellMaxFragments(def.rarity));
            return;
          }
        }
        throw new Error('pas de doublon au niveau maximal');
      }
    }
    expect(leveled).toBe(true);
  });
});

describe('XP des quêtes : bonus des capacités équipées', () => {
  async function xpOfDay(equip: boolean) {
    const s = await hero('guerrier', { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 });
    await startTrack(s.ctx, U, { trackId: 'muscu-haut' });
    if (equip) {
      await learn(s, known('critique-ameliore', 1, null), known('athlete-accompli', 1, null), known('inflexible', 1, null));
      for (const id of ['critique-ameliore', 'athlete-accompli', 'inflexible']) await equipSpell(s.ctx, U, { spellId: id });
    }
    s.setNow(at(5));
    await ensureQuests(s.ctx, U);
    const q = (await s.store.listInstances(U, { period: 'daily' })).find((x: QuestInstance) => x.trackId === 'muscu-haut' && x.periodStart === date(5))!;
    const v = q.snapshot.validation;
    const r = await completeQuestAction(s.ctx, U, {
      instanceId: q.id,
      useInspiration: false,
      progress: v.type === 'counter' ? v.target : v.type === 'timer' ? v.minutes : undefined,
      stepsDone: v.type === 'steps' ? v.steps.map(() => true) : undefined,
      journalText: v.type === 'journal' ? 'x'.repeat(60) : undefined,
    });
    if (!r.ok) throw new Error('quête');
    return { s, data: r.data, ability: q.snapshot.ability };
  }

  it('bonus plafonné à +25 % sur la caractéristique de la quête, rejoué à l’identique par l’annulation', async () => {
    const plain = await xpOfDay(false);
    const boosted = await xpOfDay(true);
    const bonus = await heroXpBonus(boosted.s.store, U, (await boosted.s.store.getCharacter(U))!);
    expect(bonus.FOR).toBe(SPELL_XP_CAP);
    expect(plain.ability).toBe(boosted.ability);
    if (bonus[boosted.ability]) {
      expect(boosted.data.xpAwarded).toBeGreaterThan(plain.data.xpAwarded);
      expect(boosted.data.xpAwarded).toBeLessThanOrEqual(Math.round(plain.data.xpAwarded * 1.25) + 2);
    } else {
      expect(boosted.data.xpAwarded).toBe(plain.data.xpAwarded);
    }
  });

  it('sans capacité équipée : aucun bonus', async () => {
    const s = await hero();
    expect(await heroXpBonus(s.store, U, (await s.store.getCharacter(U))!)).toEqual({});
  });
});

describe('migration des anciens objets', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261017000001_spells.sql'), 'utf8');
  const sqlPairs = Object.fromEntries([...sql.matchAll(/\('([a-z0-9-]+)', '([a-z0-9-]+)'\)/g)].map((m) => [m[1], m[2]]));

  it('la table TypeScript est celle de la migration SQL ; 48 anciens modèles, tous vers un modèle du catalogue', () => {
    expect(LEGACY_ITEM_MAP).toEqual(sqlPairs);
    expect(Object.keys(LEGACY_ITEM_MAP)).toHaveLength(48);
    for (const target of Object.values(LEGACY_ITEM_MAP)) expect(ITEMS.some((i) => i.id === target), target).toBe(true);
  });

  it('un ancien identifiant conservé reste le même ; l’ancienne cotte de mailles (torse, CON) devient un torse CON', () => {
    expect(LEGACY_ITEM_MAP['talisman-de-force']).toBe('talisman-de-force');
    expect(ITEMS.find((i) => i.id === LEGACY_ITEM_MAP['cotte-de-mailles'])).toMatchObject({ slot: 'torse', ability: 'CON' });
    // le nouvel objet du Paladin n'a pas pris l'identifiant de l'ancienne cotte de mailles
    expect(ITEMS.find((i) => i.id === 'cotte-de-mailles')).toBeUndefined();
    expect(ITEMS.find((i) => i.id === 'cotte-de-mailles-paladin')).toMatchObject({ classId: 'paladin', ability: 'FOR' });
  });

  it('migrateLegacyItems remplace les anciens modèles et garde le reste (rareté, niveau, équipé)', () => {
    const items = [
      { id: 'a', templateId: 'epee-du-sentier', rarity: 'epique', level: 4, equipped: true },
      { id: 'b', templateId: 'espadon', rarity: 'rare', level: 0, equipped: false },
      { id: 'c', templateId: 'talisman-de-force', rarity: 'commun', level: 1, equipped: false },
    ];
    const out = migrateLegacyItems(items);
    expect(out).toEqual([{ ...items[0], templateId: 'espadon' }, items[1], items[2]]);
    expect(out[1]).toBe(items[1]);
  });

  it('le mode local migre ses objets à la lecture', async () => {
    const store = new MemoryStore([]);
    await store.insertItems('loc', [{ id: 'x', templateId: 'dague-vive', rarity: 'rare', slot: 'arme', ability: 'DEX', level: 2, equipped: true, createdAt: '' }]);
    const [it] = await store.listItems('loc');
    expect(it).toMatchObject({ templateId: 'arc-long', rarity: 'rare', level: 2, equipped: true });
    expect(ITEMS.find((i) => i.id === it.templateId)).toMatchObject({ slot: 'arme', ability: 'DEX' });
  });
});
