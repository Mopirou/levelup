import {
  ABILITIES,
  AbilityId,
  ItemRarity,
  SPELL_MAX_LEVEL,
  SPELL_SLOTS,
  SpellDef,
  SpellFamily,
  SpellKnown,
  SPELL_FAMILIES,
} from './types';
import { ABILITY_LABEL } from './labels';
import type { XpPart } from './xp';

// ───────────────────────── Sorts et capacités de classe : logique pure ─────────────────────────
//
// Aucune lecture de base ici. 8 capacités par classe (2-2-2-1-1), 3 emplacements dans le Grimoire. Les points d'effet
// d'une capacité viennent de sa rareté, identiques pour toutes les classes ; seule la famille d'effet change (la saveur).
// Voir docs/CLASSES.md §3.

/** Points d'effet selon la rareté : commun 3, peu commun 5, rare 8, épique 12, légendaire 18. */
export const SPELL_POINTS: Record<ItemRarity, number> = { commun: 3, peu_commun: 5, rare: 8, epique: 12, legendaire: 18 };
/** Chaque niveau au-delà du premier ajoute +20 % aux points d'effet (niveau 5 : ×1,8). */
export const SPELL_LEVEL_STEP = 0.2;
/** +25 % d'effet pour une capacité de sa propre classe. */
export const SPELL_CLASS_BONUS = 0.25;
/** Plafond d'XP bonus total des capacités (en %) pour une caractéristique. */
export const SPELL_XP_CAP = 25;
/** Plafond de chacune des autres familles (en % ; en points de probabilité pour la chance de coffre). */
export const SPELL_OTHER_CAP = 30;
/** Score d'aventure : `+floor(points / 4)` */
export const SPELL_STAT_DIV = 4;
/** Chance de coffre : décale la rareté de `points / 4` points de probabilité */
export const SPELL_CHEST_DIV = 4;
/** Survie de donjon : `+points / 2 %` de CON effective */
export const SPELL_DUNGEON_DIV = 2;

/** Fragments rendus par un doublon d'une capacité déjà au niveau maximal, par rareté (le double d'un démontage d'objet). */
export const SPELL_MAX_FRAGMENTS: Record<ItemRarity, number> = { commun: 4, peu_commun: 10, rare: 24, epique: 60, legendaire: 160 };

/** Points d'effet d'une capacité : `points[rareté] × (1 + 0,2 × (niveau − 1)) × (1,25 si c'est une capacité de sa classe)`. */
export function spellEffectPoints(rarity: ItemRarity, level: number, ownClass: boolean): number {
  const lvl = Math.min(Math.max(Math.trunc(level) || 1, 1), SPELL_MAX_LEVEL);
  return SPELL_POINTS[rarity] * (1 + SPELL_LEVEL_STEP * (lvl - 1)) * (ownClass ? 1 + SPELL_CLASS_BONUS : 1);
}

/** Bonus total des capacités équipées, déjà plafonné. */
export interface SpellBonuses {
  /** PP ajoutés à la puissance (points d'effet arrondis, comme les PP d'un objet) */
  pp: number;
  /** XP bonus en % par caractéristique (plafonné à +25 %) */
  xp: Partial<Record<AbilityId, number>>;
  /** Bonus de score d'aventure par caractéristique */
  stats: Partial<Record<AbilityId, number>>;
  /** +% de dégâts de raid (≤ 30) */
  raid: number;
  /** +% d'or d'expédition (≤ 30) */
  gold: number;
  /** Décalage de rareté d'un coffre, en points de probabilité (≤ 30) */
  chest: number;
  /** +% de CON effective en donjon (≤ 30) */
  dungeon: number;
  /** Capacités équipées prises en compte, avec leurs points d'effet */
  active: { spellId: string; level: number; points: number; ownClass: boolean }[];
}

export const NO_SPELL_BONUS: SpellBonuses = { pp: 0, xp: {}, stats: {}, raid: 0, gold: 0, chest: 0, dungeon: 0, active: [] };

/** Somme brute (non plafonnée) des points d'effet par famille et par caractéristique d'XP. */
export interface SpellRawTotals {
  families: Record<SpellFamily, number>;
  xp: Partial<Record<AbilityId, number>>;
  stats: Partial<Record<AbilityId, number>>;
}

/**
 * Totaux bruts de capacités équipées. `masteries` : les maîtrises du héros, pour répartir une capacité d'XP « all » (points partagés).
 */
export function spellRawTotals(
  equipped: readonly { def: SpellDef; level: number }[],
  heroClassId: string | null | undefined,
  masteries: readonly AbilityId[],
): SpellRawTotals {
  const families = Object.fromEntries(SPELL_FAMILIES.map((f) => [f, 0])) as Record<SpellFamily, number>;
  const xp: Partial<Record<AbilityId, number>> = {};
  const stats: Partial<Record<AbilityId, number>> = {};
  for (const { def, level } of equipped) {
    const pts = spellEffectPoints(def.rarity, level, !!heroClassId && def.classId === heroClassId);
    families[def.family] += pts;
    if (def.family === 'xp') {
      const targets: readonly AbilityId[] = def.ability === 'all' ? masteries : [def.ability];
      for (const a of targets) xp[a] = (xp[a] ?? 0) + pts / (def.ability === 'all' ? Math.max(1, targets.length) : 1);
    } else if (def.family === 'stat' && def.ability !== 'all') {
      stats[def.ability] = (stats[def.ability] ?? 0) + Math.floor(pts / SPELL_STAT_DIV);
    }
  }
  return { families, xp, stats };
}

/** Bonus des capacités équipées (au plus `SPELL_SLOTS`), plafonnés : XP ≤ +25 %, les autres familles ≤ +30. */
export function spellBonuses(
  known: readonly SpellKnown[],
  defs: ReadonlyMap<string, SpellDef>,
  heroClassId: string | null | undefined,
  masteries: readonly AbilityId[],
): SpellBonuses {
  const equipped = known
    .filter((k) => k.equippedSlot !== null && k.equippedSlot >= 1 && k.equippedSlot <= SPELL_SLOTS && defs.has(k.spellId))
    .sort((a, b) => (a.equippedSlot ?? 0) - (b.equippedSlot ?? 0))
    .slice(0, SPELL_SLOTS)
    .map((k) => ({ def: defs.get(k.spellId)!, level: k.level }));
  if (!equipped.length) return NO_SPELL_BONUS;
  const raw = spellRawTotals(equipped, heroClassId, masteries);
  const xp: Partial<Record<AbilityId, number>> = {};
  for (const a of ABILITIES) if (raw.xp[a]) xp[a] = Math.min(SPELL_XP_CAP, raw.xp[a]!);
  const active = equipped.map(({ def, level }) => {
    const ownClass = !!heroClassId && def.classId === heroClassId;
    return { spellId: def.id, level, points: spellEffectPoints(def.rarity, level, ownClass), ownClass };
  });
  return {
    pp: active.reduce((n, a) => n + Math.round(a.points), 0),
    xp,
    stats: raw.stats,
    raid: Math.min(SPELL_OTHER_CAP, raw.families.raid),
    gold: Math.min(SPELL_OTHER_CAP, raw.families.gold),
    chest: Math.min(SPELL_OTHER_CAP, raw.families.chest / SPELL_CHEST_DIV),
    dungeon: Math.min(SPELL_OTHER_CAP, raw.families.dungeon / SPELL_DUNGEON_DIV),
    active,
  };
}

/** Capacité connue → niveau suivant, ou `null` si elle est déjà au niveau maximal. */
export function nextSpellLevel(level: number): number | null {
  return level >= SPELL_MAX_LEVEL ? null : level + 1;
}

/** Occupation des emplacements : le prochain emplacement libre (1..3), `null` si tous sont pris. */
export function freeSpellSlot(known: readonly SpellKnown[]): number | null {
  const used = new Set(known.map((k) => k.equippedSlot).filter((s): s is number => s !== null));
  for (let s = 1; s <= SPELL_SLOTS; s++) if (!used.has(s)) return s;
  return null;
}

// ───────────────────────── Équilibre : enveloppe de puissance d'une classe ─────────────────────────

/** Mesures d'équilibre d'une classe avec son butin de classe au maximum (voir docs/CLASSES.md §6). */
export interface ClassEnvelope {
  classId: string;
  /** Nombre de capacités de la classe, et leur répartition par rareté */
  spellCount: number;
  rarityPlan: ItemRarity[];
  /** Somme des points d'effet par famille des 8 capacités (niveau 1, sans bonus de classe) */
  familyPoints: Record<SpellFamily, number>;
  /** Total des points d'effet des 8 capacités */
  totalPoints: number;
  /** Total des points d'effet des 3 meilleures capacités (le Grimoire) */
  topThreePoints: number;
  /** Meilleur bonus d'XP sur une seule caractéristique avec 3 emplacements (niveau 5, capacités de classe, avant plafond) */
  xpMaxRaw: number;
  /** Le même, après plafond de +25 % */
  xpMax: number;
  /** PP maximale des capacités (3 meilleures, niveau 5, bonus de classe) */
  spellPp: number;
}

/** Combinaisons de `k` éléments parmi `list`. */
function combos<T>(list: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (list.length < k) return [];
  const [head, ...rest] = list;
  return [...combos(rest, k - 1).map((c) => [head, ...c]), ...combos(rest, k)];
}

/**
 * Enveloppe de puissance d'une classe : les meilleures capacités de classe au niveau 5 dans les 3 emplacements, par critère.
 * Sert au test d'équilibre ; aucune donnée de joueur.
 */
export function classEnvelope(classId: string, spells: readonly SpellDef[], masteries: readonly AbilityId[]): ClassEnvelope {
  const mine = spells.filter((s) => s.classId === classId);
  const familyPoints = Object.fromEntries(SPELL_FAMILIES.map((f) => [f, 0])) as Record<SpellFamily, number>;
  for (const s of mine) familyPoints[s.family] += spellEffectPoints(s.rarity, 1, false);
  const loadouts = combos(mine, SPELL_SLOTS);
  let xpMaxRaw = 0;
  let spellPp = 0;
  for (const l of loadouts) {
    const raw = spellRawTotals(l.map((def) => ({ def, level: SPELL_MAX_LEVEL })), classId, masteries);
    for (const a of ABILITIES) xpMaxRaw = Math.max(xpMaxRaw, raw.xp[a] ?? 0);
    spellPp = Math.max(spellPp, l.reduce((n, d) => n + Math.round(spellEffectPoints(d.rarity, SPELL_MAX_LEVEL, true)), 0));
  }
  const byPoints = [...mine].sort((a, b) => SPELL_POINTS[b.rarity] - SPELL_POINTS[a.rarity]);
  return {
    classId,
    spellCount: mine.length,
    rarityPlan: mine.map((s) => s.rarity),
    familyPoints,
    totalPoints: mine.reduce((n, s) => n + SPELL_POINTS[s.rarity], 0),
    topThreePoints: byPoints.slice(0, SPELL_SLOTS).reduce((n, s) => n + SPELL_POINTS[s.rarity], 0),
    xpMaxRaw,
    xpMax: Math.min(SPELL_XP_CAP, xpMaxRaw),
    spellPp,
  };
}

/**
 * Applique le bonus d'XP des capacités (en % par caractéristique) aux parts d'une quête, après l'équilibrage.
 * Les retraits (montants négatifs ou nuls) ne sont jamais modifiés : l'annulation rejoue les montants versés.
 */
export function applySpellXp(parts: readonly XpPart[], bonus?: Partial<Record<AbilityId, number>>): XpPart[] {
  if (!bonus) return parts.map((p) => ({ ...p }));
  return parts.map((p) => {
    const pct = Math.min(SPELL_XP_CAP, Math.max(0, bonus[p.ability] ?? 0));
    if (p.amount < 1 || pct <= 0) return { ...p };
    return { ability: p.ability, amount: Math.max(p.amount, Math.round(p.amount * (1 + pct / 100))) };
  });
}

/** Effet d'une capacité en une phrase (points d'effet déjà calculés : niveau et classe compris). */
export function spellEffectLabel(def: Pick<SpellDef, 'family' | 'ability'>, points: number): string {
  const ab = def.ability === 'all' ? 'toutes tes maîtrises' : ABILITY_LABEL[def.ability];
  const pct = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
  switch (def.family) {
    case 'xp':
      return def.ability === 'all' ? `+${pct(points / 2)} % d’XP sur chacune de ${ab}` : `+${pct(points)} % d’XP en ${ab}`;
    case 'stat':
      return `+${Math.floor(points / SPELL_STAT_DIV)} en ${ab} (aventure)`;
    case 'raid':
      return `+${pct(points)} % de dégâts de raid`;
    case 'gold':
      return `+${pct(points)} % d’or d’expédition`;
    case 'chest':
      return `butin de coffre meilleur de ${pct(points / SPELL_CHEST_DIV)} points`;
    case 'dungeon':
      return `+${pct(points / SPELL_DUNGEON_DIV)} % de Constitution en donjon`;
  }
}
