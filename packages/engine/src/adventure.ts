import { CARD_CHANCE, pickCard } from './cards';
import { createRng } from './random';
import { NO_SET_BONUS, type SetBonusTotals } from './sets';
import { NO_SPELL_BONUS, SPELL_MAX_FRAGMENTS, type SpellBonuses } from './spells';
import { MAX_LEVEL, abilityScores } from './xp';
import {
  ABILITIES,
  AbilityId,
  CHEST_RARITIES,
  CardDef,
  CharacterCore,
  ChestPity,
  ChestRarity,
  DungeonDef,
  EQUIP_SLOTS,
  EquipSlot,
  ITEM_RARITIES,
  InventoryItem,
  ItemDef,
  ItemRarity,
  SpellDef,
} from './types';

// ───────────────────────── Aventure : logique pure ─────────────────────────
//
// Aucune lecture de base ici : puissance, expédition, coffres, équipement et donjons se calculent à partir de valeurs
// passées en paramètres (et de graines pour le hasard). Voir docs/DONJONS.md pour les règles.

// ───────────────────────── Constantes de règles ─────────────────────────

/** Ouvertures de coffres autorisées par jour de jeu */
export const CHEST_OPENS_PER_DAY = 2;
/** Clés de donjon en stock au maximum */
export const MAX_KEYS = 3;
/** Coffres (ou objets) nécessaires à une fusion */
export const MERGE_COUNT = 3;

/** Plafond d'accumulation de l'expédition, en heures */
export const EXPEDITION_CAP_HOURS = 24;
/** Or par heure de base, avant PP, INT, DEX et série */
export const EXPEDITION_GOLD_PER_HOUR = 20;
/** `or/h = 20 × (1 + PP / 200) × (1 + INT / 40)` */
export const EXPEDITION_GOLD_PP_DIV = 200;
export const EXPEDITION_INT_DIV = 40;
/** `fragments/h = 1 + PP / 400` */
export const EXPEDITION_FRAGMENT_PP_DIV = 400;
/** DEX = vitesse d'expédition : `× (1 + DEX / 50)` sur l'or et les fragments */
export const EXPEDITION_DEX_DIV = 50;
/** Bonus de série : `+2 %` par jour, plafonné à `+30 %` */
export const EXPEDITION_STREAK_STEP = 0.02;
export const EXPEDITION_STREAK_MAX = 0.3;
/** Chance d'une Clé pour une réclamation de 24 h complètes (proportionnelle en dessous) */
export const EXPEDITION_KEY_CHANCE = 0.05;
/** En dessous de cette durée (ms), il n'y a rien à réclamer */
export const EXPEDITION_MIN_CLAIM_MS = 60_000;

/** Points de pourcentage déplacés par palier de SAG */
export const SAG_SHIFT_PCT = 2;
/** SAG par palier de décalage */
export const SAG_SHIFT_STEP = 10;
/** Ouvertures sans Épique+ avant d'en garantir un (coffres bronze et au-dessus) */
export const PITY_EPIC = 8;
/** Ouvertures sans Légendaire avant d'en garantir un (coffres or et mythique) */
export const PITY_LEGENDARY = 25;
/** Plus petite rareté de coffre soumise à la pitié « Épique » */
export const PITY_EPIC_MIN_CHEST: ChestRarity = 'bronze';
/** Plus petite rareté de coffre soumise à la pitié « Légendaire » */
export const PITY_LEGENDARY_MIN_CHEST: ChestRarity = 'or';

/** Probabilités (en %) de chaque rareté d'objet, dans l'ordre de `ITEM_RARITIES`, et contenu en fragments et or d'un coffre. */
export const CHEST_TABLE: Record<ChestRarity, { odds: readonly number[]; fragments: number; gold: number }> = {
  bois: { odds: [70, 25, 5, 0, 0], fragments: 5, gold: 50 },
  bronze: { odds: [35, 40, 20, 5, 0], fragments: 15, gold: 150 },
  argent: { odds: [5, 30, 45, 18, 2], fragments: 40, gold: 400 },
  or: { odds: [0, 5, 35, 50, 10], fragments: 100, gold: 1000 },
  mythique: { odds: [0, 0, 10, 55, 35], fragments: 250, gold: 3000 },
};

/** PP de base d'un objet par rareté */
export const ITEM_BASE_POWER: Record<ItemRarity, number> = { commun: 5, peu_commun: 12, rare: 28, epique: 60, legendaire: 130 };
/** `PP = base × (1 + 0,1 × niveau)` */
export const ITEM_LEVEL_STEP = 0.1;
export const ITEM_MAX_LEVEL = 10;
/** +20 % de PP pour un objet de sa propre classe (affinité de classe) */
export const ITEM_AFFINITY_BONUS = 0.2;
/** Bonus de score d'aventure = `floor(PP_objet / 12)` */
export const ITEM_ABILITY_BONUS_DIV = 12;
/** Fragments rendus par le démontage, par rareté */
export const DISMANTLE_FRAGMENTS: Record<ItemRarity, number> = { commun: 2, peu_commun: 5, rare: 12, epique: 30, legendaire: 80 };
/** Amélioration : `fragments = 5 × (niveau + 1)`, `or = 100 × (niveau + 1)^1,5` */
export const UPGRADE_FRAGMENTS_STEP = 5;
export const UPGRADE_GOLD_STEP = 100;
export const UPGRADE_GOLD_EXPONENT = 1.5;

/** Un donjon compte 5 salles puis un boss */
export const DUNGEON_ROOMS = 5;
/** `P(i) = base × 1,35^i` */
export const DUNGEON_ROOM_GROWTH = 1.35;
/** Boss : `P(5) × 1,5` */
export const DUNGEON_BOSS_MULT = 1.5;
/** Survie par salle : `PP × (1 + CON / 60)` */
export const DUNGEON_CON_DIV = 60;
/** Dégâts contre le boss : `PP × (1 + FOR / 60)` */
export const DUNGEON_FOR_DIV = 60;
/** Puissance de la première salle du palier 1 */
export const DUNGEON_BASE_START = 40;
/** Croissance de `base` d'un palier au suivant */
export const DUNGEON_TIER_GROWTH = 1.5;
/** Niveau requis par palier : `3 × palier` */
export const DUNGEON_UNLOCK_PER_TIER = 3;
/** Or et fragments par salle franchie, multipliés par le palier */
export const DUNGEON_ROOM_GOLD = 40;
export const DUNGEON_ROOM_FRAGMENTS = 4;
/** Le boss rapporte autant que ce nombre de salles supplémentaires */
export const DUNGEON_BOSS_REWARD_ROOMS = 3;
/** Palier à partir duquel le premier boss vaincu donne un coffre d'argent (bronze avant) */
export const DUNGEON_SILVER_TIER = 5;
/** Valeur de `bestRoom` quand le boss est vaincu */
export const DUNGEON_BOSS_ROOM = DUNGEON_ROOMS + 1;

/** Jalons de série qui donnent un coffre, et sa rareté */
export const STREAK_MILESTONE_CHESTS: Readonly<Record<number, ChestRarity>> = { 7: 'argent', 30: 'or', 100: 'mythique' };

const rarityIndex = <T extends string>(list: readonly T[], r: T): number => list.indexOf(r);

// ───────────────────────── Puissance ─────────────────────────

/** Un objet porte-t-il l'affinité de la classe du héros ? (objets universels : jamais) */
export function hasAffinity(item: Pick<InventoryItem, 'classId'>, heroClassId?: string | null): boolean {
  return !!heroClassId && !!item.classId && item.classId === heroClassId;
}

/** PP d'un objet : `base[rareté] × (1 + 0,1 × niveau)`, +20 % si l'objet est de la classe du héros. */
export function itemPower(item: Pick<InventoryItem, 'rarity' | 'level' | 'classId'>, heroClassId?: string | null): number {
  const level = Math.min(Math.max(Math.trunc(item.level) || 0, 0), ITEM_MAX_LEVEL);
  const affinity = hasAffinity(item, heroClassId) ? 1 + ITEM_AFFINITY_BONUS : 1;
  return Math.round(ITEM_BASE_POWER[item.rarity] * (1 + ITEM_LEVEL_STEP * level) * affinity);
}

/** Bonus de score d'aventure qu'apporte un objet à sa caractéristique : `floor(PP / 12)`. */
export function itemAbilityBonus(item: Pick<InventoryItem, 'rarity' | 'level' | 'ability' | 'classId'>, heroClassId?: string | null): number {
  return Math.floor(itemPower(item, heroClassId) / ITEM_ABILITY_BONUS_DIV);
}

/** Scores effectifs en jeu d'aventure : scores du personnage + bonus des objets équipés, des panoplies et des capacités (jamais pour l'XP). */
export function adventureScores(
  scores: Record<AbilityId, number>,
  equipped: readonly Pick<InventoryItem, 'rarity' | 'level' | 'ability' | 'classId'>[],
  heroClassId?: string | null,
  sets: Pick<SetBonusTotals, 'abilities'> = NO_SET_BONUS,
  spells: Pick<SpellBonuses, 'stats'> = NO_SPELL_BONUS,
): Record<AbilityId, number> {
  const out = { ...scores };
  for (const it of equipped) out[it.ability] += itemAbilityBonus(it, heroClassId);
  for (const a of ABILITIES) out[a] += (sets.abilities[a] ?? 0) + (spells.stats[a] ?? 0);
  return out;
}

/** Détail de la puissance d'un héros. */
export interface HeroPowerBreakdown {
  total: number;
  /** `niveau × 10` */
  level: number;
  /** Somme des scores des 6 caractéristiques (sans les bonus d'objets, déjà comptés dans leur PP) */
  scores: number;
  /** Somme des PP des objets équipés */
  items: number;
  /** PP des bonus de panoplies */
  sets: number;
  /** PP des capacités équipées */
  spells: number;
}

/** `PP = niveau × 10 + Σ(scores) + Σ(PP des objets équipés) + PP des panoplies + PP des capacités`. Seuls les objets marqués équipés comptent. */
export function heroPowerBreakdown(
  character: Pick<CharacterCore, 'level' | 'baseScores' | 'improvements' | 'abilityXp'>,
  equipped: readonly Pick<InventoryItem, 'rarity' | 'level' | 'equipped' | 'classId'>[],
  heroClassId?: string | null,
  sets: Pick<SetBonusTotals, 'pp'> = NO_SET_BONUS,
  spells: Pick<SpellBonuses, 'pp'> = NO_SPELL_BONUS,
): HeroPowerBreakdown {
  const scores = abilityScores(character);
  const level = character.level * 10;
  const sum = ABILITIES.reduce((n, a) => n + scores[a], 0);
  const items = equipped.filter((i) => i.equipped).reduce((n, i) => n + itemPower(i, heroClassId), 0);
  return { total: level + sum + items + sets.pp + spells.pp, level, scores: sum, items, sets: sets.pp, spells: spells.pp };
}

/** Puissance (PP) du héros. */
export function heroPower(
  character: Pick<CharacterCore, 'level' | 'baseScores' | 'improvements' | 'abilityXp'>,
  equipped: readonly Pick<InventoryItem, 'rarity' | 'level' | 'equipped' | 'classId'>[],
  heroClassId?: string | null,
  sets: Pick<SetBonusTotals, 'pp'> = NO_SET_BONUS,
  spells: Pick<SpellBonuses, 'pp'> = NO_SPELL_BONUS,
): number {
  return heroPowerBreakdown(character, equipped, heroClassId, sets, spells).total;
}

// ───────────────────────── Expédition ─────────────────────────

/** Multiplicateur de série : `1 + min(0,30, 0,02 × série)`. */
export function streakMultiplier(streak: number): number {
  return 1 + Math.min(EXPEDITION_STREAK_MAX, EXPEDITION_STREAK_STEP * Math.max(0, streak));
}

export interface ExpeditionRates {
  goldPerHour: number;
  fragmentsPerHour: number;
}

/** Rendements horaires : `or = 20 × (1 + PP/200) × (1 + INT/40)`, `fragments = 1 + PP/400`, tous deux × DEX et série. */
export function expeditionRates(pp: number, scores: Pick<Record<AbilityId, number>, 'INT' | 'DEX'>, streak: number, goldBonusPct = 0): ExpeditionRates {
  const speed = (1 + Math.max(0, scores.DEX) / EXPEDITION_DEX_DIV) * streakMultiplier(streak);
  return {
    goldPerHour: EXPEDITION_GOLD_PER_HOUR * (1 + pp / EXPEDITION_GOLD_PP_DIV) * (1 + Math.max(0, scores.INT) / EXPEDITION_INT_DIV) * speed * (1 + Math.max(0, goldBonusPct) / 100),
    fragmentsPerHour: (1 + pp / EXPEDITION_FRAGMENT_PP_DIV) * speed,
  };
}

export interface ExpeditionYield extends ExpeditionRates {
  /** Heures comptées (plafonnées à 24) */
  hours: number;
  /** L'accumulation a atteint le plafond de 24 h */
  capped: boolean;
  gold: number;
  fragments: number;
  /** Chance d'une Clé à la réclamation (5 % pour 24 h complètes, proportionnelle en dessous) */
  keyChance: number;
}

/** Ce qu'une expédition a accumulé après `elapsedMs` (cap 24 h, jamais négatif). */
export function expeditionYield(input: {
  pp: number;
  scores: Pick<Record<AbilityId, number>, 'INT' | 'DEX'>;
  streak: number;
  elapsedMs: number;
  /** Capacités : +% d'or (famille « gold ») */
  goldBonusPct?: number;
}): ExpeditionYield {
  const rawHours = Math.max(0, input.elapsedMs) / 3_600_000;
  const hours = Math.min(rawHours, EXPEDITION_CAP_HOURS);
  const rates = expeditionRates(input.pp, input.scores, input.streak, input.goldBonusPct ?? 0);
  return {
    ...rates,
    hours,
    capped: rawHours >= EXPEDITION_CAP_HOURS,
    gold: Math.floor(rates.goldPerHour * hours),
    fragments: Math.floor(rates.fragmentsPerHour * hours),
    keyChance: (EXPEDITION_KEY_CHANCE * hours) / EXPEDITION_CAP_HOURS,
  };
}

/** Tirage de la Clé d'une réclamation (déterministe pour une graine donnée). */
export function rollExpeditionKey(seed: string, chance: number): boolean {
  return createRng(`${seed}|key`)() < chance;
}

// ───────────────────────── Coffres ─────────────────────────

/** Coffre offert chaque jour de jeu à la première lecture de l'aventure, quelles que soient les quêtes validées. */
export const DAILY_FREE_CHEST: ChestRarity = 'bois';

/** Coffre donné par la 1re quête de parcours du jour : bois, bronze dès 7 jours de série, argent dès 30. */
export function dailyChestRarity(streak: number): ChestRarity {
  return streak >= 30 ? 'argent' : streak >= 7 ? 'bronze' : 'bois';
}

/** Coffre d'une promotion d'échelon (échelon atteint) : 1-4 bronze, 5-7 argent, 8-9 or, 10 mythique. */
export function rungChestRarity(rung: number): ChestRarity {
  return rung >= 10 ? 'mythique' : rung >= 8 ? 'or' : rung >= 5 ? 'argent' : 'bronze';
}

/** Coffre d'un jalon de série (7 / 30 / 100 jours), `null` si ce n'est pas un jalon. */
export function streakMilestoneChest(streak: number): ChestRarity | null {
  return STREAK_MILESTONE_CHESTS[streak] ?? null;
}

/** Rareté supérieure d'un coffre, `null` pour un coffre mythique. */
export function nextChestRarity(r: ChestRarity): ChestRarity | null {
  return CHEST_RARITIES[rarityIndex(CHEST_RARITIES, r) + 1] ?? null;
}

/** Rareté supérieure d'un objet, `null` pour un objet légendaire. */
export function nextItemRarity(r: ItemRarity): ItemRarity | null {
  return ITEM_RARITIES[rarityIndex(ITEM_RARITIES, r) + 1] ?? null;
}

/**
 * Probabilités (en %) de rareté d'objet d'un coffre après décalage SAG : chaque palier de 10 points de SAG déplace 2 points
 * de la rareté la plus basse du tableau vers la plus haute, sans jamais dépasser la masse de la plus basse. La somme reste 100.
 * `extraShift` : décalage supplémentaire en points de probabilité (capacités de chance de coffre).
 */
export function adjustedOdds(chest: ChestRarity, sag: number, extraShift = 0): number[] {
  const odds = [...CHEST_TABLE[chest].odds];
  const low = odds.findIndex((p) => p > 0);
  let high = odds.length - 1;
  while (high > 0 && odds[high] === 0) high--;
  if (low < 0 || low >= high) return odds;
  const shift = Math.min(Math.floor(Math.max(0, sag) / SAG_SHIFT_STEP) * SAG_SHIFT_PCT + Math.max(0, extraShift), odds[low]);
  odds[low] -= shift;
  odds[high] += shift;
  return odds;
}

/** Part (en %) des coffres qui donnent une capacité plutôt qu'un objet, par rareté de coffre. Le coffre de bois n'en donne jamais. */
export const SPELL_CHANCE: Record<ChestRarity, number> = { bois: 0, bronze: 15, argent: 22, or: 30, mythique: 40 };
/** Contenu d'un objet : 70 % de la classe du joueur, 20 % universel, 10 % d'une autre classe. */
export const LOOT_CLASS_SHARE = 70;
export const LOOT_UNIVERSAL_SHARE = 20;
/** Contenu d'une capacité (il n'y a pas de capacité universelle) : 80 % de la classe du joueur, 20 % d'une autre classe. */
export const SPELL_CLASS_SHARE = 80;

export interface ChestDrawInput {
  chest: ChestRarity;
  /** SAG effective (objets équipés comprise) */
  sag: number;
  pity: ChestPity;
  /** Graine : profil + compteur d'ouvertures */
  seed: string;
  templates: readonly ItemDef[];
  /** Capacités possibles (aucune : le coffre ne donne que des objets) */
  spells?: readonly SpellDef[];
  /** Classe du joueur (sans classe : tirage uniforme) */
  classId?: string | null;
  /** Capacités équipées : décalage de rareté supplémentaire, en points de probabilité */
  chestShift?: number;
  /** Cartes de la collection possibles (aucune : le coffre ne donne ni carte) */
  cards?: readonly CardDef[];
  /** Identifiants des cartes déjà possédées (une carte inconnue est tirée en priorité une fois sur deux) */
  ownedCards?: ReadonlySet<string>;
}

export interface ChestDraw {
  rarity: ItemRarity;
  /** Objet tiré (`null` quand le coffre donne une capacité) */
  template: ItemDef | null;
  /** Capacité tirée (`null` quand le coffre donne un objet) */
  spell: SpellDef | null;
  /** Carte de la collection tirée (`null` quand le coffre donne un objet ou une capacité) */
  card: CardDef | null;
  fragments: number;
  gold: number;
  /** Compteurs de pitié après ce tirage */
  pity: ChestPity;
  /** La pitié a imposé la rareté de l'objet */
  guaranteed: 'epique' | 'legendaire' | null;
}

/** Choisit dans `pool` un élément de la classe (`classShare` %), puis universel (`universalShare` %), sinon d'une autre classe. */
function pickByClass<T extends { classId?: string | null }>(pool: readonly T[], rng: () => number, classId: string | null | undefined, classShare: number, universalShare: number): T | null {
  if (!pool.length) return null;
  if (!classId) return pool[Math.min(Math.floor(rng() * pool.length), pool.length - 1)];
  const own = classId ? pool.filter((t) => t.classId === classId) : [];
  const universal = pool.filter((t) => !t.classId);
  const other = pool.filter((t) => !!t.classId && t.classId !== classId);
  const roll = rng() * 100;
  const order = roll < classShare ? [own, universal, other] : roll < classShare + universalShare ? [universal, other, own] : [other, universal, own];
  const list = order.find((l) => l.length) ?? pool;
  return list[Math.min(Math.floor(rng() * list.length), list.length - 1)];
}

/**
 * Ouvre un coffre en deux temps : (1) la rareté (décalage SAG et capacités, pitié) ; (2) le type, capacité (`SPELL_CHANCE`), carte de
 * la collection (`CARD_CHANCE`) ou objet d'équipement ; (3) le contenu, 70 % de la classe / 20 % universel / 10 % d'une autre classe pour un objet,
 * 80 % / 20 % pour une capacité. Déterministe pour une graine.
 */
export function drawChest(input: ChestDrawInput): ChestDraw {
  const { chest } = input;
  if (!input.templates.length) throw new Error('Aucun modèle d’objet');
  const rng = createRng(input.seed);
  const odds = adjustedOdds(chest, input.sag, input.chestShift ?? 0);
  let roll = rng() * 100;
  let idx = odds.length - 1;
  for (let i = 0; i < odds.length; i++) {
    if (odds[i] <= 0) continue;
    idx = i;
    roll -= odds[i];
    if (roll < 0) break;
  }
  const epicIdx = rarityIndex(ITEM_RARITIES, 'epique');
  const legIdx = rarityIndex(ITEM_RARITIES, 'legendaire');
  const chestIdx = rarityIndex(CHEST_RARITIES, chest);
  const epicPity = chestIdx >= rarityIndex(CHEST_RARITIES, PITY_EPIC_MIN_CHEST);
  const legPity = chestIdx >= rarityIndex(CHEST_RARITIES, PITY_LEGENDARY_MIN_CHEST);
  const epicKey = chest;
  const legKey = `${chest}:legendaire`;
  const pity: ChestPity = { ...input.pity };
  let guaranteed: ChestDraw['guaranteed'] = null;
  if (legPity && (pity[legKey] ?? 0) >= PITY_LEGENDARY) {
    if (idx < legIdx) guaranteed = 'legendaire';
    idx = legIdx;
  } else if (epicPity && (pity[epicKey] ?? 0) >= PITY_EPIC && idx < epicIdx) {
    guaranteed = 'epique';
    idx = epicIdx;
  }
  if (epicPity) pity[epicKey] = idx >= epicIdx ? 0 : (pity[epicKey] ?? 0) + 1;
  if (legPity) pity[legKey] = idx === legIdx ? 0 : (pity[legKey] ?? 0) + 1;
  const rarity = ITEM_RARITIES[idx];
  const { fragments, gold } = CHEST_TABLE[chest];
  // Type : équipement ou capacité.
  const typeRoll = rng() * 100;
  const spellPool = (input.spells ?? []).filter((x) => x.rarity === rarity);
  if (spellPool.length && typeRoll < SPELL_CHANCE[chest]) {
    const spell = pickByClass(spellPool, rng, input.classId, SPELL_CLASS_SHARE, 0);
    if (spell) return { rarity, template: null, spell, card: null, fragments, gold, pity, guaranteed };
  }
  // Collection : la tranche qui suit celle des capacités (sans cartes en entrée, le tirage reste celui d'avant).
  const cardPool = (input.cards ?? []).filter((c) => c.rarity === rarity);
  if (cardPool.length && typeRoll >= SPELL_CHANCE[chest] && typeRoll < SPELL_CHANCE[chest] + CARD_CHANCE[chest]) {
    const card = pickCard(cardPool, rng, input.ownedCards);
    if (card) return { rarity, template: null, spell: null, card, fragments, gold, pity, guaranteed };
  }
  const template = pickByClass(input.templates, rng, input.classId, LOOT_CLASS_SHARE, LOOT_UNIVERSAL_SHARE) ?? input.templates[0];
  return { rarity, template, spell: null, card: null, fragments, gold, pity, guaranteed };
}

/** Tire le modèle d'un objet de fusion : un modèle de l'emplacement donné, de préférence de la classe du joueur (déterministe pour une graine). */
export function pickTemplateForSlot(templates: readonly ItemDef[], slot: EquipSlot, seed: string, classId?: string | null): ItemDef | null {
  const pool = templates.filter((t) => t.slot === slot);
  if (!pool.length) return null;
  return pickByClass(pool, createRng(`${seed}|forge`), classId, LOOT_CLASS_SHARE, LOOT_UNIVERSAL_SHARE);
}

/** Fragments rendus par un doublon de capacité déjà au niveau maximal. */
export function spellMaxFragments(rarity: ItemRarity): number {
  return SPELL_MAX_FRAGMENTS[rarity];
}

// ───────────────────────── Équipement ─────────────────────────

/** Coût pour passer de `level` à `level + 1` : `5 × (niveau + 1)` fragments, `100 × (niveau + 1)^1,5` or (arrondi). `null` au niveau maximal. */
export function upgradeCost(level: number): { fragments: number; gold: number } | null {
  if (level >= ITEM_MAX_LEVEL) return null;
  const n = Math.max(0, Math.trunc(level)) + 1;
  return { fragments: UPGRADE_FRAGMENTS_STEP * n, gold: Math.round(UPGRADE_GOLD_STEP * Math.pow(n, UPGRADE_GOLD_EXPONENT)) };
}

/** Fragments rendus par le démontage d'un objet. */
export function dismantleValue(rarity: ItemRarity): number {
  return DISMANTLE_FRAGMENTS[rarity];
}

/** Emplacements d'un ensemble d'objets équipés, indexés par emplacement (un seul objet par emplacement). */
export function equippedBySlot<T extends Pick<InventoryItem, 'slot' | 'equipped'>>(items: readonly T[]): Partial<Record<EquipSlot, T>> {
  const out: Partial<Record<EquipSlot, T>> = {};
  for (const it of items) if (it.equipped && EQUIP_SLOTS.includes(it.slot)) out[it.slot] = it;
  return out;
}

// ───────────────────────── Donjons ─────────────────────────

/** Puissance de la première salle d'un palier : `40 × 1,5^(palier − 1)`. */
export function dungeonBase(tier: number): number {
  return Math.round(DUNGEON_BASE_START * Math.pow(DUNGEON_TIER_GROWTH, Math.max(1, tier) - 1));
}

/** Niveau requis pour un palier : `3 × palier`, plafonné au niveau maximal. */
export function dungeonUnlockLevel(tier: number): number {
  return Math.min(MAX_LEVEL, DUNGEON_UNLOCK_PER_TIER * Math.max(1, tier));
}

/** Puissance de la salle `i` (0..4) : `base × 1,35^i`. */
export function dungeonRoomPower(tier: number, room: number): number {
  return Math.round(dungeonBase(tier) * Math.pow(DUNGEON_ROOM_GROWTH, room));
}

/** Puissance du boss : `P(5) × 1,5`. */
export function dungeonBossPower(tier: number): number {
  return Math.round(dungeonBase(tier) * Math.pow(DUNGEON_ROOM_GROWTH, DUNGEON_ROOMS) * DUNGEON_BOSS_MULT);
}

/** Coffre du boss vaincu pour la première fois : bronze, argent à partir du palier 5. */
export function dungeonBossChest(tier: number): ChestRarity {
  return tier >= DUNGEON_SILVER_TIER ? 'argent' : 'bronze';
}

export interface DungeonRunInput {
  dungeon: Pick<DungeonDef, 'id' | 'tier' | 'rooms' | 'boss'>;
  /** Puissance du héros (PP) */
  pp: number;
  /** Scores d'aventure du héros */
  scores: Pick<Record<AbilityId, number>, 'CON' | 'FOR'>;
  /** Le boss n'a encore jamais été vaincu à ce palier : sa victoire donne un coffre */
  firstBossVictory: boolean;
  seed: string;
  /** Capacités : +% de CON effective (famille « dungeon ») */
  conBonusPct?: number;
}

export interface DungeonRunResult {
  dungeonId: string;
  /** Salles franchies (0..5) : la run s'est arrêtée à la salle suivante */
  reachedRoom: number;
  bossDefeated: boolean;
  /** PP manquante pour franchir l'obstacle bloquant (`null` si le boss est vaincu) */
  missingPower: number | null;
  /** Journal court : une ligne par salle, puis le boss */
  log: string[];
  gold: number;
  fragments: number;
  /** Coffre gagné (boss vaincu pour la première fois) */
  chest: ChestRarity | null;
  /** Puissance requise de chaque salle, puis du boss (information pour l'affichage) */
  roomPowers: number[];
  bossPower: number;
  heroPower: number;
}

const WIN_VERBS = ['terrasses', 'écrases', 'repousses', 'domptes', 'surmontes', 'mets en fuite'];
const LOSE_VERBS = ['te repousse', 'te submerge', 'te barre la route', 'est trop fort pour toi'];

/** Résout un donjon, de façon déterministe : chaque salle exige `PP × (1 + CON/60) ≥ P(i)`, le boss `PP × (1 + FOR/60) ≥ boss`. */
export function resolveDungeon(input: DungeonRunInput): DungeonRunResult {
  const { dungeon, pp, scores } = input;
  const tier = dungeon.tier;
  const rng = createRng(input.seed);
  const con = Math.max(0, scores.CON) * (1 + Math.max(0, input.conBonusPct ?? 0) / 100);
  const survive = pp * (1 + con / DUNGEON_CON_DIV);
  const damage = pp * (1 + Math.max(0, scores.FOR) / DUNGEON_FOR_DIV);
  const roomPowers = Array.from({ length: DUNGEON_ROOMS }, (_, i) => dungeonRoomPower(tier, i));
  const bossPower = dungeonBossPower(tier);
  const pick = (list: readonly string[]) => list[Math.min(Math.floor(rng() * list.length), list.length - 1)];
  const log: string[] = [];
  let cleared = 0;
  let missing: number | null = null;
  for (let i = 0; i < DUNGEON_ROOMS; i++) {
    const monster = dungeon.rooms[i] ?? 'une ombre';
    if (survive >= roomPowers[i]) {
      cleared++;
      log.push(`Salle ${i + 1} : tu ${pick(WIN_VERBS)} ${monster}.`);
    } else {
      missing = Math.max(1, Math.ceil(roomPowers[i] / (1 + con / DUNGEON_CON_DIV) - pp));
      log.push(`Salle ${i + 1} : ${monster} ${pick(LOSE_VERBS)}. Il te manque ${missing} PP.`);
      break;
    }
  }
  let bossDefeated = false;
  if (cleared === DUNGEON_ROOMS) {
    if (damage >= bossPower) {
      bossDefeated = true;
      log.push(`Boss : tu terrasses ${dungeon.boss} !`);
    } else {
      missing = Math.max(1, Math.ceil(bossPower / (1 + Math.max(0, scores.FOR) / DUNGEON_FOR_DIV) - pp));
      log.push(`Boss : ${dungeon.boss} résiste à tes coups. Il te manque ${missing} PP.`);
    }
  }
  let gold = 0;
  let fragments = 0;
  for (let i = 0; i < cleared; i++) {
    gold += DUNGEON_ROOM_GOLD * tier;
    fragments += DUNGEON_ROOM_FRAGMENTS * tier;
  }
  if (bossDefeated) {
    gold += DUNGEON_ROOM_GOLD * tier * DUNGEON_BOSS_REWARD_ROOMS;
    fragments += DUNGEON_ROOM_FRAGMENTS * tier * DUNGEON_BOSS_REWARD_ROOMS;
  }
  return {
    dungeonId: dungeon.id,
    reachedRoom: cleared,
    bossDefeated,
    missingPower: bossDefeated ? null : missing,
    log,
    gold,
    fragments,
    chest: bossDefeated && input.firstBossVictory ? dungeonBossChest(tier) : null,
    roomPowers,
    bossPower,
    heroPower: pp,
  };
}

