import classesJson from '../../../content/data/classes.fr.json';
import dungeonsJson from '../../../content/data/dungeons.fr.json';
import itemsJson from '../../../content/data/items.fr.json';
import {
  CHEST_OPENS_PER_DAY,
  EXPEDITION_CAP_HOURS,
  EXPEDITION_MIN_CLAIM_MS,
  ITEM_MAX_LEVEL,
  MAX_KEYS,
  MERGE_COUNT,
  DAILY_FREE_CHEST,
  dailyChestRarity,
  dismantleValue,
  drawChest,
  dungeonBossChest,
  dungeonBossPower,
  dungeonRoomPower,
  expeditionYield,
  hasAffinity,
  itemAbilityBonus,
  itemPower,
  nextChestRarity,
  nextItemRarity,
  pickTemplateForSlot,
  resolveDungeon,
  spellMaxFragments,
  rollExpeditionKey,
  rungChestRarity,
  streakMilestoneChest,
  streakMultiplier,
  upgradeCost,
  DUNGEON_BOSS_ROOM,
  DUNGEON_ROOMS,
  type DungeonRunResult,
  type ExpeditionYield,
} from '../adventure';
import { gameDate } from '../dates';
import { ClassDef, masteriesOf } from '../content-types';
import { setsProgress, type SetProgress } from '../sets';
import { freeSpellSlot, nextSpellLevel, spellEffectLabel, spellEffectPoints, type SpellBonuses } from '../spells';
import {
  AbilityId,
  CHEST_RARITIES,
  Chest,
  ChestPity,
  ChestRarity,
  ChestSource,
  DungeonDef,
  DungeonProgress,
  EQUIP_SLOTS,
  EquipSlot,
  InventoryItem,
  ItemDef,
  ItemRarity,
  SPELL_MAX_LEVEL,
  SPELL_SLOTS,
  SpellDef,
  SpellKnown,
} from '../types';
import type { GameError, Result } from './game';
import { SETS, SPELL_BY_ID, SPELL_DEFS, buildSnapshot, withItemClass, type HeroSnapshot } from './hero-stats';
import { evaluateSeasons, recordPower, type SeasonResultView } from './season-game';
import type { CharacterRecord, GameStore, ServerContext, SettingsRecord } from './types';

export const ITEMS = itemsJson as unknown as ItemDef[];
export const DUNGEONS = dungeonsJson as unknown as DungeonDef[];
const CLASSES = classesJson as unknown as ClassDef[];

const fail = (error: GameError, message?: string) => ({ ok: false as const, error, message });

// ───────────────────────── Aides ─────────────────────────

interface AdvEnv {
  ctx: ServerContext;
  userId: string;
  character: CharacterRecord;
  settings: SettingsRecord;
  nowMs: number;
  nowIso: string;
  today: string;
  masteries: AbilityId[];
  /** Classe du héros (affinité des objets et des capacités) */
  classId: string;
}

async function loadAdv(ctx: ServerContext, userId: string): Promise<AdvEnv | null> {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return null;
  const nowMs = ctx.now();
  return {
    ctx,
    userId,
    character,
    settings,
    nowMs,
    nowIso: new Date(nowMs).toISOString(),
    today: gameDate(nowMs, settings.timezone, settings.resetHour),
    masteries: masteriesOf(CLASSES, character.classId),
    classId: character.classId,
  };
}

/** Objet avec les valeurs calculées utiles à l'affichage. */
export interface ItemView extends InventoryItem {
  /** Panoplie dont l'objet est une pièce (null : hors set) */
  setId: string | null;
  /** PP de l'objet (niveau et affinité de classe compris) */
  power: number;
  /** Classe du modèle (null : objet universel) */
  classId: string | null;
  /** Objet de la classe du héros : +20 % de PP */
  affinity: boolean;
  /** Bonus de score d'aventure donné à `ability` */
  abilityBonus: number;
  /** Coût de l'amélioration suivante, `null` au niveau maximal */
  upgradeCost: { fragments: number; gold: number } | null;
  /** Fragments rendus par le démontage */
  dismantleValue: number;
}

const SET_OF = new Map<string, string>(ITEMS.filter((i) => i.setId).map((i) => [i.id, i.setId as string]));

function viewOf(raw: InventoryItem, heroClassId: string): ItemView {
  const [item] = withItemClass([raw]);
  return {
    ...item,
    classId: item.classId ?? null,
    affinity: hasAffinity(item, heroClassId),
    setId: SET_OF.get(item.templateId) ?? null,
    power: itemPower(item, heroClassId),
    abilityBonus: itemAbilityBonus(item, heroClassId),
    upgradeCost: upgradeCost(item.level),
    dismantleValue: dismantleValue(item.rarity),
  };
}

/** Ouvertures de coffres déjà faites ce jour de jeu. */
const opensToday = (c: Pick<CharacterRecord, 'chestOpensDate' | 'chestOpensToday'>, today: string): number =>
  c.chestOpensDate === today ? c.chestOpensToday : 0;

/** Début de l'expédition en cours (la date manquante ou invalide repart d'aujourd'hui). */
function expeditionStart(env: AdvEnv): number {
  const ms = Date.parse(env.character.expeditionStartedAt ?? '');
  return Number.isNaN(ms) ? env.nowMs : Math.min(ms, env.nowMs);
}

type Snapshot = HeroSnapshot;

async function snapshot(env: AdvEnv, knownItems?: InventoryItem[]): Promise<Snapshot> {
  const [items, spells] = await Promise.all([knownItems ?? env.ctx.store.listItems(env.userId), env.ctx.store.listSpells(env.userId)]);
  return buildSnapshot(env.character, items, spells);
}

/** Après un changement d'équipement : recalcule la puissance et la publie (carte de compagnon, classement de saison). */
async function syncGear(env: AdvEnv, character: CharacterRecord = env.character): Promise<CharacterRecord> {
  const snap = await snapshot({ ...env, character });
  return recordPower(env.ctx, env.userId, character, snap.power.total, env.today);
}

// ───────────────────────── État de l'aventure ─────────────────────────

export interface ExpeditionState extends ExpeditionYield {
  startedAt: string;
  capHours: number;
  /** Bonus de série appliqué (1 = aucun) */
  streakMultiplier: number;
  /** Il y a quelque chose à réclamer */
  claimable: boolean;
}

export interface AdventureState {
  today: string;
  /** Puissance totale (PP) et son détail */
  power: number;
  powerBreakdown: { level: number; scores: number; items: number; sets: number; spells: number };
  /** Scores d'aventure (scores du personnage + bonus des objets équipés) */
  scores: Record<AbilityId, number>;
  gold: number;
  fragments: number;
  keys: number;
  maxKeys: number;
  expedition: ExpeditionState;
  /** Coffres fermés, du plus ancien au plus récent */
  chests: Chest[];
  chestCounts: Record<ChestRarity, number>;
  opens: { today: number; max: number; remaining: number };
  pity: ChestPity;
  items: ItemView[];
  /** Objet équipé par emplacement (id de l'objet) */
  equipped: Partial<Record<EquipSlot, string>>;
  /** Panoplies : pièces possédées et équipées, palier actif et suivant */
  sets: SetProgress[];
  /** Bonus total des panoplies équipées (PP et scores) */
  setBonus: { pp: number; abilities: Partial<Record<AbilityId, number>> };
  /** Grimoire (V4) : capacités connues, emplacements (3) et bonus actifs (plafonnés) */
  grimoire: GrimoireState;
  /** Classe du héros : l'affinité donne +20 % de PP aux objets de sa classe, +25 % d'effet à ses capacités */
  heroClass: string;
  /** Saisons terminées évaluées par cette lecture (récompense versée une seule fois : à annoncer) */
  seasonEvaluated: SeasonResultView[];
}

/** Capacité connue, avec ses valeurs calculées pour l'affichage. */
export interface SpellView {
  id: string;
  classId: string;
  rarity: ItemRarity;
  family: SpellDef['family'];
  ability: SpellDef['ability'];
  level: number;
  maxLevel: number;
  /** Emplacement du Grimoire (1 à 3), null si la capacité n'est pas équipée */
  equippedSlot: number | null;
  /** Capacité de la classe du héros : +25 % d'effet */
  ownClass: boolean;
  /** Points d'effet (rareté, niveau et classe compris) */
  points: number;
  /** Effet en une phrase, ex. « +13 % d'XP en Force » */
  effect: string;
}

export interface GrimoireState {
  slots: number;
  /** Id de la capacité équipée à chaque emplacement (index 0 = emplacement 1), null si libre */
  equipped: (string | null)[];
  spells: SpellView[];
  /** Bonus actifs des capacités équipées, déjà plafonnés */
  bonus: Pick<SpellBonuses, 'pp' | 'xp' | 'stats' | 'raid' | 'gold' | 'chest' | 'dungeon'>;
}

function spellViewOf(k: SpellKnown, heroClassId: string): SpellView | null {
  const def = SPELL_BY_ID.get(k.spellId);
  if (!def) return null;
  const ownClass = def.classId === heroClassId;
  const points = spellEffectPoints(def.rarity, k.level, ownClass);
  return {
    id: def.id,
    classId: def.classId,
    rarity: def.rarity,
    family: def.family,
    ability: def.ability,
    level: k.level,
    maxLevel: SPELL_MAX_LEVEL,
    equippedSlot: k.equippedSlot,
    ownClass,
    points,
    effect: spellEffectLabel(def, points),
  };
}

function grimoireOf(snap: Snapshot, heroClassId: string): GrimoireState {
  const spells = snap.spells.map((k) => spellViewOf(k, heroClassId)).filter((x): x is SpellView => !!x);
  const equipped: (string | null)[] = Array.from({ length: SPELL_SLOTS }, (_, i) => spells.find((x) => x.equippedSlot === i + 1)?.id ?? null);
  const { pp, xp, stats, raid, gold, chest, dungeon } = snap.spellBonus;
  return { slots: SPELL_SLOTS, equipped, spells, bonus: { pp, xp, stats, raid, gold, chest, dungeon } };
}

function expeditionOf(env: AdvEnv, snap: Snapshot): ExpeditionState {
  const startMs = expeditionStart(env);
  const y = expeditionYield({
    pp: snap.power.total,
    scores: snap.scores,
    streak: env.character.streakCurrent,
    elapsedMs: env.nowMs - startMs,
    goldBonusPct: snap.spellBonus.gold,
  });
  return {
    ...y,
    startedAt: new Date(startMs).toISOString(),
    capHours: EXPEDITION_CAP_HOURS,
    streakMultiplier: streakMultiplier(env.character.streakCurrent),
    claimable: env.nowMs - startMs >= EXPEDITION_MIN_CLAIM_MS,
  };
}

async function stateOf(env: AdvEnv): Promise<AdventureState> {
  const [snap, chests] = await Promise.all([snapshot(env), env.ctx.store.listChests(env.userId, { opened: false })]);
  const counts = Object.fromEntries(CHEST_RARITIES.map((r) => [r, 0])) as Record<ChestRarity, number>;
  for (const c of chests) counts[c.rarity]++;
  const used = opensToday(env.character, env.today);
  const equipped: AdventureState['equipped'] = {};
  for (const it of snap.equipped) equipped[it.slot] = it.id;
  return {
    today: env.today,
    power: snap.power.total,
    powerBreakdown: { level: snap.power.level, scores: snap.power.scores, items: snap.power.items, sets: snap.power.sets, spells: snap.power.spells },
    scores: snap.scores,
    gold: env.character.gold,
    fragments: env.character.fragments,
    keys: env.character.keys,
    maxKeys: MAX_KEYS,
    expedition: expeditionOf(env, snap),
    chests,
    chestCounts: counts,
    opens: { today: used, max: CHEST_OPENS_PER_DAY, remaining: Math.max(0, CHEST_OPENS_PER_DAY - used) },
    pity: env.character.chestPity,
    items: snap.items.map((i) => viewOf(i, env.classId)),
    equipped,
    sets: setsProgress(SETS, snap.items),
    setBonus: { pp: snap.setBonus.pp, abilities: snap.setBonus.abilities },
    grimoire: grimoireOf(snap, env.classId),
    heroClass: env.classId,
    seasonEvaluated: [],
  };
}

/** État complet de l'aventure : puissance, expédition, coffres, inventaire, ressources, plafond d'ouverture. */
export async function getAdventureState(ctx: ServerContext, userId: string): Promise<Result<{ state: AdventureState; character: CharacterRecord }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  // L'expédition est toujours en cours : un personnage créé avant l'aventure la démarre à sa première lecture.
  if (!env.character.expeditionStartedAt) {
    env.character = { ...env.character, expeditionStartedAt: env.nowIso };
    await ctx.store.saveCharacter(userId, env.character);
  }
  // Fin de saison : récompense versée à la première lecture après la clôture (idempotent), puis puissance publiée.
  const season = await evaluateSeasons(ctx, userId, env.character, env.today, env.settings);
  env.character = season.character;
  // Coffre quotidien offert : un coffre de bois par jour de jeu, à la première lecture (idempotent : clé = jour).
  await ctx.store.insertChest(userId, newChest(env, DAILY_FREE_CHEST, 'daily', env.today));
  const state: AdventureState = { ...(await stateOf(env)), seasonEvaluated: season.evaluated };
  env.character = await recordPower(ctx, userId, env.character, state.power, env.today);
  return { ok: true, state, character: env.character };
}

// ───────────────────────── Expédition ─────────────────────────

export interface ExpeditionClaim {
  gold: number;
  fragments: number;
  hours: number;
  capped: boolean;
  /** Une Clé a été gagnée */
  keyGained: boolean;
}

/** Réclame l'expédition : or, fragments et, parfois, une Clé ; le compteur repart d'aujourd'hui. */
export async function claimExpedition(ctx: ServerContext, userId: string): Promise<Result<{ claim: ExpeditionClaim; character: CharacterRecord }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  const startMs = expeditionStart(env);
  if (env.nowMs - startMs < EXPEDITION_MIN_CLAIM_MS) return fail('nothing-pending', 'Ton expédition vient de partir : reviens plus tard.');
  const snap = await snapshot(env);
  const y = expeditionOf(env, snap);
  const keyGained = env.character.keys < MAX_KEYS && rollExpeditionKey(`${userId}|exp|${new Date(startMs).toISOString()}`, y.keyChance);
  const character: CharacterRecord = {
    ...env.character,
    gold: env.character.gold + y.gold,
    fragments: env.character.fragments + y.fragments,
    keys: Math.min(MAX_KEYS, env.character.keys + (keyGained ? 1 : 0)),
    expeditionStartedAt: env.nowIso,
  };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, claim: { gold: y.gold, fragments: y.fragments, hours: y.hours, capped: y.capped, keyGained }, character };
}

// ───────────────────────── Coffres ─────────────────────────

const newChest = (env: Pick<AdvEnv, 'ctx' | 'nowIso'>, rarity: ChestRarity, source: ChestSource, sourceKey: string, instanceId: string | null = null): Chest => ({
  id: env.ctx.uuid(),
  rarity,
  source,
  sourceKey,
  instanceId,
  createdAt: env.nowIso,
  openedAt: null,
});

/** Capacité obtenue dans un coffre : nouvelle, niveau supplémentaire, ou fragments au niveau maximal. */
export interface SpellGain {
  spell: SpellView;
  /** Première fois que le joueur obtient cette capacité */
  isNew: boolean;
  /** Niveau avant l'ouverture (0 : nouvelle) */
  levelBefore: number;
  /** Fragments rendus quand la capacité était déjà au niveau maximal (0 sinon) */
  fragments: number;
}

export interface ChestOpening {
  chest: Chest;
  /** Objet obtenu (null quand le coffre donne une capacité) */
  item: ItemView | null;
  /** Capacité obtenue (null quand le coffre donne un objet) */
  spell: SpellGain | null;
  gold: number;
  fragments: number;
  /** La pitié a imposé la rareté de l'objet */
  guaranteed: 'epique' | 'legendaire' | null;
  opensToday: number;
}

/** Ouvre un coffre (2 par jour de jeu au maximum) : 1 objet, des fragments, de l'or. */
export async function openChest(ctx: ServerContext, userId: string, input: { chestId: string }): Promise<Result<{ opening: ChestOpening; character: CharacterRecord }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  const chests = await ctx.store.listChests(userId);
  const chest = chests.find((c) => c.id === input.chestId);
  if (!chest) return fail('not-found', 'Coffre introuvable.');
  if (chest.openedAt) return fail('not-found', 'Ce coffre est déjà ouvert.');
  const used = opensToday(env.character, env.today);
  if (used >= CHEST_OPENS_PER_DAY) return fail('daily-cap', `Tu as déjà ouvert ${CHEST_OPENS_PER_DAY} coffres aujourd’hui : reviens demain.`);
  const snap = await snapshot(env);
  const draw = drawChest({
    chest: chest.rarity,
    sag: snap.scores.SAG,
    pity: env.character.chestPity,
    // Graine : profil + compteur d'ouvertures (déterministe pour les tests).
    seed: `${userId}|chest|${chests.filter((c) => c.openedAt).length}`,
    templates: ITEMS,
    spells: SPELL_DEFS,
    classId: env.classId,
    chestShift: snap.spellBonus.chest,
  });
  // Ouverture atomique : un double appel ne donne qu'un seul objet.
  if (!(await ctx.store.markChestOpened(userId, chest.id, env.nowIso))) return fail('not-found', 'Ce coffre est déjà ouvert.');
  let item: InventoryItem | null = null;
  let spell: SpellGain | null = null;
  let extraFragments = 0;
  if (draw.template) {
    item = {
      id: ctx.uuid(),
      templateId: draw.template.id,
      rarity: draw.rarity,
      slot: draw.template.slot,
      ability: draw.template.ability,
      level: 0,
      equipped: false,
      createdAt: env.nowIso,
    };
    await ctx.store.insertItems(userId, [item]);
  } else if (draw.spell) {
    // Capacité déjà connue : +1 niveau (max 5), au-delà des fragments. Nouvelle : niveau 1, non équipée.
    const known = snap.spells.find((k) => k.spellId === draw.spell!.id);
    const before = known?.level ?? 0;
    const next = known ? nextSpellLevel(known.level) : 1;
    if (next === null) extraFragments = spellMaxFragments(draw.spell.rarity);
    const after: SpellKnown = { spellId: draw.spell.id, level: next ?? SPELL_MAX_LEVEL, equippedSlot: known?.equippedSlot ?? null };
    if (next !== null) await ctx.store.saveSpell(userId, after);
    spell = { spell: spellViewOf(after, env.classId)!, isNew: !known, levelBefore: before, fragments: extraFragments };
  }
  const character: CharacterRecord = {
    ...env.character,
    gold: env.character.gold + draw.gold,
    fragments: env.character.fragments + draw.fragments + extraFragments,
    chestPity: draw.pity,
    chestOpensDate: env.today,
    chestOpensToday: used + 1,
  };
  await ctx.store.saveCharacter(userId, character);
  const synced = spell && spell.spell.equippedSlot !== null ? await syncGear(env, character) : character;
  return {
    ok: true,
    opening: {
      chest: { ...chest, openedAt: env.nowIso },
      item: item ? viewOf(item, env.classId) : null,
      spell,
      gold: draw.gold,
      fragments: draw.fragments + extraFragments,
      guaranteed: draw.guaranteed,
      opensToday: used + 1,
    },
    character: synced,
  };
}

/** Fusion : 3 coffres fermés de même rareté donnent 1 coffre de rareté supérieure (instantané, hors plafond d'ouverture). */
export async function mergeChests(ctx: ServerContext, userId: string, input: { rarity: ChestRarity }): Promise<Result<{ chest: Chest }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  if (!CHEST_RARITIES.includes(input.rarity)) return fail('invalid', 'Rareté de coffre inconnue.');
  const next = nextChestRarity(input.rarity);
  if (!next) return fail('invalid', 'Un coffre mythique ne peut pas être fusionné.');
  const pool = (await ctx.store.listChests(userId, { opened: false })).filter((c) => c.rarity === input.rarity);
  if (pool.length < MERGE_COUNT) return fail('insufficient', `Il faut ${MERGE_COUNT} coffres de même rareté pour les fusionner.`);
  // Les coffres fusionnés sont marqués consommés (et non supprimés) : leur clé d'idempotence reste prise, aucune quête n'en redonne un.
  for (const c of pool.slice(0, MERGE_COUNT)) {
    if (!(await ctx.store.markChestOpened(userId, c.id, env.nowIso))) return fail('not-found', 'Un des coffres a déjà été utilisé.');
  }
  const chest = newChest(env, next, 'merge', ctx.uuid());
  await ctx.store.insertChest(userId, chest);
  return { ok: true, chest };
}

// ───────────────────────── Attribution des coffres de quête ─────────────────────────

export interface QuestChestInput {
  store: GameStore;
  userId: string;
  uuid: () => string;
  nowIso: string;
  instanceId: string;
  /** Jour de jeu de la validation */
  completedDay: string;
  /** La quête validée est celle d'un parcours (origine `track`) */
  isTrackQuest: boolean;
  /** La quête validée est quotidienne */
  isDaily: boolean;
  /** Série après / avant cette validation */
  streak: number;
  prevStreak: number;
  /** Promotion d'échelon provoquée par cette validation */
  promotion?: { trackId: string; rung: number };
  character: CharacterRecord;
}

/**
 * Attribue les coffres (et Clés) gagnés par une validation, de façon idempotente (clé = source + clé) :
 * 1re quête de parcours du jour, promotion d'échelon (+1 Clé), jalon de série 7 / 30 / 100 jours (+1 Clé).
 */
export async function grantQuestChests(i: QuestChestInput): Promise<{ character: CharacterRecord; chests: Chest[]; keysGained: number }> {
  const chests: Chest[] = [];
  let keysGained = 0;
  const mk = (rarity: ChestRarity, source: ChestSource, sourceKey: string): Chest => ({
    id: i.uuid(),
    rarity,
    source,
    sourceKey,
    instanceId: i.instanceId,
    createdAt: i.nowIso,
    openedAt: null,
  });
  const give = async (chest: Chest, key: boolean) => {
    if (await i.store.insertChest(i.userId, chest)) {
      chests.push(chest);
      if (key) keysGained++;
    }
  };
  if (i.isTrackQuest && i.isDaily) await give(mk(dailyChestRarity(i.streak), 'quest', i.completedDay), false);
  if (i.promotion) await give(mk(rungChestRarity(i.promotion.rung), 'rung', `${i.promotion.trackId}:${i.promotion.rung}`), true);
  if (i.isDaily && i.streak > i.prevStreak) {
    const rarity = streakMilestoneChest(i.streak);
    if (rarity) await give(mk(rarity, 'streak', `${i.streak}:${i.completedDay}`), true);
  }
  const keys = Math.min(MAX_KEYS, i.character.keys + keysGained);
  return { character: keys === i.character.keys ? i.character : { ...i.character, keys }, chests, keysGained: keys - i.character.keys };
}

/**
 * Annulation d'une quête : retire les coffres qu'elle avait donnés tant qu'ils ne sont pas ouverts.
 * Retourne le nombre de Clés à retirer (échelon et jalon de série).
 */
export async function revokeQuestChests(store: GameStore, userId: string, instanceId: string): Promise<{ removed: number; keysLost: number }> {
  const mine = (await store.listChests(userId, { opened: false })).filter((c) => c.instanceId === instanceId);
  if (!mine.length) return { removed: 0, keysLost: 0 };
  await store.deleteChests(userId, mine.map((c) => c.id));
  return { removed: mine.length, keysLost: mine.filter((c) => c.source === 'rung' || c.source === 'streak').length };
}

// ───────────────────────── Équipement ─────────────────────────

const itemNotFound = () => fail('not-found', 'Objet introuvable.');

/** Équipe un objet ; il remplace celui de son emplacement. */
export async function equipItem(ctx: ServerContext, userId: string, input: { itemId: string }): Promise<Result<{ item: ItemView; replaced: string | null }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  const items = await ctx.store.listItems(userId);
  const item = items.find((i) => i.id === input.itemId);
  if (!item) return itemNotFound();
  if (item.equipped) return { ok: true, item: viewOf(item, env.classId), replaced: null };
  const current = items.find((i) => i.slot === item.slot && i.equipped);
  // Retirer d'abord : un seul objet équipé par emplacement (index unique en base).
  if (current) await ctx.store.updateItem(userId, current.id, { equipped: false });
  await ctx.store.updateItem(userId, item.id, { equipped: true });
  await syncGear(env);
  return { ok: true, item: viewOf({ ...item, equipped: true }, env.classId), replaced: current?.id ?? null };
}

/** Retire l'objet équipé d'un emplacement. */
export async function unequipSlot(ctx: ServerContext, userId: string, input: { slot: EquipSlot }): Promise<Result<{ item: ItemView }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  if (!EQUIP_SLOTS.includes(input.slot)) return fail('invalid', 'Emplacement inconnu.');
  const current = (await ctx.store.listItems(userId)).find((i) => i.slot === input.slot && i.equipped);
  if (!current) return fail('not-found', 'Aucun objet équipé à cet emplacement.');
  await ctx.store.updateItem(userId, current.id, { equipped: false });
  await syncGear(env);
  return { ok: true, item: viewOf({ ...current, equipped: false }, env.classId) };
}

/** Améliore un objet d'un niveau : `5 × (niveau + 1)` fragments et `100 × (niveau + 1)^1,5` or. */
export async function upgradeItem(ctx: ServerContext, userId: string, input: { itemId: string }): Promise<Result<{ item: ItemView; character: CharacterRecord }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  const item = (await ctx.store.listItems(userId)).find((i) => i.id === input.itemId);
  if (!item) return itemNotFound();
  const cost = upgradeCost(item.level);
  if (!cost) return fail('invalid', `Cet objet est déjà au niveau maximal (${ITEM_MAX_LEVEL}).`);
  if (env.character.fragments < cost.fragments || env.character.gold < cost.gold) {
    return fail('insufficient', `Il faut ${cost.fragments} fragments et ${cost.gold} or pour améliorer cet objet.`);
  }
  const character: CharacterRecord = { ...env.character, fragments: env.character.fragments - cost.fragments, gold: env.character.gold - cost.gold };
  await ctx.store.saveCharacter(userId, character);
  await ctx.store.updateItem(userId, item.id, { level: item.level + 1 });
  const synced = item.equipped ? await syncGear(env, character) : character;
  return { ok: true, item: viewOf({ ...item, level: item.level + 1 }, env.classId), character: synced };
}

/** Forge : 3 objets non équipés de même rareté donnent 1 objet de rareté supérieure, à l'emplacement du premier. */
export async function mergeItems(ctx: ServerContext, userId: string, input: { itemIds: string[] }): Promise<Result<{ item: ItemView }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  const ids = [...new Set(input.itemIds ?? [])];
  if (ids.length !== MERGE_COUNT || (input.itemIds ?? []).length !== MERGE_COUNT) return fail('invalid', `Choisis exactement ${MERGE_COUNT} objets différents.`);
  const items = await ctx.store.listItems(userId);
  const chosen = ids.map((id) => items.find((i) => i.id === id));
  if (chosen.some((i) => !i)) return itemNotFound();
  const picked = chosen as InventoryItem[];
  if (picked.some((i) => i.equipped)) return fail('invalid', 'Un objet équipé ne peut pas être fusionné.');
  const rarity: ItemRarity = picked[0].rarity;
  if (picked.some((i) => i.rarity !== rarity)) return fail('invalid', 'Les 3 objets doivent avoir la même rareté.');
  const next = nextItemRarity(rarity);
  if (!next) return fail('invalid', 'Un objet légendaire ne peut pas être fusionné.');
  const template = pickTemplateForSlot(ITEMS, picked[0].slot, `${userId}|${ids.join(',')}`, env.classId);
  if (!template) return fail('invalid', 'Aucun modèle d’objet pour cet emplacement.');
  await ctx.store.deleteItems(userId, ids);
  const item: InventoryItem = {
    id: ctx.uuid(),
    templateId: template.id,
    rarity: next,
    slot: template.slot,
    ability: template.ability,
    level: 0,
    equipped: false,
    createdAt: env.nowIso,
  };
  await ctx.store.insertItems(userId, [item]);
  return { ok: true, item: viewOf(item, env.classId) };
}

/** Démonte un objet non équipé contre des fragments (2, 5, 12, 30 ou 80 selon la rareté). */
export async function dismantleItem(ctx: ServerContext, userId: string, input: { itemId: string }): Promise<Result<{ fragments: number; character: CharacterRecord }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  const item = (await ctx.store.listItems(userId)).find((i) => i.id === input.itemId);
  if (!item) return itemNotFound();
  if (item.equipped) return fail('invalid', 'Retire cet objet avant de le démonter.');
  const fragments = dismantleValue(item.rarity);
  await ctx.store.deleteItems(userId, [item.id]);
  const character: CharacterRecord = { ...env.character, fragments: env.character.fragments + fragments };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, fragments, character };
}

// ───────────────────────── Donjons ─────────────────────────

export interface DungeonEntry {
  dungeon: DungeonDef;
  /** Niveau du personnage suffisant */
  unlocked: boolean;
  /** Meilleure salle franchie : 0..5, 6 = boss vaincu */
  bestRoom: number;
  bossDefeatedTier: number;
  lastRunDate: string | null;
  /** Puissance requise de chaque salle, puis du boss */
  roomPowers: number[];
  bossPower: number;
  /** Coffre promis par la première victoire sur le boss, et déjà obtenu ou non */
  bossChest: ChestRarity;
  bossChestClaimed: boolean;
}

/** Donjons, palier débloqué et meilleur résultat. */
export async function listDungeons(
  ctx: ServerContext,
  userId: string,
): Promise<Result<{ dungeons: DungeonEntry[]; keys: number; maxKeys: number; power: number }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  const [progress, snap] = await Promise.all([ctx.store.listDungeonProgress(userId), snapshot(env)]);
  const dungeons = DUNGEONS.map((d): DungeonEntry => {
    const p = progress.find((x) => x.dungeonId === d.id);
    return {
      dungeon: d,
      unlocked: env.character.level >= d.unlockLevel,
      bestRoom: p?.bestRoom ?? 0,
      bossDefeatedTier: p?.bossDefeatedTier ?? 0,
      lastRunDate: p?.lastRunDate ?? null,
      roomPowers: Array.from({ length: DUNGEON_ROOMS }, (_, i) => dungeonRoomPower(d.tier, i)),
      bossPower: dungeonBossPower(d.tier),
      bossChest: dungeonBossChest(d.tier),
      bossChestClaimed: (p?.bossDefeatedTier ?? 0) >= d.tier,
    };
  });
  return { ok: true, dungeons, keys: env.character.keys, maxKeys: MAX_KEYS, power: snap.power.total };
}

/** Lance une run (1 Clé) : résolue côté serveur, de façon déterministe. */
export async function runDungeon(
  ctx: ServerContext,
  userId: string,
  input: { dungeonId: string },
): Promise<Result<{ result: DungeonRunResult; progress: DungeonProgress; chest: Chest | null; character: CharacterRecord }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  const dungeon = DUNGEONS.find((d) => d.id === input.dungeonId);
  if (!dungeon) return fail('not-found', 'Donjon inconnu.');
  if (env.character.level < dungeon.unlockLevel) return fail('level-too-low', `Ce donjon s’ouvre au niveau ${dungeon.unlockLevel}.`);
  if (env.character.keys < 1) return fail('no-key', 'Il te faut une Clé de donjon.');
  const [progressList, snap] = await Promise.all([ctx.store.listDungeonProgress(userId), snapshot(env)]);
  const before = progressList.find((p) => p.dungeonId === dungeon.id) ?? { dungeonId: dungeon.id, bestRoom: 0, bossDefeatedTier: 0, lastRunDate: null };
  const result = resolveDungeon({
    dungeon,
    pp: snap.power.total,
    scores: snap.scores,
    firstBossVictory: before.bossDefeatedTier < dungeon.tier,
    seed: `${userId}|${dungeon.id}|${env.today}|${env.character.keys}`,
    conBonusPct: snap.spellBonus.dungeon,
  });
  let chest: Chest | null = null;
  if (result.chest) {
    const c = newChest(env, result.chest, 'dungeon', dungeon.id);
    if (await ctx.store.insertChest(userId, c)) chest = c;
  }
  const progress: DungeonProgress = {
    dungeonId: dungeon.id,
    bestRoom: Math.max(before.bestRoom, result.bossDefeated ? DUNGEON_BOSS_ROOM : result.reachedRoom),
    bossDefeatedTier: result.bossDefeated ? Math.max(before.bossDefeatedTier, dungeon.tier) : before.bossDefeatedTier,
    lastRunDate: env.today,
  };
  await ctx.store.saveDungeonProgress(userId, progress);
  const character: CharacterRecord = {
    ...env.character,
    keys: env.character.keys - 1,
    gold: env.character.gold + result.gold,
    fragments: env.character.fragments + result.fragments,
  };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, result: { ...result, chest: chest ? chest.rarity : null }, progress, chest, character };
}

// ───────────────────────── Grimoire : capacités de classe ─────────────────────────

const spellNotFound = () => fail('not-found', 'Capacité inconnue ou pas encore obtenue.');

async function grimoireNow(env: AdvEnv): Promise<GrimoireState> {
  return grimoireOf(await snapshot(env), env.classId);
}

/** Équipe une capacité connue dans un emplacement du Grimoire (1 à 3). Sans emplacement : le premier libre, sinon le dernier ; un emplacement occupé est remplacé. */
export async function equipSpell(
  ctx: ServerContext,
  userId: string,
  input: { spellId: string; slot?: number },
): Promise<Result<{ grimoire: GrimoireState; character: CharacterRecord }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  const known = await ctx.store.listSpells(userId);
  const spell = known.find((k) => k.spellId === input.spellId);
  if (!spell || !SPELL_BY_ID.has(spell.spellId)) return spellNotFound();
  if (input.slot === undefined && spell.equippedSlot !== null) return { ok: true, grimoire: await grimoireNow(env), character: env.character };
  const slot = input.slot ?? freeSpellSlot(known) ?? SPELL_SLOTS;
  if (!Number.isInteger(slot) || slot < 1 || slot > SPELL_SLOTS) return fail('invalid', `Le Grimoire compte ${SPELL_SLOTS} emplacements.`);
  if (spell.equippedSlot !== slot) {
    // Libère d'abord l'emplacement visé (un seul sort par emplacement), puis déplace la capacité.
    const current = known.find((k) => k.equippedSlot === slot);
    if (current) await ctx.store.saveSpell(userId, { ...current, equippedSlot: null });
    await ctx.store.saveSpell(userId, { ...spell, equippedSlot: slot });
  }
  const character = await syncGear(env);
  return { ok: true, grimoire: await grimoireNow({ ...env, character }), character };
}

/** Retire la capacité équipée à un emplacement (ou la capacité `spellId`). */
export async function unequipSpell(
  ctx: ServerContext,
  userId: string,
  input: { spellId?: string; slot?: number },
): Promise<Result<{ grimoire: GrimoireState; character: CharacterRecord }>> {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail('no-character');
  const known = await ctx.store.listSpells(userId);
  const current = known.find((k) => k.equippedSlot !== null && (input.spellId ? k.spellId === input.spellId : k.equippedSlot === input.slot));
  if (!current) return fail('not-found', 'Aucune capacité équipée à cet emplacement.');
  await ctx.store.saveSpell(userId, { ...current, equippedSlot: null });
  const character = await syncGear(env);
  return { ok: true, grimoire: await grimoireNow({ ...env, character }), character };
}
