// Fichier généré par scripts/build-server-engine.mjs — ne pas modifier à la main.

// packages/engine/src/types.ts
var ABILITIES = ["FOR", "DEX", "CON", "INT", "SAG", "CHA"];
var DIFFICULTIES = ["easy", "medium", "high", "expert"];
var PERIODS = ["daily", "weekly", "monthly", "epic"];
var emptyAbilityRecord = (v) => ({
  FOR: v,
  DEX: v,
  CON: v,
  INT: v,
  SAG: v,
  CHA: v
});
var MAX_ACTIVE_TRACKS = 3;
var TRACK_PROMOTE_HITS = 5;
var TRACK_DEMOTE_MISSES = 4;
var CHEST_RARITIES = ["bois", "bronze", "argent", "or", "mythique"];
var ITEM_RARITIES = ["commun", "peu_commun", "rare", "epique", "legendaire"];
var EQUIP_SLOTS = ["arme", "tete", "torse", "mains", "bottes", "amulette"];
var emptyAdventureFields = () => ({
  gold: 0,
  fragments: 0,
  keys: 0,
  chestPity: {},
  expeditionStartedAt: null,
  chestOpensDate: null,
  chestOpensToday: 0,
  power: 0,
  frameStyle: null
});

// packages/engine/src/xp.ts
var LEVEL_XP = [
  0,
  60,
  180,
  540,
  1300,
  2800,
  4600,
  6800,
  9600,
  12800,
  17e3,
  2e4,
  24e3,
  28e3,
  33e3,
  39e3,
  45e3,
  53e3,
  61e3,
  71e3
];
var MAX_LEVEL = 20;
var IMPROVEMENT_LEVELS = [4, 8, 12, 16, 19];
var PATH_LEVEL = 3;
var FORGE_LEVEL = 2;
var EPIC_LEVEL = 11;
var BASE_XP = { easy: 10, medium: 25, high: 50, expert: 100 };
var PERIOD_MULTIPLIER = {
  daily: 1,
  weekly: 3,
  monthly: 8,
  epic: 20
};
var MIN_SCORE = 2;
var POINT_BUY_BUDGET = 6;
var POINT_BUY_MAX = 5;
var REPEAT_FACTORS = [1, 0.9, 0.8, 0.7, 0.6, 0.5];
var MAX_RUNS = { daily: 3, weekly: 2, monthly: 1, epic: 1 };
var MAX_OPEN_EXTRAS = { daily: 8, weekly: 5, monthly: 3, epic: 1 };
function repeatMultiplier(doneBefore) {
  return REPEAT_FACTORS[Math.min(Math.max(Math.floor(doneBefore), 0), REPEAT_FACTORS.length - 1)];
}
var POINT_BUY_COST = {
  2: 0,
  3: 1,
  4: 2,
  5: 3
};
function levelFromXp(totalXp) {
  let level = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) {
    if (totalXp >= LEVEL_XP[i]) level = i + 1;
    else break;
  }
  return level;
}
function levelProgress(totalXp) {
  const level = levelFromXp(totalXp);
  if (level >= MAX_LEVEL) {
    return { level, current: totalXp - LEVEL_XP[MAX_LEVEL - 1], needed: 0, ratio: 1, nextLevelXp: null, remaining: 0 };
  }
  const start = LEVEL_XP[level - 1];
  const end = LEVEL_XP[level];
  return {
    level,
    current: totalXp - start,
    needed: end - start,
    ratio: (totalXp - start) / (end - start),
    nextLevelXp: end,
    remaining: end - totalXp
  };
}
function proficiencyBonus(level) {
  return 2 + Math.floor((Math.min(Math.max(level, 1), MAX_LEVEL) - 1) / 4);
}
var MAX_SCORE = 30;
var SOFT_CAP_SCORE = 20;
var UPGRADE_XP_STEP = 50;
function abilityUpgradeCost(score) {
  if (score < SOFT_CAP_SCORE) return UPGRADE_XP_STEP * (score - MIN_SCORE + 1);
  return 2e3;
}
var costAt = (k, bonus) => k + bonus >= SOFT_CAP_SCORE ? 2e3 : abilityUpgradeCost(k);
function abilityProgress(baseScore, abilityXp, bonus = 0) {
  let k = Math.max(baseScore, MIN_SCORE);
  let xp = Math.max(abilityXp, 0);
  while (k + bonus < MAX_SCORE && xp >= costAt(k, bonus)) {
    xp -= costAt(k, bonus);
    k++;
  }
  if (k + bonus >= MAX_SCORE) return { score: MAX_SCORE, current: xp, needed: 0, ratio: 1, legendary: true };
  const needed = costAt(k, bonus);
  return { score: k + bonus, current: xp, needed, ratio: xp / needed, legendary: k + bonus > SOFT_CAP_SCORE };
}
function abilityProgressOf(c, a) {
  return abilityProgress(c.baseScores[a], c.abilityXp[a] ?? 0, c.improvements[a] ?? 0);
}
function abilityScores(c) {
  const out = emptyAbilityRecord(0);
  for (const a of ABILITIES) out[a] = abilityProgressOf(c, a).score;
  return out;
}
function pointBuySpent(scores) {
  let total = 0;
  for (const a of ABILITIES) total += POINT_BUY_COST[scores[a]] ?? Infinity;
  return total;
}
function isValidPointBuy(scores) {
  for (const a of ABILITIES) {
    if (!(scores[a] >= MIN_SCORE && scores[a] <= POINT_BUY_MAX)) return false;
  }
  return pointBuySpent(scores) <= POINT_BUY_BUDGET;
}
var BALANCED_SCORES = {
  FOR: 3,
  DEX: 3,
  CON: 3,
  INT: 3,
  SAG: 3,
  CHA: 3
};
var LEGACY_POINT_BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
var LEGACY_POINT_BUY_BUDGET = 27;
function hasLegacyBaseScores(scores) {
  return ABILITIES.some((a) => scores[a] > POINT_BUY_MAX);
}
function rescaleLegacyBaseScores(scores) {
  const out = emptyAbilityRecord(MIN_SCORE);
  for (const a of ABILITIES) {
    const spent = LEGACY_POINT_BUY_COST[Math.min(Math.max(scores[a], 8), 15)];
    const points = Math.round(spent * POINT_BUY_BUDGET / LEGACY_POINT_BUY_BUDGET);
    out[a] = Math.min(MIN_SCORE + points, POINT_BUY_MAX);
  }
  return out;
}
function xpBonusForMastery(proficiency) {
  return proficiency * 5;
}
function questXp(i) {
  const base = BASE_XP[i.difficulty];
  const multiplier = PERIOD_MULTIPLIER[i.period];
  const mastery = i.masteries.includes(i.ability) ? xpBonusForMastery(proficiencyBonus(i.level)) : 0;
  const affinity = i.pathAbility && i.pathAbility === i.ability ? 2 : 0;
  const core = i.scale && i.scale !== 1 ? Math.max(Math.round(base * multiplier * i.scale), 1) : base * multiplier;
  const repeat = repeatMultiplier(i.repeat ?? 0);
  const full = core + mastery + affinity;
  const sub = repeat === 1 ? full : Math.max(1, Math.round(full * repeat));
  return { base, multiplier, mastery, affinity, doubled: !!i.doubled, repeat, total: i.doubled ? sub * 2 : sub };
}
function splitXp(total, primary, secondary) {
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(Math.round(total));
  const parts = [];
  let given = 0;
  for (const s of secondary ?? []) {
    if (s.ability === primary) continue;
    const amount = Math.floor(abs * s.pct / 100);
    if (amount > 0) {
      parts.push({ ability: s.ability, amount: amount * sign });
      given += amount;
    }
  }
  parts.unshift({ ability: primary, amount: (abs - given) * sign });
  return parts.filter((p) => p.amount !== 0);
}
var BALANCE_CATCHUP_GAP = -1;
var BALANCE_SPECIALIZE_GAP = 4;
var BALANCE_HEAVY_SPECIALIZE_GAP = 7;
var BALANCE_CATCHUP_FACTOR = 1.5;
var BALANCE_SPECIALIZE_FACTOR = 0.75;
var BALANCE_HEAVY_SPECIALIZE_FACTOR = 0.5;
function balanceGap(ability, scores) {
  let others = 0;
  let n = 0;
  for (const a of ABILITIES) {
    if (a === ability) continue;
    others += scores[a];
    n++;
  }
  return scores[ability] - others / n;
}
function xpBalanceFactor(ability, scores) {
  const n = ABILITIES.length - 1;
  let others = 0;
  for (const a of ABILITIES) if (a !== ability) others += scores[a];
  const gapTimesN = scores[ability] * n - others;
  if (gapTimesN <= BALANCE_CATCHUP_GAP * n) return BALANCE_CATCHUP_FACTOR;
  if (gapTimesN >= BALANCE_HEAVY_SPECIALIZE_GAP * n) return BALANCE_HEAVY_SPECIALIZE_FACTOR;
  if (gapTimesN >= BALANCE_SPECIALIZE_GAP * n) return BALANCE_SPECIALIZE_FACTOR;
  return 1;
}
function balanceAmount(amount, factor) {
  if (amount < 1 || factor === 1) return amount;
  return Math.max(1, Math.round(amount * factor));
}
function applyBalance(parts, scores) {
  return parts.map((p) => ({ ability: p.ability, amount: balanceAmount(p.amount, xpBalanceFactor(p.ability, scores)) }));
}
function balanceDetails(parts, scores) {
  const out = [];
  for (const p of parts) {
    const factor = xpBalanceFactor(p.ability, scores);
    if (factor !== 1 && p.amount >= 1) out.push({ ability: p.ability, factor, base: p.amount, awarded: balanceAmount(p.amount, factor) });
  }
  return out;
}
function previewBalance(scores, ability, secondary) {
  const entries = xpShares(ability, secondary).map((s) => ({ ability: s.ability, pct: s.pct, factor: xpBalanceFactor(s.ability, scores) }));
  const factor = entries.reduce((n, e) => n + e.factor * e.pct / 100, 0);
  const percent = Math.round((factor - 1) * 100);
  const kind = percent > 0 ? "catchup" : percent < 0 ? "specialization" : "none";
  const label = kind === "catchup" ? `+${percent} % XP en rattrapage` : kind === "specialization" ? `\u2212${-percent} % XP (sp\xE9cialisation)` : null;
  return { entries, factor, kind, percent, label };
}
function partialXp(fullXp, progress, target) {
  if (target <= 0) return 0;
  const ratio = progress / target;
  if (ratio < 0.5) return 0;
  return Math.floor(fullXp * Math.min(ratio, 1));
}
function pendingImprovements(level, chosen) {
  const due = IMPROVEMENT_LEVELS.filter((l) => l <= level).length;
  return Math.max(due - chosen, 0);
}
function pendingPath(level, pathId) {
  return level >= PATH_LEVEL && !pathId;
}
function unlocksAt(level) {
  const dailyQuests = level >= 17 ? 6 : level >= 10 ? 5 : level >= 5 ? 4 : 3;
  const weeklyQuests = level >= 14 ? 4 : level >= 6 ? 3 : 2;
  const monthlyQuests = level >= 10 ? 2 : 1;
  return {
    dailyQuests,
    weeklyQuests,
    monthlyQuests,
    epic: level >= EPIC_LEVEL,
    forge: level >= FORGE_LEVEL,
    expertEverywhere: level >= TIER4_MIN_LEVEL
  };
}
function questCountFor(period, level, dailySetting) {
  const u = unlocksAt(level);
  switch (period) {
    case "daily":
      return dailySetting != null ? Math.min(Math.max(dailySetting, 0), u.dailyQuests) : u.dailyQuests;
    case "weekly":
      return u.weeklyQuests;
    case "monthly":
      return u.monthlyQuests;
    case "epic":
      return u.epic ? 1 : 0;
  }
}
function tierAt(level) {
  if (level >= 17) return { index: 4, name: "Expert" };
  if (level >= 11) return { index: 3, name: "Confirm\xE9" };
  if (level >= 5) return { index: 2, name: "R\xE9gulier" };
  return { index: 1, name: "D\xE9butant" };
}
var TIER3_MIN_SCORE = 6;
var TIER4_MIN_LEVEL = EPIC_LEVEL;
function tierUnlocked(difficulty, score, level) {
  if (difficulty === "high") return score >= TIER3_MIN_SCORE;
  if (difficulty === "expert") return level >= TIER4_MIN_LEVEL;
  return true;
}
function questLock(difficulty, score, level, abilityLabel = "caract\xE9ristique") {
  if (tierUnlocked(difficulty, score, level)) return { locked: false };
  if (difficulty === "high") return { locked: true, reason: `${abilityLabel} ${TIER3_MIN_SCORE} requis (tu es \xE0 ${score})` };
  return { locked: true, reason: `Niveau ${TIER4_MIN_LEVEL} requis (tu es niveau ${level})` };
}
function xpShares(primary, secondary) {
  const others = (secondary ?? []).filter((s) => s.ability !== primary && s.pct > 0);
  const rest = 100 - others.reduce((n, s) => n + s.pct, 0);
  return [{ ability: primary, pct: rest }, ...others];
}

// packages/engine/src/dates.ts
var pad = (n) => String(n).padStart(2, "0");
function toDateStr(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function parseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}
function utc(s) {
  const { y, m, d } = parseDateStr(s);
  return Date.UTC(y, m - 1, d);
}
function fromUtc(ms) {
  const dt = new Date(ms);
  return toDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
function addDays(s, n) {
  return fromUtc(utc(s) + n * 864e5);
}
function diffDays(a, b) {
  return Math.round((utc(a) - utc(b)) / 864e5);
}
function isoWeekday(s) {
  const dow = new Date(utc(s)).getUTCDay();
  return dow === 0 ? 7 : dow;
}
function startOfIsoWeek(s) {
  return addDays(s, -(isoWeekday(s) - 1));
}
function endOfIsoWeek(s) {
  return addDays(startOfIsoWeek(s), 6);
}
function startOfMonth(s) {
  const { y, m } = parseDateStr(s);
  return toDateStr(y, m, 1);
}
function endOfMonth(s) {
  const { y, m } = parseDateStr(s);
  return fromUtc(Date.UTC(y, m, 0));
}
function startOfQuarter(s) {
  const { y, m } = parseDateStr(s);
  return toDateStr(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
}
function endOfQuarter(s) {
  const { y, m } = parseDateStr(s);
  const qEndMonth = Math.floor((m - 1) / 3) * 3 + 3;
  return fromUtc(Date.UTC(y, qEndMonth, 0));
}
function isoWeek(s) {
  const d = new Date(utc(s));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 864e5 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}
function periodBounds(period, gameDate2) {
  switch (period) {
    case "daily":
      return { start: gameDate2, end: gameDate2 };
    case "weekly":
      return { start: startOfIsoWeek(gameDate2), end: endOfIsoWeek(gameDate2) };
    case "monthly":
      return { start: startOfMonth(gameDate2), end: endOfMonth(gameDate2) };
    case "epic":
      return { start: startOfQuarter(gameDate2), end: endOfQuarter(gameDate2) };
  }
}
function localParts(ms, tz) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const p = {};
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { date: `${p["year"]}-${p["month"]}-${p["day"]}`, hour: Number(p["hour"]), minute: Number(p["minute"]) };
}
function gameDate(nowMs, tz, resetHour) {
  const { date, hour } = localParts(nowMs, tz);
  return hour < resetHour ? addDays(date, -1) : date;
}
function localMinutes(nowMs, tz) {
  const { hour, minute } = localParts(nowMs, tz);
  return hour * 60 + minute;
}
function localDate(nowMs, tz) {
  return localParts(nowMs, tz).date;
}
function msUntilReset(nowMs, tz, resetHour) {
  const minutes = localMinutes(nowMs, tz);
  const target = resetHour * 60;
  let diff = target - minutes;
  if (diff <= 0) diff += 24 * 60;
  return diff * 6e4;
}
function daysLeft(periodEnd, today) {
  return Math.max(diffDays(periodEnd, today) + 1, 0);
}
function isDateInRange(date, start, end) {
  return date >= start && date <= end;
}
function listDays(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
function lastAcceptDate(period, periodStart, periodEnd) {
  switch (period) {
    case "daily":
      return periodEnd;
    case "weekly":
      return addDays(periodStart, 4);
    case "monthly":
      return addDays(periodEnd, -7);
    case "epic":
      return addDays(periodEnd, -14);
  }
}

// packages/engine/src/random.ts
function hashString(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  h = Math.imul(h ^ h >>> 16, 2246822507);
  h = Math.imul(h ^ h >>> 13, 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function createRng(seed) {
  let a = typeof seed === "string" ? hashString(seed) : seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function weightedPick(items, weight, rng) {
  let total = 0;
  const ws = items.map((i) => {
    const w = Math.max(weight(i), 0);
    total += w;
    return w;
  });
  if (!items.length || total <= 0) return void 0;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function shuffle(items, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// packages/engine/src/draw.ts
var ANTI_REPEAT_DAYS = {
  daily: 7,
  weekly: 28,
  monthly: 90,
  epic: 270
};
function difficultyWeights(period, level) {
  switch (period) {
    case "daily":
      return { easy: 60, medium: 35, high: level >= 5 ? 5 : 0, expert: 0 };
    case "weekly":
      return { easy: 0, medium: 50, high: 40, expert: level >= TIER4_MIN_LEVEL ? 10 : 0 };
    case "monthly":
      return { easy: 0, medium: 0, high: level >= TIER4_MIN_LEVEL ? 50 : 100, expert: level >= TIER4_MIN_LEVEL ? 50 : 0 };
    case "epic":
      return { easy: 0, medium: 0, high: 0, expert: 100 };
  }
}
function accessible(t, scores, level) {
  return tierUnlocked(t.difficulty, scores[t.ability], level);
}
function balanceWeight(score, min, max) {
  return max > min ? 1 + 3 * (max - score) / (max - min) : 1;
}
function drawQuests(input) {
  const rng = createRng(`${input.characterId}|${input.period}|${input.periodStart}|${input.seedSuffix ?? ""}`);
  const relaxed = /* @__PURE__ */ new Set();
  const picks = [];
  const picked = new Set(input.exclude ?? []);
  const prefs = input.preferences;
  const eligible = input.templates.filter((t) => t.isActive !== false && !t.trackId && t.periods.includes(input.period) && !prefs[t.id]?.isExcluded);
  const pool = eligible.filter((t) => accessible(t, input.scores, input.level));
  if (!input.skipPinned && !input.difficultyPlan) {
    for (const t of pool) {
      if (prefs[t.id]?.isPinned && !picked.has(t.id)) {
        picks.push(t);
        picked.add(t.id);
      }
    }
  }
  const sortedScores = ABILITIES.map((a) => input.scores[a]).sort((a, b) => a - b);
  const minScore = sortedScores[0];
  const maxScore = sortedScores[sortedScores.length - 1];
  const slots = input.difficultyPlan ? input.difficultyPlan.length : Math.max(input.count - picks.length, 0);
  const dw = difficultyWeights(input.period, input.level);
  for (let slot = 0; slot < slots; slot++) {
    const wantedDifficulty = input.difficultyPlan?.[slot];
    const chosenDifficulty = wantedDifficulty ?? weightedPick(DIFFICULTIES, (d) => dw[d], rng) ?? "easy";
    const idx = DIFFICULTIES.indexOf(chosenDifficulty);
    const order = [...DIFFICULTIES].sort((a, b) => Math.abs(DIFFICULTIES.indexOf(a) - idx) - Math.abs(DIFFICULTIES.indexOf(b) - idx));
    let found;
    let source = pool;
    for (let attempt = 0; attempt < 2 && !found; attempt++) {
      if (attempt === 1) {
        const open = eligible.filter((t) => !picked.has(t.id));
        const best = Math.max(-Infinity, ...open.map((t) => input.scores[t.ability]));
        source = open.filter((t) => input.scores[t.ability] === best);
        if (!source.length) break;
      }
      for (let relax = 0; relax <= 3 && !found; relax++) {
        const useAntiRepeat = relax < 1;
        const useBalance = relax < 2;
        const useNoDup = relax < 3;
        for (const diff of order) {
          if (wantedDifficulty && diff !== wantedDifficulty && relax < 1) continue;
          let cands = source.filter((t) => t.difficulty === diff && !picked.has(t.id));
          if (useAntiRepeat) {
            const win = ANTI_REPEAT_DAYS[input.period];
            cands = cands.filter((t) => {
              const last = input.lastDrawn[t.id];
              return !last || diffDays(input.periodStart, last) >= win;
            });
          }
          if (useNoDup && input.period === "daily" && input.count <= 6) {
            const used = new Set(picks.map((p) => p.ability));
            if (used.size < ABILITIES.length) cands = cands.filter((t) => !used.has(t.ability));
          }
          if (!cands.length) continue;
          found = weightedPick(cands, (t) => useBalance ? balanceWeight(input.scores[t.ability], minScore, maxScore) : 1, rng);
          if (found) {
            if (!useAntiRepeat) relaxed.add("anti-repeat");
            if (!useBalance) relaxed.add("balance");
            if (!useNoDup && input.period === "daily") relaxed.add("duplicate-ability");
            if (attempt === 1) relaxed.add("locked");
            break;
          }
        }
      }
    }
    if (!found) break;
    picks.push(found);
    picked.add(found.id);
  }
  return { picks, relaxed: [...relaxed] };
}
function lastDrawnMap(instances, period) {
  const out = {};
  for (const i of instances) {
    if (i.period !== period) continue;
    if (!out[i.templateId] || i.periodStart > out[i.templateId]) out[i.templateId] = i.periodStart;
  }
  return out;
}
function availableAgainOn(period, lastPeriodStart) {
  return addDays(lastPeriodStart, ANTI_REPEAT_DAYS[period]);
}

// packages/engine/src/interests.ts
var slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
var interestKey = (theme, activityName) => activityName ? `${theme}:${slugify(activityName)}` : theme;
var MAX_INTERESTS = 80;
function sanitizeInterests(list) {
  if (!Array.isArray(list)) return [];
  const out = /* @__PURE__ */ new Set();
  for (const v of list) {
    if (typeof v === "string" && /^[a-z0-9-]{1,40}(:[a-z0-9-]{1,60})?$/.test(v)) out.add(v);
    if (out.size >= MAX_INTERESTS) break;
  }
  return [...out];
}
function activityOf(t) {
  if (!t.theme) return null;
  const prefix = `g-${t.theme}-`;
  if (!t.id.startsWith(prefix)) return null;
  return t.id.slice(prefix.length).replace(/-t\d$/, "") || null;
}
function interestWeight(t, interests) {
  if (!t.theme) return 1;
  if (!interests?.length) return 0.35;
  const activity = activityOf(t);
  if (activity && interests.includes(`${t.theme}:${activity}`)) return 6;
  if (interests.includes(t.theme)) {
    const precise = interests.some((k) => k.startsWith(`${t.theme}:`));
    return precise ? 1.2 : 3;
  }
  return 0.08;
}
var TUNE_FACTOR = { [-1]: 0.5, 0: 1, 1: 1.5 };
function niceTarget(n) {
  if (n >= 500) return Math.round(n / 50) * 50;
  if (n >= 100) return Math.round(n / 10) * 10;
  if (n >= 30) return Math.round(n / 5) * 5;
  return Math.max(1, Math.round(n));
}
function tunableTarget(v) {
  if (v.type === "counter") return v.target;
  if (v.type === "timer") return v.minutes;
  return null;
}
function tunedTarget(base, tune) {
  return tune === 0 ? base : niceTarget(base * TUNE_FACTOR[tune]);
}
function withTarget(v, target) {
  if (v.type === "counter") return { ...v, target };
  if (v.type === "timer") return { ...v, minutes: target };
  return v;
}
function baseTargetOf(s) {
  return s.baseTarget ?? tunableTarget(s.validation);
}
function tunedSnapshot(snap, base, tune) {
  const baseTarget = tunableTarget(base);
  if (baseTarget === null || tune === 0) return { ...snap, validation: base };
  const target = tunedTarget(baseTarget, tune);
  if (target === baseTarget) return { ...snap, validation: base };
  return { ...snap, validation: withTarget(base, target), tune, baseTarget };
}
function nextTune(current, base, dir) {
  const baseTarget = tunableTarget(base);
  if (baseTarget === null) return null;
  const cur = current ?? 0;
  const next = Math.max(-1, Math.min(1, cur + (dir === "easier" ? -1 : 1)));
  if (next === cur) return null;
  if (next !== 0 && tunedTarget(baseTarget, next) === baseTarget) return null;
  return next;
}
function tuneXpScale(s) {
  const base = s.baseTarget;
  const now = tunableTarget(s.validation);
  if (!base || !now) return 1;
  return Math.min(Math.max(now / base, 0.4), 1.6);
}

// packages/engine/src/complete.ts
var MAX_INSPIRATION = 3;
var UNDO_WINDOW_MS = 24 * 3600 * 1e3;
var OFFLINE_MAX_DELAY_MS = 72 * 3600 * 1e3;
var JOURNAL_MIN_CHARS = 50;
function validationTarget(v) {
  switch (v.type) {
    case "simple":
      return 1;
    case "counter":
      return v.target;
    case "timer":
      return v.minutes;
    case "steps":
      return v.steps.length;
    case "journal":
      return 1;
  }
}
function progressRatio(inst) {
  const v = inst.snapshot.validation;
  if (v.type === "steps") {
    const done = (inst.stepsDone ?? []).filter(Boolean).length;
    return v.steps.length ? done / v.steps.length : 0;
  }
  const target = validationTarget(v);
  return target ? Math.min(inst.progress / target, 1) : 0;
}
function isReadyToComplete(inst, journalText) {
  const v = inst.snapshot.validation;
  switch (v.type) {
    case "simple":
      return null;
    case "counter":
      return inst.progress >= v.target ? null : "incomplete";
    case "timer":
      return inst.progress >= v.minutes ? null : "incomplete";
    case "steps":
      return (inst.stepsDone ?? []).filter(Boolean).length >= v.steps.length ? null : "incomplete";
    case "journal":
      return (journalText ?? "").trim().length >= (v.minChars ?? JOURNAL_MIN_CHARS) ? null : "journal-too-short";
  }
}
function applyXp(character, ability, amount) {
  const before = character;
  const abilityXp = { ...before.abilityXp, [ability]: Math.max((before.abilityXp[ability] ?? 0) + amount, 0) };
  const totalXp = Math.max(before.totalXp + amount, 0);
  const level = levelFromXp(totalXp);
  const next = { ...before, abilityXp, totalXp, level };
  const levelsGained = [];
  const levelsLost = [];
  for (let l = before.level + 1; l <= level; l++) levelsGained.push(l);
  for (let l = before.level; l > level; l--) levelsLost.push(l);
  const abilityUps = [];
  const from = abilityProgressOf(before, ability).score;
  const to = abilityProgressOf(next, ability).score;
  if (to > from) abilityUps.push({ ability, from, to });
  return {
    character: next,
    levelsGained,
    levelsLost,
    abilityUps,
    pendingImprovements: pendingImprovements(level, before.improvementsChosen),
    pendingPath: pendingPath(level, before.pathId)
  };
}
function applyXpParts(character, parts) {
  let current = character;
  const levelsGained = [];
  const levelsLost = [];
  const abilityUps = [];
  for (const p of parts) {
    const r = applyXp(current, p.ability, p.amount);
    current = r.character;
    levelsGained.push(...r.levelsGained);
    levelsLost.push(...r.levelsLost);
    abilityUps.push(...r.abilityUps);
  }
  return {
    character: current,
    levelsGained,
    levelsLost,
    abilityUps,
    pendingImprovements: pendingImprovements(current.level, character.improvementsChosen),
    pendingPath: pendingPath(current.level, character.pathId)
  };
}
function completeQuest(input) {
  const { character, instance } = input;
  if (instance.status === "completed") return { ok: false, error: "already-completed" };
  if (instance.status !== "accepted") return { ok: false, error: "not-accepted" };
  if (input.useInspiration && character.inspiration < 1) return { ok: false, error: "no-inspiration" };
  const merged = {
    snapshot: instance.snapshot,
    progress: input.progress ?? instance.progress,
    stepsDone: input.stepsDone ?? instance.stepsDone
  };
  const notReady = isReadyToComplete(merged, input.journalText);
  if (notReady) return { ok: false, error: notReady };
  const breakdown = questXp({
    difficulty: instance.snapshot.difficulty,
    period: instance.period,
    ability: instance.snapshot.ability,
    level: character.level,
    masteries: input.masteries,
    pathAbility: input.pathAbility,
    doubled: input.useInspiration,
    scale: tuneXpScale(instance.snapshot),
    repeat: input.repeat
  });
  const base = input.useInspiration ? { ...character, inspiration: character.inspiration - 1 } : character;
  const scores = abilityScores(character);
  const baseParts = splitXp(breakdown.total, instance.snapshot.ability, instance.snapshot.secondary);
  const parts = applyBalance(baseParts, scores);
  const balance = balanceDetails(baseParts, scores);
  const applied = applyXpParts(base, parts);
  return {
    ok: true,
    result: {
      ...applied,
      xpAwarded: parts.reduce((n, p) => n + p.amount, 0),
      parts,
      balance,
      breakdown,
      inspirationSpent: input.useInspiration
    }
  };
}
function expiredPartialXp(inst, level, masteries, pathAbility) {
  const v = inst.snapshot.validation;
  if (v.type !== "counter") return 0;
  const full = questXp({
    difficulty: inst.snapshot.difficulty,
    period: inst.period,
    ability: inst.snapshot.ability,
    level,
    masteries,
    pathAbility,
    scale: tuneXpScale(inst.snapshot)
  }).total;
  return partialXp(full, inst.progress, v.target);
}
function canUndo(completedAtIso, nowMs) {
  if (!completedAtIso) return false;
  return nowMs - Date.parse(completedAtIso) <= UNDO_WINDOW_MS;
}
function offlineCompletionAllowed(clientCompletedAtMs, serverNowMs, periodStartMs, periodEndMs) {
  if (serverNowMs - clientCompletedAtMs > OFFLINE_MAX_DELAY_MS) return false;
  return clientCompletedAtMs >= periodStartMs && clientCompletedAtMs <= periodEndMs;
}
function hardcorePenalty(inst) {
  return Math.ceil(BASE_XP[inst.snapshot.difficulty] * 0.1);
}
function computeStreak(dailyDoneDays, restDays, today) {
  const done = new Set(dailyDoneDays);
  const rest = new Set(restDays);
  let streak = 0;
  const doneToday = done.has(today);
  if (doneToday) streak++;
  let cursor = addDays(today, -1);
  for (let guard = 0; guard < 4e3; guard++) {
    if (done.has(cursor)) streak++;
    else if (!rest.has(cursor)) break;
    cursor = addDays(cursor, -1);
  }
  return { current: streak, doneToday };
}
function computeBestStreak(dailyDoneDays, restDays) {
  const days = [...new Set(dailyDoneDays)].sort();
  if (!days.length) return 0;
  const rest = new Set(restDays);
  let best = 0;
  let cur = 0;
  let prev = null;
  for (const d of days) {
    if (prev === null) cur = 1;
    else {
      let gap = addDays(prev, 1);
      let bridged = true;
      while (gap < d) {
        if (!rest.has(gap)) {
          bridged = false;
          break;
        }
        gap = addDays(gap, 1);
      }
      cur = bridged ? cur + 1 : 1;
    }
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}
function inspirationAfterStreak(prevStreak, newStreak, inspiration) {
  const crossed = newStreak > prevStreak && newStreak > 0 && newStreak % 7 === 0;
  if (!crossed) return { inspiration, gained: false, overflow: false };
  if (inspiration >= MAX_INSPIRATION) return { inspiration, gained: false, overflow: true };
  return { inspiration: inspiration + 1, gained: true, overflow: false };
}
function canDeclareRest(restDays, date) {
  const key = (d) => {
    const w = isoWeek(d);
    return `${w.year}-${w.week}`;
  };
  return !restDays.some((d) => key(d) === key(date) && d !== date);
}
function weekStartOf(date) {
  return startOfIsoWeek(date);
}
function totalAbilityScoreSum(scores) {
  return ABILITIES.reduce((s, a) => s + scores[a], 0);
}

// packages/engine/src/tracks.ts
var TRACK_RUNGS = 10;
function trackRungMinScore(rung) {
  if (rung <= 4) return 0;
  if (rung <= 6) return 4;
  if (rung <= 8) return 6;
  return 9;
}
function trackRungDifficulty(rung) {
  if (rung <= 3) return "easy";
  if (rung <= 6) return "medium";
  if (rung <= 9) return "high";
  return "expert";
}
function rungTemplateId(trackId, rung) {
  return `${trackId}-r${String(rung).padStart(2, "0")}`;
}
function effectiveRung(def, state, scores) {
  const score = scores[def.ability] ?? 0;
  for (let r = Math.max(Math.min(state.rung, def.rungs.length), 1); r > 1; r--) {
    if (score >= trackRungMinScore(r)) return r;
  }
  return 1;
}
function trackShapes(templates) {
  const byTrack = /* @__PURE__ */ new Map();
  for (const t of templates) {
    if (!t.trackId || t.rung == null || t.isActive === false) continue;
    const list = byTrack.get(t.trackId);
    if (list) list.push(t);
    else byTrack.set(t.trackId, [t]);
  }
  const out = /* @__PURE__ */ new Map();
  for (const [id, list] of byTrack) {
    list.sort((a, b) => a.rung - b.rung);
    out.set(id, { ability: list[0].ability, rungs: list.map((t) => ({ rung: t.rung })) });
  }
  return out;
}
function buildRungTemplates(defs) {
  const out = [];
  for (const d of defs) {
    for (const r of d.rungs) {
      out.push({
        id: rungTemplateId(d.id, r.rung),
        source: "catalog",
        ability: d.ability,
        difficulty: r.difficulty,
        periods: ["daily"],
        title: r.title,
        flavor: d.blurb,
        objective: r.objective,
        tips: r.tips,
        validation: r.validation,
        tags: [],
        theme: d.theme,
        ...d.secondary.length ? { secondary: d.secondary } : {},
        isActive: true,
        trackId: d.id,
        rung: r.rung
      });
    }
  }
  return out;
}
function missedDays(state, today, restDays, doneDays = []) {
  return applyMisses(state, today, restDays, doneDays).missed;
}
function applyMisses(state, today, restDays, doneDays = []) {
  const yesterday = addDays(today, -1);
  if (state.status !== "active" || !state.lastCheckedDate || state.lastCheckedDate >= yesterday) {
    return { state, missed: [], demoted: false };
  }
  const rest = new Set(restDays);
  const done = new Set(doneDays);
  if (state.lastDoneDate) done.add(state.lastDoneDate);
  let rung = state.rung;
  let hits = state.hits;
  let penalized = false;
  let run = 0;
  let runStart = "";
  const missed = [];
  for (let day = addDays(state.lastCheckedDate, 1); day <= yesterday; day = addDays(day, 1)) {
    if (done.has(day)) {
      run = 0;
      continue;
    }
    if (rest.has(day)) continue;
    missed.push(day);
    if (run === 0) runStart = day;
    run++;
    if (run >= TRACK_DEMOTE_MISSES) {
      if (!penalized) {
        penalized = true;
        rung = Math.max(rung - 1, 1);
        hits = 0;
      }
      run = 0;
    }
  }
  const lastCheckedDate = run > 0 ? addDays(runStart, -1) : yesterday;
  return { state: { ...state, rung, hits, lastCheckedDate }, missed, demoted: rung < state.rung };
}
function advanceOnCompletion(state, day, maxRung = TRACK_RUNGS) {
  if (state.status !== "active" || state.lastDoneDate === day) return state;
  let { rung, hits } = state;
  hits += 1;
  if (hits >= TRACK_PROMOTE_HITS) {
    if (rung < maxRung) {
      rung += 1;
      hits = 0;
    } else {
      hits = TRACK_PROMOTE_HITS;
    }
  }
  const lastDoneDate = !state.lastDoneDate || day > state.lastDoneDate ? day : state.lastDoneDate;
  return { ...state, rung, hits, bestRung: Math.max(state.bestRung, rung), lastDoneDate };
}
function revertCompletion(state, day, previousDoneDate = null) {
  let { rung, hits, bestRung } = state;
  if (hits > 0) {
    hits -= 1;
  } else if (rung > 1) {
    if (bestRung === rung) bestRung = rung - 1;
    rung -= 1;
    hits = TRACK_PROMOTE_HITS - 1;
  }
  return { ...state, rung, hits, bestRung, lastDoneDate: state.lastDoneDate === day ? previousDoneDate : state.lastDoneDate };
}

// packages/engine/src/sets.ts
var NO_SET_BONUS = { pp: 0, abilities: {}, active: [] };
function setTier(bonuses, pieces) {
  let best = null;
  for (const b of bonuses) if (pieces >= b.pieces && (!best || b.pieces > best.pieces)) best = b;
  return best;
}
function nextSetTier(bonuses, pieces) {
  let next = null;
  for (const b of bonuses) if (b.pieces > pieces && (!next || b.pieces < next.pieces)) next = b;
  return next;
}
function setBonusTotals(sets, items) {
  const worn = items.filter((i) => i.equipped);
  const out = { pp: 0, abilities: {}, active: [] };
  for (const set of sets) {
    const pieces = EQUIP_SLOTS.filter((slot) => worn.some((i) => i.slot === slot && i.templateId === set.pieces[slot])).length;
    const tier = setTier(set.bonuses, pieces);
    if (!tier) continue;
    out.pp += tier.pp;
    if (tier.ability) out.abilities[set.ability] = (out.abilities[set.ability] ?? 0) + tier.ability;
    out.active.push({ setId: set.id, pieces, tier });
  }
  return out;
}
function setsProgress(sets, items) {
  return sets.map((set) => {
    const pieces = EQUIP_SLOTS.map((slot) => {
      const templateId = set.pieces[slot];
      const mine = items.filter((i) => i.templateId === templateId && i.slot === slot);
      return { slot, templateId, owned: mine.length > 0, equipped: mine.some((i) => i.equipped) };
    });
    const equipped = pieces.filter((p) => p.equipped).length;
    return {
      setId: set.id,
      equipped,
      owned: pieces.filter((p) => p.owned).length,
      pieces,
      tier: setTier(set.bonuses, equipped),
      next: nextSetTier(set.bonuses, equipped)
    };
  });
}

// packages/engine/src/adventure.ts
var CHEST_OPENS_PER_DAY = 2;
var MAX_KEYS = 3;
var MERGE_COUNT = 3;
var EXPEDITION_CAP_HOURS = 24;
var EXPEDITION_GOLD_PER_HOUR = 20;
var EXPEDITION_GOLD_PP_DIV = 200;
var EXPEDITION_INT_DIV = 40;
var EXPEDITION_FRAGMENT_PP_DIV = 400;
var EXPEDITION_DEX_DIV = 50;
var EXPEDITION_STREAK_STEP = 0.02;
var EXPEDITION_STREAK_MAX = 0.3;
var EXPEDITION_KEY_CHANCE = 0.05;
var EXPEDITION_MIN_CLAIM_MS = 6e4;
var SAG_SHIFT_PCT = 2;
var SAG_SHIFT_STEP = 10;
var PITY_EPIC = 8;
var PITY_LEGENDARY = 25;
var PITY_EPIC_MIN_CHEST = "bronze";
var PITY_LEGENDARY_MIN_CHEST = "or";
var CHEST_TABLE = {
  bois: { odds: [70, 25, 5, 0, 0], fragments: 5, gold: 50 },
  bronze: { odds: [35, 40, 20, 5, 0], fragments: 15, gold: 150 },
  argent: { odds: [5, 30, 45, 18, 2], fragments: 40, gold: 400 },
  or: { odds: [0, 5, 35, 50, 10], fragments: 100, gold: 1e3 },
  mythique: { odds: [0, 0, 10, 55, 35], fragments: 250, gold: 3e3 }
};
var ITEM_BASE_POWER = { commun: 5, peu_commun: 12, rare: 28, epique: 60, legendaire: 130 };
var ITEM_LEVEL_STEP = 0.1;
var ITEM_MAX_LEVEL = 10;
var ITEM_AFFINITY_BONUS = 0.1;
var ITEM_ABILITY_BONUS_DIV = 12;
var DISMANTLE_FRAGMENTS = { commun: 2, peu_commun: 5, rare: 12, epique: 30, legendaire: 80 };
var UPGRADE_FRAGMENTS_STEP = 5;
var UPGRADE_GOLD_STEP = 100;
var UPGRADE_GOLD_EXPONENT = 1.5;
var DUNGEON_ROOMS = 5;
var DUNGEON_ROOM_GROWTH = 1.35;
var DUNGEON_BOSS_MULT = 1.5;
var DUNGEON_CON_DIV = 60;
var DUNGEON_FOR_DIV = 60;
var DUNGEON_BASE_START = 40;
var DUNGEON_TIER_GROWTH = 1.5;
var DUNGEON_UNLOCK_PER_TIER = 3;
var DUNGEON_ROOM_GOLD = 40;
var DUNGEON_ROOM_FRAGMENTS = 4;
var DUNGEON_BOSS_REWARD_ROOMS = 3;
var DUNGEON_SILVER_TIER = 5;
var DUNGEON_BOSS_ROOM = DUNGEON_ROOMS + 1;
var STREAK_MILESTONE_CHESTS = { 7: "argent", 30: "or", 100: "mythique" };
var rarityIndex = (list, r) => list.indexOf(r);
function itemPower(item, masteries = []) {
  const level = Math.min(Math.max(Math.trunc(item.level) || 0, 0), ITEM_MAX_LEVEL);
  const affinity = masteries.includes(item.ability) ? 1 + ITEM_AFFINITY_BONUS : 1;
  return Math.round(ITEM_BASE_POWER[item.rarity] * (1 + ITEM_LEVEL_STEP * level) * affinity);
}
function itemAbilityBonus(item, masteries = []) {
  return Math.floor(itemPower(item, masteries) / ITEM_ABILITY_BONUS_DIV);
}
function adventureScores(scores, equipped, masteries = [], sets = NO_SET_BONUS) {
  const out = { ...scores };
  for (const it of equipped) out[it.ability] += itemAbilityBonus(it, masteries);
  for (const a of ABILITIES) out[a] += sets.abilities[a] ?? 0;
  return out;
}
function heroPowerBreakdown(character, equipped, masteries = [], sets = NO_SET_BONUS) {
  const scores = abilityScores(character);
  const level = character.level * 10;
  const sum = ABILITIES.reduce((n, a) => n + scores[a], 0);
  const items = equipped.filter((i) => i.equipped).reduce((n, i) => n + itemPower(i, masteries), 0);
  return { total: level + sum + items + sets.pp, level, scores: sum, items, sets: sets.pp };
}
function heroPower(character, equipped, masteries = [], sets = NO_SET_BONUS) {
  return heroPowerBreakdown(character, equipped, masteries, sets).total;
}
function streakMultiplier(streak) {
  return 1 + Math.min(EXPEDITION_STREAK_MAX, EXPEDITION_STREAK_STEP * Math.max(0, streak));
}
function expeditionRates(pp, scores, streak) {
  const speed = (1 + Math.max(0, scores.DEX) / EXPEDITION_DEX_DIV) * streakMultiplier(streak);
  return {
    goldPerHour: EXPEDITION_GOLD_PER_HOUR * (1 + pp / EXPEDITION_GOLD_PP_DIV) * (1 + Math.max(0, scores.INT) / EXPEDITION_INT_DIV) * speed,
    fragmentsPerHour: (1 + pp / EXPEDITION_FRAGMENT_PP_DIV) * speed
  };
}
function expeditionYield(input) {
  const rawHours = Math.max(0, input.elapsedMs) / 36e5;
  const hours = Math.min(rawHours, EXPEDITION_CAP_HOURS);
  const rates = expeditionRates(input.pp, input.scores, input.streak);
  return {
    ...rates,
    hours,
    capped: rawHours >= EXPEDITION_CAP_HOURS,
    gold: Math.floor(rates.goldPerHour * hours),
    fragments: Math.floor(rates.fragmentsPerHour * hours),
    keyChance: EXPEDITION_KEY_CHANCE * hours / EXPEDITION_CAP_HOURS
  };
}
function rollExpeditionKey(seed, chance) {
  return createRng(`${seed}|key`)() < chance;
}
var DAILY_FREE_CHEST = "bois";
function dailyChestRarity(streak) {
  return streak >= 30 ? "argent" : streak >= 7 ? "bronze" : "bois";
}
function rungChestRarity(rung) {
  return rung >= 10 ? "mythique" : rung >= 8 ? "or" : rung >= 5 ? "argent" : "bronze";
}
function streakMilestoneChest(streak) {
  return STREAK_MILESTONE_CHESTS[streak] ?? null;
}
function nextChestRarity(r) {
  return CHEST_RARITIES[rarityIndex(CHEST_RARITIES, r) + 1] ?? null;
}
function nextItemRarity(r) {
  return ITEM_RARITIES[rarityIndex(ITEM_RARITIES, r) + 1] ?? null;
}
function adjustedOdds(chest, sag) {
  const odds = [...CHEST_TABLE[chest].odds];
  const low = odds.findIndex((p) => p > 0);
  let high = odds.length - 1;
  while (high > 0 && odds[high] === 0) high--;
  if (low < 0 || low >= high) return odds;
  const shift = Math.min(Math.floor(Math.max(0, sag) / SAG_SHIFT_STEP) * SAG_SHIFT_PCT, odds[low]);
  odds[low] -= shift;
  odds[high] += shift;
  return odds;
}
function drawChest(input) {
  const { chest } = input;
  if (!input.templates.length) throw new Error("Aucun mod\xE8le d\u2019objet");
  const rng = createRng(input.seed);
  const odds = adjustedOdds(chest, input.sag);
  let roll = rng() * 100;
  let idx = odds.length - 1;
  for (let i = 0; i < odds.length; i++) {
    if (odds[i] <= 0) continue;
    idx = i;
    roll -= odds[i];
    if (roll < 0) break;
  }
  const epicIdx = rarityIndex(ITEM_RARITIES, "epique");
  const legIdx = rarityIndex(ITEM_RARITIES, "legendaire");
  const chestIdx = rarityIndex(CHEST_RARITIES, chest);
  const epicPity = chestIdx >= rarityIndex(CHEST_RARITIES, PITY_EPIC_MIN_CHEST);
  const legPity = chestIdx >= rarityIndex(CHEST_RARITIES, PITY_LEGENDARY_MIN_CHEST);
  const epicKey = chest;
  const legKey = `${chest}:legendaire`;
  const pity = { ...input.pity };
  let guaranteed = null;
  if (legPity && (pity[legKey] ?? 0) >= PITY_LEGENDARY) {
    if (idx < legIdx) guaranteed = "legendaire";
    idx = legIdx;
  } else if (epicPity && (pity[epicKey] ?? 0) >= PITY_EPIC && idx < epicIdx) {
    guaranteed = "epique";
    idx = epicIdx;
  }
  if (epicPity) pity[epicKey] = idx >= epicIdx ? 0 : (pity[epicKey] ?? 0) + 1;
  if (legPity) pity[legKey] = idx === legIdx ? 0 : (pity[legKey] ?? 0) + 1;
  const template = input.templates[Math.min(Math.floor(rng() * input.templates.length), input.templates.length - 1)];
  const { fragments, gold } = CHEST_TABLE[chest];
  return { rarity: ITEM_RARITIES[idx], template, fragments, gold, pity, guaranteed };
}
function pickTemplateForSlot(templates, slot, seed) {
  const pool = templates.filter((t) => t.slot === slot);
  if (!pool.length) return null;
  return pool[Math.min(Math.floor(createRng(`${seed}|forge`)() * pool.length), pool.length - 1)];
}
function upgradeCost(level) {
  if (level >= ITEM_MAX_LEVEL) return null;
  const n = Math.max(0, Math.trunc(level)) + 1;
  return { fragments: UPGRADE_FRAGMENTS_STEP * n, gold: Math.round(UPGRADE_GOLD_STEP * Math.pow(n, UPGRADE_GOLD_EXPONENT)) };
}
function dismantleValue(rarity) {
  return DISMANTLE_FRAGMENTS[rarity];
}
function equippedBySlot(items) {
  const out = {};
  for (const it of items) if (it.equipped && EQUIP_SLOTS.includes(it.slot)) out[it.slot] = it;
  return out;
}
function dungeonBase(tier) {
  return Math.round(DUNGEON_BASE_START * Math.pow(DUNGEON_TIER_GROWTH, Math.max(1, tier) - 1));
}
function dungeonUnlockLevel(tier) {
  return Math.min(MAX_LEVEL, DUNGEON_UNLOCK_PER_TIER * Math.max(1, tier));
}
function dungeonRoomPower(tier, room) {
  return Math.round(dungeonBase(tier) * Math.pow(DUNGEON_ROOM_GROWTH, room));
}
function dungeonBossPower(tier) {
  return Math.round(dungeonBase(tier) * Math.pow(DUNGEON_ROOM_GROWTH, DUNGEON_ROOMS) * DUNGEON_BOSS_MULT);
}
function dungeonBossChest(tier) {
  return tier >= DUNGEON_SILVER_TIER ? "argent" : "bronze";
}
var WIN_VERBS = ["terrasses", "\xE9crases", "repousses", "domptes", "surmontes", "mets en fuite"];
var LOSE_VERBS = ["te repousse", "te submerge", "te barre la route", "est trop fort pour toi"];
function resolveDungeon(input) {
  const { dungeon, pp, scores } = input;
  const tier = dungeon.tier;
  const rng = createRng(input.seed);
  const survive = pp * (1 + Math.max(0, scores.CON) / DUNGEON_CON_DIV);
  const damage = pp * (1 + Math.max(0, scores.FOR) / DUNGEON_FOR_DIV);
  const roomPowers = Array.from({ length: DUNGEON_ROOMS }, (_, i) => dungeonRoomPower(tier, i));
  const bossPower = dungeonBossPower(tier);
  const pick = (list) => list[Math.min(Math.floor(rng() * list.length), list.length - 1)];
  const log = [];
  let cleared = 0;
  let missing = null;
  for (let i = 0; i < DUNGEON_ROOMS; i++) {
    const monster = dungeon.rooms[i] ?? "une ombre";
    if (survive >= roomPowers[i]) {
      cleared++;
      log.push(`Salle ${i + 1} : tu ${pick(WIN_VERBS)} ${monster}.`);
    } else {
      missing = Math.max(1, Math.ceil(roomPowers[i] / (1 + Math.max(0, scores.CON) / DUNGEON_CON_DIV) - pp));
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
      log.push(`Boss : ${dungeon.boss} r\xE9siste \xE0 tes coups. Il te manque ${missing} PP.`);
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
    heroPower: pp
  };
}

// packages/engine/src/seasons.ts
var SEASON_ANCHOR = "2026-09-28";
var SEASON_WEEKS = 8;
var SEASON_DAYS = SEASON_WEEKS * 7;
var SEASON_MIN_SPAN_DAYS = 6;
var SEASON_CHEST = "or";
var SEASON_FRAMES = ["or", "argent", "bronze", "laurier"];
var SEASON_FRAME_DEFS = {
  or: { label: "Cadre d\u2019or", glyph: "\u{1F947}", color: "#d4af37" },
  argent: { label: "Cadre d\u2019argent", glyph: "\u{1F948}", color: "#aab4bd" },
  bronze: { label: "Cadre de bronze", glyph: "\u{1F949}", color: "#b0703a" },
  laurier: { label: "Cadre de laurier", glyph: "\u{1F33F}", color: "#4fa072" }
};
var seasonKeyOf = (index) => `S${index}`;
function seasonIndex(date) {
  return Math.max(1, Math.floor(diffDays(date, SEASON_ANCHOR) / SEASON_DAYS) + 1);
}
function seasonIndexOfKey(key) {
  const m = /^S(\d+)$/.exec(key);
  const n = m ? Number(m[1]) : 0;
  return n >= 1 ? n : null;
}
function seasonInfo(date) {
  const index = seasonIndex(date);
  const start = addDays(SEASON_ANCHOR, (index - 1) * SEASON_DAYS);
  const end = addDays(start, SEASON_DAYS - 1);
  const elapsed = Math.min(Math.max(diffDays(date, start), 0), SEASON_DAYS - 1);
  return {
    index,
    key: seasonKeyOf(index),
    name: `Saison ${index}`,
    start,
    end,
    daysLeft: SEASON_DAYS - elapsed,
    week: Math.floor(elapsed / 7) + 1,
    progress: (elapsed + 1) / SEASON_DAYS
  };
}
function seasonBounds(key) {
  const index = seasonIndexOfKey(key);
  if (!index) return null;
  const start = addDays(SEASON_ANCHOR, (index - 1) * SEASON_DAYS);
  return { start, end: addDays(start, SEASON_DAYS - 1) };
}
function rankSeason(rows) {
  const sorted = [...rows].sort((a, b) => b.power - a.power || a.profileId.localeCompare(b.profileId));
  const out = [];
  for (const [i, r] of sorted.entries()) out.push({ ...r, rank: i > 0 && out[i - 1].power === r.power ? out[i - 1].rank : i + 1 });
  return out;
}
function seasonQualifies(firstDay, lastDay) {
  return diffDays(lastDay, firstDay) >= SEASON_MIN_SPAN_DAYS;
}
function seasonReward(rank, participants) {
  const podium = ["or", "argent", "bronze"];
  const frame = rank !== null && participants >= 2 && rank >= 1 && rank <= 3 ? podium[rank - 1] : "laurier";
  return { frame, chest: SEASON_CHEST };
}
function parseFrameStyle(value) {
  const m = /^(S\d+):(\w+)$/.exec(value ?? "");
  return m && SEASON_FRAMES.includes(m[2]) ? { season: m[1], frame: m[2] } : null;
}
var frameStyleOf = (season, frame) => `${season}:${frame}`;

// packages/engine/src/raid.ts
var RAID_MIN_MEMBERS = 2;
var RAID_MAX_MEMBERS = 6;
var RAID_BASE_HP = 1e4;
var RAID_HP_PER_MEMBER = 0.15;
var RAID_CHA_STEP = 0.01;
var RAID_CHA_CAP = 0.3;
var RAID_ENCOURAGE_STEP = 0.05;
var RAID_ENCOURAGE_CAP = 0.25;
var RAID_FOR_DIV = 60;
var RAID_FAST_DAYS = 4;
var RAID_WIN_CHEST = "or";
var RAID_FAST_CHEST = "mythique";
var RAID_BOSSES = [
  { id: "hydre-des-brumes", name: "L\u2019Hydre des brumes", glyph: "\u{1F409}", blurb: "Chaque t\xEAte abattue en r\xE9veille deux autres. Frappez ensemble, frappez chaque jour." },
  { id: "colosse-de-cendre", name: "Le Colosse de cendre", glyph: "\u{1F5FF}", blurb: "Une montagne qui marche. Il ne tombera pas en un jour, mais il tombera." },
  { id: "reine-des-ronces", name: "La Reine des ronces", glyph: "\u{1F940}", blurb: "Ses \xE9pines s\u2019enfoncent dans les plus distraits. Les assidus la font plier." },
  { id: "veilleur-du-gouffre", name: "Le Veilleur du gouffre", glyph: "\u{1F441}\uFE0F", blurb: "Il voit chaque jour manqu\xE9. Il n\u2019a jamais vu une troupe unie lui r\xE9sister." },
  { id: "wyrm-de-givre", name: "Le Wyrm de givre", glyph: "\u{1F432}", blurb: "Son souffle fige les volont\xE9s. Le feu de la routine le fait reculer." },
  { id: "seigneur-des-os", name: "Le Seigneur des os", glyph: "\u{1F480}", blurb: "Il ramasse les promesses oubli\xE9es. Reprenez-les-lui une \xE0 une." },
  { id: "kraken-des-marees", name: "Le Kraken des mar\xE9es", glyph: "\u{1F991}", blurb: "Il revient chaque semaine avec la mar\xE9e, plus affam\xE9. Tenez bon." },
  { id: "chimere-ardente", name: "La Chim\xE8re ardente", glyph: "\u{1F525}", blurb: "Trois natures, une seule faiblesse : la constance de vos coups." }
];
function raidWeekKey(date) {
  const { year, week } = isoWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}
var raidWeekStart = (date) => startOfIsoWeek(date);
var raidWeekEnd = (date) => endOfIsoWeek(date);
function raidBossFor(date) {
  const { year, week } = isoWeek(date);
  return RAID_BOSSES[(year * 53 + week) % RAID_BOSSES.length];
}
function raidMaxHp(members) {
  const n = Math.min(Math.max(Math.trunc(members) || 1, 1), RAID_MAX_MEMBERS);
  return Math.round(RAID_BASE_HP * (1 + RAID_HP_PER_MEMBER * (n - 1)));
}
function raidChaBonus(chaScores) {
  if (!chaScores.length) return 0;
  const avg = chaScores.reduce((n, c) => n + Math.max(0, c), 0) / chaScores.length;
  return Math.min(RAID_CHA_CAP, avg * RAID_CHA_STEP);
}
function raidEncouragementBonus(count) {
  return Math.min(RAID_ENCOURAGE_CAP, Math.max(0, Math.trunc(count) || 0) * RAID_ENCOURAGE_STEP);
}
function raidBaseDamage(i) {
  return Math.floor(Math.max(0, i.pp) * (1 + Math.max(0, i.forScore) / RAID_FOR_DIV) * (1 + Math.min(RAID_CHA_CAP, Math.max(0, i.chaBonus))));
}
function raidDamage(base, encouragements) {
  return Math.floor(Math.max(0, base) * (1 + raidEncouragementBonus(encouragements)));
}
function raidVictoryDay(daily, maxHp) {
  const byDay = /* @__PURE__ */ new Map();
  for (const d of daily) byDay.set(d.date, (byDay.get(d.date) ?? 0) + d.damage);
  let total = 0;
  for (const date of [...byDay.keys()].sort()) {
    total += byDay.get(date);
    if (total >= maxHp) return date;
  }
  return null;
}
function raidDaysToKill(weekStart, victoryDay) {
  return diffDays(victoryDay, weekStart) + 1;
}
function raidRewardChest(daysToKill) {
  return daysToKill < RAID_FAST_DAYS ? RAID_FAST_CHEST : RAID_WIN_CHEST;
}
function raidOutcome(input) {
  if (input.joined >= RAID_MIN_MEMBERS && input.totalDamage >= input.maxHp) return "victory";
  if (!input.weekOver) return null;
  return input.joined < RAID_MIN_MEMBERS ? "void" : "defeat";
}
function raidWeekOver(weekStart, today) {
  return today > addDays(weekStart, 6);
}

// packages/engine/src/achievements.ts
function conditionProgress(c, s) {
  switch (c.kind) {
    case "quests_total":
      return { current: s.questsTotal, target: c.target };
    case "quests_by_difficulty":
      return { current: s.byDifficulty[c.difficulty], target: c.target };
    case "quests_by_ability":
      return { current: s.byAbility[c.ability], target: c.target };
    case "streak_best":
      return { current: s.streakBest, target: c.target };
    case "level":
      return { current: s.level, target: c.target };
    case "total_xp":
      return { current: s.totalXp, target: c.target };
    case "ability_score":
      return { current: s.scores[c.ability], target: c.target };
    case "all_scores_min":
      return { current: Math.min(...Object.values(s.scores)), target: c.target };
    case "legendary_abilities":
      return { current: Object.values(s.scores).filter((v) => v > 20).length, target: c.target };
    case "early_quests":
      return { current: s.earlyQuests, target: c.target };
    case "late_quests":
      return { current: s.lateQuests, target: c.target };
    case "comeback":
      return { current: s.comebackGap, target: c.target };
    case "perfect_days":
      return { current: s.perfectDays, target: c.target };
    case "discovered":
      return { current: s.discovered, target: c.target };
    case "journal_entries":
      return { current: s.journalEntries, target: c.target };
    case "posts_shared":
      return { current: s.postsShared, target: c.target };
    case "friends":
      return { current: s.friends, target: c.target };
    case "reactions_given":
      return { current: s.reactionsGiven, target: c.target };
    case "custom_quests":
      return { current: s.customQuests, target: c.target };
    case "timer_minutes":
      return { current: s.timerMinutes, target: c.target };
    case "rest_days":
      return { current: s.restDays, target: c.target };
    case "inspiration_used":
      return { current: s.inspirationUsed, target: c.target };
    case "week_all_abilities":
      return { current: s.weekAbilitiesMax, target: c.target };
    case "weekly_done":
      return { current: s.weeklyDone, target: c.target };
    case "monthly_done":
      return { current: s.monthlyDone, target: c.target };
  }
}
function evaluateAchievements(defs, stats) {
  return defs.map((d) => {
    const { current, target } = conditionProgress(d.condition, stats);
    return { id: d.id, current: Math.min(current, target), target, done: current >= target };
  });
}
function newlyUnlocked(defs, stats, alreadyUnlocked) {
  return defs.filter((d) => !alreadyUnlocked.has(d.id) && conditionProgress(d.condition, stats).current >= conditionProgress(d.condition, stats).target);
}
function emptyStats() {
  return {
    questsTotal: 0,
    byDifficulty: { easy: 0, medium: 0, high: 0, expert: 0 },
    byAbility: { FOR: 0, DEX: 0, CON: 0, INT: 0, SAG: 0, CHA: 0 },
    streakBest: 0,
    level: 1,
    totalXp: 0,
    scores: emptyAbilityRecord(MIN_SCORE),
    earlyQuests: 0,
    lateQuests: 0,
    comebackGap: 0,
    perfectDays: 0,
    discovered: 0,
    journalEntries: 0,
    postsShared: 0,
    friends: 0,
    reactionsGiven: 0,
    customQuests: 0,
    timerMinutes: 0,
    restDays: 0,
    inspirationUsed: 0,
    weekAbilitiesMax: 0,
    weeklyDone: 0,
    monthlyDone: 0
  };
}

// packages/engine/src/labels.ts
var ABILITY_LABEL = {
  FOR: "Force",
  DEX: "Dext\xE9rit\xE9",
  CON: "Constitution",
  INT: "Intelligence",
  SAG: "Sagesse",
  CHA: "Charisme"
};
var ABILITY_DND_NAME = {
  FOR: "Force",
  DEX: "Dext\xE9rit\xE9",
  CON: "Constitution",
  INT: "Intelligence",
  SAG: "Sagesse",
  CHA: "Charisme"
};
var ABILITY_SHORT = {
  FOR: "FOR",
  DEX: "DEX",
  CON: "CON",
  INT: "INT",
  SAG: "SAG",
  CHA: "CHA"
};
var ABILITY_COLOR = {
  FOR: "#c8553d",
  DEX: "#5f9e6e",
  CON: "#e0893d",
  INT: "#4a82b8",
  SAG: "#8a6bb8",
  CHA: "#d9ae3a"
};
var ABILITY_TAGLINE = {
  FOR: "Le physique pur : pousser, porter, tenir.",
  DEX: "L\u2019agilit\xE9 sous toutes ses formes : souplesse, coordination, r\xE9flexes, adresse, esprit vif.",
  CON: "La sant\xE9 du corps : sommeil, repas, eau, marche.",
  INT: "Apprendre, informations ou comp\xE9tences : lire, \xE9tudier, pratiquer.",
  SAG: "Prendre soin de soi \xE0 l\u2019int\xE9rieur : calme, \xE9motions, attention.",
  CHA: "Le social : \xE9couter, parler, donner des nouvelles."
};
var DIFFICULTY_LABEL = {
  easy: "Facile",
  medium: "Mod\xE9r\xE9e",
  high: "Audacieuse",
  expert: "L\xE9gendaire"
};
var DIFFICULTY_SWORDS = { easy: 1, medium: 2, high: 3, expert: 4 };
var PERIOD_LABEL = {
  daily: "Quotidienne",
  weekly: "Hebdomadaire",
  monthly: "Mensuelle",
  epic: "\xC9pique"
};
var PERIOD_TAB_LABEL = {
  daily: "Jour",
  weekly: "Semaine",
  monthly: "Mois",
  epic: "\xC9pique"
};
var PERIOD_SHORT = { daily: "J", weekly: "S", monthly: "M", epic: "\xC9" };
var VALIDATION_LABEL = {
  simple: "Simple",
  counter: "Compteur",
  timer: "Chronom\xE8tre",
  steps: "Checklist",
  journal: "Journal"
};
var REACTION_LABEL = {
  bravo: "Bravo",
  inspirant: "Inspirant",
  respect: "Respect",
  rire: "Rire"
};
var REACTION_KINDS = Object.keys(REACTION_LABEL);
var REACTION_EMOJI = {
  bravo: "\u{1F44F}",
  inspirant: "\u2728",
  respect: "\u{1FAE1}",
  rire: "\u{1F604}"
};

// packages/engine/src/narrative.ts
function interpolate(text, vars) {
  return text.replace(/\{(\w+)\}/g, (_, k) => k in vars ? String(vars[k]) : `{${k}}`);
}
function matches(c, x) {
  if (!c) return true;
  if (c.streakMin !== void 0 && x.streak < c.streakMin) return false;
  if (c.streakMax !== void 0 && x.streak > c.streakMax) return false;
  if (c.weakest && c.weakest !== x.weakest) return false;
  if (c.strongest && c.strongest !== x.strongest) return false;
  if (c.weekdays && !c.weekdays.includes(x.weekday)) return false;
  if (c.hourMin !== void 0 && x.hour < c.hourMin) return false;
  if (c.hourMax !== void 0 && x.hour > c.hourMax) return false;
  if (c.daily) {
    const state = x.dailyDone === 0 ? "none" : x.dailyDone >= x.dailyTotal ? "all" : "some";
    if (state !== c.daily) return false;
  }
  if (c.firstOfMonth && x.dayOfMonth !== 1) return false;
  if (c.monday && x.weekday !== 1) return false;
  if (c.levelMin !== void 0 && x.level < c.levelMin) return false;
  if (c.levelMax !== void 0 && x.level > c.levelMax) return false;
  if (c.inspirationMin !== void 0 && x.inspiration < c.inspirationMin) return false;
  if (c.awayMin !== void 0 && x.daysAway < c.awayMin) return false;
  if (c.newPlayer && x.totalQuests > 3) return false;
  return true;
}
function pickTavernMessage(messages, ctx) {
  const eligible = messages.filter((m) => matches(m.when, ctx));
  const pool = eligible.length ? eligible : messages;
  if (!pool.length) return "";
  const specificity = (m) => m.when ? Object.keys(m.when).length : 0;
  const rng = createRng(`tavern|${ctx.date}|${ctx.dailyDone}`);
  const chosen = weightedPick(pool, (m) => (m.weight ?? 1) * (1 + specificity(m) * 2), rng) ?? pool[0];
  return interpolate(chosen.text, {
    name: ctx.name,
    streak: ctx.streak,
    weakest: ABILITY_LABEL[ctx.weakest],
    strongest: ABILITY_LABEL[ctx.strongest],
    level: ctx.level
  });
}
function buildRecap(input, templates) {
  const deltaPct = input.xpPrev > 0 ? Math.round((input.xp - input.xpPrev) / input.xpPrev * 100) : null;
  const ranked = [...ABILITIES].sort((a, b) => input.xpByAbility[b] - input.xpByAbility[a]);
  const best = input.xp > 0 ? ranked[0] : null;
  const weakest = ranked[ranked.length - 1];
  const rng = createRng(`recap|${input.seed}`);
  const pick = (arr) => arr.length ? arr[Math.floor(rng() * arr.length)] : void 0;
  const trend = deltaPct === null ? "first" : deltaPct >= 5 ? "up" : deltaPct <= -5 ? "down" : "flat";
  const vars = { name: input.name, best: best ? ABILITY_LABEL[best] : "", weak: ABILITY_LABEL[weakest], done: input.done, xp: input.xp };
  const parts = [];
  const opener = pick(templates.openers.filter((o) => o.trend === trend));
  if (opener) parts.push(interpolate(opener.text, vars));
  if (best) {
    const b = pick(templates.best.filter((o) => o.ability === best));
    if (b) parts.push(interpolate(b.text, vars));
  }
  if (input.xp > 0 || input.done > 0) {
    const w = pick(templates.weak.filter((o) => o.ability === weakest));
    if (w && input.xpByAbility[weakest] < (best ? input.xpByAbility[best] : 0)) parts.push(interpolate(w.text, vars));
  }
  const closer = pick(templates.closers.filter((o) => o.kind === input.kind));
  if (closer) parts.push(interpolate(closer.text, vars));
  return {
    kind: input.kind,
    xp: input.xp,
    xpPrev: input.xpPrev,
    deltaPct,
    done: input.done,
    proposed: input.proposed,
    successRate: input.proposed ? Math.round(input.done / input.proposed * 100) : 0,
    xpByAbility: input.xpByAbility,
    doneByAbility: input.doneByAbility,
    best,
    weakest: input.xp > 0 ? weakest : null,
    narrative: parts.join(" ")
  };
}
function scoresFromAssessment(questions, answers) {
  const scores = {};
  for (const a of ABILITIES) {
    const qs = questions.filter((q) => q.ability === a);
    const vals = qs.map((q) => Math.min(Math.max(answers[q.id] ?? 3, 1), 5));
    const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 3;
    scores[a] = Math.min(Math.max(Math.round(MIN_SCORE + (avg - 1) * (POINT_BUY_MAX - MIN_SCORE) / 4), MIN_SCORE), POINT_BUY_MAX);
  }
  let guard = 0;
  while (pointBuySpent(scores) > POINT_BUY_BUDGET && guard++ < 100) {
    const top = [...ABILITIES].sort((a, b) => scores[b] - scores[a])[0];
    scores[top]--;
  }
  return scores;
}

// packages/engine/src/content-types.ts
function masteriesOf(classes, classId) {
  return classes.find((c) => c.id === classId)?.masteries ?? [];
}
function pathAbilityOf(classes, classId, pathId) {
  if (!pathId) return null;
  const c = classes.find((x) => x.id === classId);
  return c?.paths.find((p) => p.id === pathId)?.ability ?? null;
}

// packages/engine/src/server/types.ts
var defaultSettings = (timezone = "Europe/Paris") => ({
  resetHour: 4,
  timezone,
  dailyQuestCount: 2,
  hardcore: false,
  autoShare: { level: true, achievement: true, streak: true },
  defaultVisibility: "friends",
  leaderboardOptIn: true,
  notifPrefs: { daily: true, dailyTime: "09:00", weekEnd: true, friendRequests: true, reactions: true, comments: true, raid: true, season: true },
  friendRequestsFrom: "everyone",
  theme: "auto",
  sounds: true,
  reducedMotion: false,
  lastRecapWeek: null,
  lastRecapMonth: null,
  interests: []
});

// packages/content/data/classes.fr.json
var classes_fr_default = [
  {
    id: "eclaireur",
    name: "\xC9claireur",
    icon: "footsteps-outline",
    masteries: ["FOR", "CON"],
    profile: "Sportif endurant, salle et cardio",
    description: "Pour les sportifs d\u2019endurance : course, salle, cardio. Tu progresses surtout en Force et en Constitution.",
    favoredQuests: ["Marche rapide, 30 minutes", "Endurance, 3 s\xE9ances dans la semaine", "Pompes, 40 aujourd\u2019hui"],
    paths: [
      { id: "eclaireur-sentier", name: "Voie du Sentier", ability: "SAG", title: "Marcheur des cimes", description: "Tu cours pour entendre le vent. Ta voie ajoute une affinit\xE9 Sagesse : chaque sortie en nature te rapporte un petit suppl\xE9ment d\u2019XP." },
      { id: "eclaireur-bastion", name: "Voie du Bastion", ability: "INT", title: "Strat\xE8ge de l\u2019effort", description: "Tu planifies, mesures, ajustes. Ta voie ajoute une affinit\xE9 Intelligence : tes plans d\u2019entra\xEEnement t\u2019apportent un petit suppl\xE9ment d\u2019XP." }
    ]
  },
  {
    id: "aventurier",
    name: "Aventurier",
    icon: "compass-outline",
    masteries: ["FOR", "DEX"],
    profile: "Arts martiaux, yoga, discipline du corps",
    description: "Pour ceux qui aiment les arts martiaux, le yoga ou toute discipline du corps. Tu progresses surtout en Force et en Dext\xE9rit\xE9.",
    favoredQuests: ["S\xE9ances de force, 3 dans la semaine", "Nouvelle activit\xE9 de coordination, 2 s\xE9ances", "Parcours d\u2019agilit\xE9, 5 tours"],
    paths: [
      { id: "aventurier-ombre", name: "Voie de l\u2019Ombre", ability: "SAG", title: "Ma\xEEtre du calme", description: "L\u2019art martial est d\u2019abord un art du souffle. Ta voie ajoute une affinit\xE9 Sagesse." },
      { id: "aventurier-tempete", name: "Voie de la Temp\xEAte", ability: "CON", title: "C\u0153ur d\u2019orage", description: "Tu aimes l\u2019effort qui dure. Ta voie ajoute une affinit\xE9 Constitution." }
    ]
  },
  {
    id: "artisan",
    name: "Artisan",
    icon: "hammer-outline",
    masteries: ["DEX", "INT"],
    profile: "Bricoleur ing\xE9nieux, apprend par la pratique",
    description: "Pour ceux qui apprennent en pratiquant : bricolage, projets, techniques. Tu progresses surtout en Dext\xE9rit\xE9 et en Intelligence.",
    favoredQuests: ["Geste pr\xE9cis, 4 s\xE9ances", "Trois raccourcis clavier", "Programmation, 3 exercices"],
    paths: [
      { id: "artisan-inventeur", name: "Voie de l\u2019Inventeur", ability: "INT", title: "Esprit d\u2019atelier", description: "Tu cherches comment les choses fonctionnent. Ta voie ajoute une affinit\xE9 Intelligence." },
      { id: "artisan-maitre", name: "Voie du Ma\xEEtre d\u2019\u0153uvre", ability: "CHA", title: "B\xE2tisseur de guildes", description: "Tu sais faire travailler les autres. Ta voie ajoute une affinit\xE9 Charisme." }
    ]
  },
  {
    id: "troubadour",
    name: "Troubadour",
    icon: "musical-notes-outline",
    masteries: ["DEX", "CHA"],
    profile: "Artiste, musicien, aime la sc\xE8ne",
    description: "Pour les artistes et les musiciens qui aiment la sc\xE8ne. Tu progresses surtout en Dext\xE9rit\xE9 et en Charisme.",
    favoredQuests: ["Habilet\xE9 manuelle, 5 s\xE9ances", "Pr\xE9parer et dire un court expos\xE9", "Jonglage, 10 cascades"],
    paths: [
      { id: "troubadour-conteur", name: "Voie du Conteur", ability: "INT", title: "M\xE9moire vivante", description: "Tu aimes les histoires bien construites. Ta voie ajoute une affinit\xE9 Intelligence." },
      { id: "troubadour-meneur", name: "Voie du Meneur de bal", ability: "CON", title: "C\u0153ur de la f\xEAte", description: "Tu donnes de l\u2019\xE9nergie aux autres. Ta voie ajoute une affinit\xE9 Constitution." }
    ]
  },
  {
    id: "rassembleur",
    name: "Rassembleur",
    icon: "people-outline",
    masteries: ["CON", "CHA"],
    profile: "\xC9nergie naturelle, sociable et r\xE9sistant",
    description: "Pour les personnes sociables et pleines d\u2019\xE9nergie. Tu progresses surtout en Constitution et en Charisme.",
    favoredQuests: ["Un vrai repas partag\xE9", "Voir trois personnes diff\xE9rentes", "Une activit\xE9 \xE0 plusieurs"],
    paths: [
      { id: "rassembleur-feu", name: "Voie du Feu de camp", ability: "DEX", title: "\xC2me des veill\xE9es", description: "Tu cr\xE9es des moments qui comptent. Ta voie ajoute une affinit\xE9 Dext\xE9rit\xE9." },
      { id: "rassembleur-roc", name: "Voie du Roc", ability: "FOR", title: "Pilier de la compagnie", description: "Tu es celui sur qui on s\u2019appuie. Ta voie ajoute une affinit\xE9 Force." }
    ]
  },
  {
    id: "erudit",
    name: "\xC9rudit",
    icon: "library-outline",
    masteries: ["INT", "SAG"],
    profile: "\xC9tudiant permanent, lecteur, r\xE9fl\xE9chi",
    description: "Pour les \xE9tudiants permanents, les lecteurs et les curieux. Tu progresses surtout en Intelligence et en Sagesse.",
    favoredQuests: ["Lecture, 20 pages", "Espagnol, un cours aujourd\u2019hui", "M\xE9ditation, 15 minutes"],
    paths: [
      { id: "erudit-savant", name: "Voie du Savant", ability: "INT", title: "Gardien des savoirs", description: "Tu creuses chaque sujet jusqu\u2019au fond. Ta voie ajoute une affinit\xE9 Intelligence." },
      { id: "erudit-ermite", name: "Voie de l\u2019Ermite", ability: "SAG", title: "Sage de la Tour", description: "Tu cherches le calme autant que le savoir. Ta voie ajoute une affinit\xE9 Sagesse." }
    ]
  },
  {
    id: "gardien",
    name: "Gardien",
    icon: "heart-outline",
    masteries: ["SAG", "CHA"],
    profile: "Bienveillant, tourn\xE9 vers les autres",
    description: "Pour ceux qui prennent soin des autres et d\u2019eux-m\xEAmes. Tu progresses surtout en Sagesse et en Charisme.",
    favoredQuests: ["M\xE9ditation, 15 minutes", "\xC9coute active, trois reformulations", "Trois gratitudes"],
    paths: [
      { id: "gardien-guerisseur", name: "Voie du Gu\xE9risseur", ability: "CON", title: "Main qui apaise", description: "Tu prends soin des corps autant que des c\u0153urs. Ta voie ajoute une affinit\xE9 Constitution." },
      { id: "gardien-protecteur", name: "Voie du Protecteur", ability: "FOR", title: "Bouclier des siens", description: "Tu d\xE9fends ceux que tu aimes. Ta voie ajoute une affinit\xE9 Force." }
    ]
  },
  {
    id: "explorateur",
    name: "Explorateur",
    icon: "leaf-outline",
    masteries: ["CON", "SAG"],
    profile: "Proche de la nature, curieux du vivant",
    description: "Pour les amoureux de nature et de grands espaces. Tu progresses surtout en Constitution et en Sagesse.",
    favoredQuests: ["Un moment dans la nature, sans \xE9cran", "Grande sortie, 45 minutes", "Marcher 5 fois dans la semaine"],
    paths: [
      { id: "explorateur-druide", name: "Voie du Sentier vert", ability: "INT", title: "Lecteur du vivant", description: "Tu observes, tu notes, tu apprends de la nature. Ta voie ajoute une affinit\xE9 Intelligence." },
      { id: "explorateur-nomade", name: "Voie du Nomade", ability: "FOR", title: "Marcheur d\u2019horizons", description: "Tu vas toujours un peu plus loin. Ta voie ajoute une affinit\xE9 Force." }
    ]
  }
];

// packages/content/data/achievements.fr.json
var achievements_fr_default = [
  {
    id: "premier-pas",
    category: "constance",
    name: "Le Premier Pas",
    description: "Accomplir ta premi\xE8re qu\xEAte.",
    condition: {
      kind: "quests_total",
      target: 1
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "premier-elan",
    category: "constance",
    name: "Premier \xE9lan",
    description: "Accomplir 10 qu\xEAtes.",
    condition: {
      kind: "quests_total",
      target: 10
    },
    xpBonus: 50,
    titleUnlocked: null
  },
  {
    id: "cinquante-pas",
    category: "constance",
    name: "Cinquante pas",
    description: "Accomplir 50 qu\xEAtes.",
    condition: {
      kind: "quests_total",
      target: 50
    },
    xpBonus: 100,
    titleUnlocked: "Marcheur fid\xE8le"
  },
  {
    id: "centurion",
    category: "constance",
    name: "Le Centurion",
    description: "Accomplir 100 qu\xEAtes.",
    condition: {
      kind: "quests_total",
      target: 100
    },
    xpBonus: 150,
    titleUnlocked: "Centurion"
  },
  {
    id: "deux-cent-cinquante",
    category: "constance",
    name: "Chemin parcouru",
    description: "Accomplir 250 qu\xEAtes.",
    condition: {
      kind: "quests_total",
      target: 250
    },
    xpBonus: 250,
    titleUnlocked: null
  },
  {
    id: "cinq-cents",
    category: "constance",
    name: "Les Cinq Cents",
    description: "Accomplir 500 qu\xEAtes.",
    condition: {
      kind: "quests_total",
      target: 500
    },
    xpBonus: 400,
    titleUnlocked: "Infatigable"
  },
  {
    id: "mille-quetes",
    category: "constance",
    name: "1 000 qu\xEAtes",
    description: "Accomplir 1 000 qu\xEAtes.",
    condition: {
      kind: "quests_total",
      target: 1e3
    },
    xpBonus: 500,
    titleUnlocked: "1 000 qu\xEAtes"
  },
  {
    id: "serie-3",
    category: "constance",
    name: "Trois d\u2019affil\xE9e",
    description: "Tenir une s\xE9rie de 3 jours.",
    condition: {
      kind: "streak_best",
      target: 3
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "feu-sacre",
    category: "constance",
    name: "Une semaine d\u2019affil\xE9e",
    description: "Tenir une s\xE9rie de 7 jours.",
    condition: {
      kind: "streak_best",
      target: 7
    },
    xpBonus: 50,
    titleUnlocked: "R\xE9gulier"
  },
  {
    id: "serie-14",
    category: "constance",
    name: "Deux semaines d\u2019affil\xE9e",
    description: "Tenir une s\xE9rie de 14 jours.",
    condition: {
      kind: "streak_best",
      target: 14
    },
    xpBonus: 100,
    titleUnlocked: null
  },
  {
    id: "serie-30",
    category: "constance",
    name: "Un mois sans faillir",
    description: "Tenir une s\xE9rie de 30 jours.",
    condition: {
      kind: "streak_best",
      target: 30
    },
    xpBonus: 200,
    titleUnlocked: "Le Constant"
  },
  {
    id: "serie-60",
    category: "constance",
    name: "Deux mois d\u2019affil\xE9e",
    description: "Tenir une s\xE9rie de 60 jours.",
    condition: {
      kind: "streak_best",
      target: 60
    },
    xpBonus: 300,
    titleUnlocked: null
  },
  {
    id: "increvable",
    category: "constance",
    name: "Increvable",
    description: "Tenir une s\xE9rie de 100 jours.",
    condition: {
      kind: "streak_best",
      target: 100
    },
    xpBonus: 500,
    titleUnlocked: "L\u2019Increvable"
  },
  {
    id: "serie-200",
    category: "constance",
    name: "200 jours d\u2019affil\xE9e",
    description: "Tenir une s\xE9rie de 200 jours.",
    condition: {
      kind: "streak_best",
      target: 200
    },
    xpBonus: 500,
    titleUnlocked: null
  },
  {
    id: "annee-heros",
    category: "constance",
    name: "Une ann\xE9e compl\xE8te",
    description: "Tenir une s\xE9rie de 365 jours.",
    condition: {
      kind: "streak_best",
      target: 365
    },
    xpBonus: 500,
    titleUnlocked: "Une ann\xE9e compl\xE8te"
  },
  {
    id: "journee-parfaite",
    category: "constance",
    name: "Journ\xE9e accomplie",
    description: "Accomplir toutes tes qu\xEAtes du jour.",
    condition: {
      kind: "perfect_days",
      target: 1
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "sept-journees-parfaites",
    category: "constance",
    name: "Sept journ\xE9es parfaites",
    description: "Accomplir toutes tes qu\xEAtes du jour 7 fois.",
    condition: {
      kind: "perfect_days",
      target: 7
    },
    xpBonus: 100,
    titleUnlocked: null
  },
  {
    id: "trente-journees-parfaites",
    category: "constance",
    name: "Trente journ\xE9es parfaites",
    description: "Accomplir toutes tes qu\xEAtes du jour 30 fois.",
    condition: {
      kind: "perfect_days",
      target: 30
    },
    xpBonus: 250,
    titleUnlocked: "L\u2019Exemplaire"
  },
  {
    id: "lieve-tot",
    category: "constance",
    name: "Le L\xE8ve-t\xF4t",
    description: "Valider 10 qu\xEAtes avant 8 h.",
    condition: {
      kind: "early_quests",
      target: 10
    },
    xpBonus: 100,
    titleUnlocked: "Le L\xE8ve-t\xF4t"
  },
  {
    id: "chouette",
    category: "constance",
    name: "La Chouette",
    description: "Valider 10 qu\xEAtes apr\xE8s 21 h.",
    condition: {
      kind: "late_quests",
      target: 10
    },
    xpBonus: 75,
    titleUnlocked: "La Chouette"
  },
  {
    id: "repos-du-sage",
    category: "constance",
    name: "Le Repos du Sage",
    description: "D\xE9clarer un premier jour de repos.",
    condition: {
      kind: "rest_days",
      target: 1
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "for-16",
    category: "maitrise",
    name: "Force aguerrie",
    description: "Atteindre un score de Force de 16.",
    condition: {
      kind: "ability_score",
      ability: "FOR",
      target: 16
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "for-18",
    category: "maitrise",
    name: "Force remarquable",
    description: "Atteindre un score de Force de 18.",
    condition: {
      kind: "ability_score",
      ability: "FOR",
      target: 18
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "dex-16",
    category: "maitrise",
    name: "Dext\xE9rit\xE9 aguerrie",
    description: "Atteindre un score de Dext\xE9rit\xE9 de 16.",
    condition: {
      kind: "ability_score",
      ability: "DEX",
      target: 16
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "dex-18",
    category: "maitrise",
    name: "Dext\xE9rit\xE9 remarquable",
    description: "Atteindre un score de Dext\xE9rit\xE9 de 18.",
    condition: {
      kind: "ability_score",
      ability: "DEX",
      target: 18
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "con-16",
    category: "maitrise",
    name: "Constitution aguerrie",
    description: "Atteindre un score de Constitution de 16.",
    condition: {
      kind: "ability_score",
      ability: "CON",
      target: 16
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "con-18",
    category: "maitrise",
    name: "Constitution remarquable",
    description: "Atteindre un score de Constitution de 18.",
    condition: {
      kind: "ability_score",
      ability: "CON",
      target: 18
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "int-16",
    category: "maitrise",
    name: "Intelligence aguerrie",
    description: "Atteindre un score de Intelligence de 16.",
    condition: {
      kind: "ability_score",
      ability: "INT",
      target: 16
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "int-18",
    category: "maitrise",
    name: "Intelligence remarquable",
    description: "Atteindre un score de Intelligence de 18.",
    condition: {
      kind: "ability_score",
      ability: "INT",
      target: 18
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "sag-16",
    category: "maitrise",
    name: "Sagesse aguerrie",
    description: "Atteindre un score de Sagesse de 16.",
    condition: {
      kind: "ability_score",
      ability: "SAG",
      target: 16
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "sag-18",
    category: "maitrise",
    name: "Sagesse remarquable",
    description: "Atteindre un score de Sagesse de 18.",
    condition: {
      kind: "ability_score",
      ability: "SAG",
      target: 18
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "cha-16",
    category: "maitrise",
    name: "Charisme aguerri",
    description: "Atteindre un score de Charisme de 16.",
    condition: {
      kind: "ability_score",
      ability: "CHA",
      target: 16
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "cha-18",
    category: "maitrise",
    name: "Charisme remarquable",
    description: "Atteindre un score de Charisme de 18.",
    condition: {
      kind: "ability_score",
      ability: "CHA",
      target: 18
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "for-quetes-5",
    category: "maitrise",
    name: "Force : 5 qu\xEAtes",
    description: "Accomplir 5 qu\xEAtes de Force.",
    condition: {
      kind: "quests_by_ability",
      ability: "FOR",
      target: 5
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "for-quetes-25",
    category: "maitrise",
    name: "Force : 25 qu\xEAtes",
    description: "Accomplir 25 qu\xEAtes de Force.",
    condition: {
      kind: "quests_by_ability",
      ability: "FOR",
      target: 25
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "for-quetes-100",
    category: "maitrise",
    name: "Force : 100 qu\xEAtes",
    description: "Accomplir 100 qu\xEAtes de Force.",
    condition: {
      kind: "quests_by_ability",
      ability: "FOR",
      target: 100
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "dex-quetes-5",
    category: "maitrise",
    name: "Dext\xE9rit\xE9 : 5 qu\xEAtes",
    description: "Accomplir 5 qu\xEAtes de Dext\xE9rit\xE9.",
    condition: {
      kind: "quests_by_ability",
      ability: "DEX",
      target: 5
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "dex-quetes-25",
    category: "maitrise",
    name: "Dext\xE9rit\xE9 : 25 qu\xEAtes",
    description: "Accomplir 25 qu\xEAtes de Dext\xE9rit\xE9.",
    condition: {
      kind: "quests_by_ability",
      ability: "DEX",
      target: 25
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "dex-quetes-100",
    category: "maitrise",
    name: "Dext\xE9rit\xE9 : 100 qu\xEAtes",
    description: "Accomplir 100 qu\xEAtes de Dext\xE9rit\xE9.",
    condition: {
      kind: "quests_by_ability",
      ability: "DEX",
      target: 100
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "con-quetes-5",
    category: "maitrise",
    name: "Constitution : 5 qu\xEAtes",
    description: "Accomplir 5 qu\xEAtes de Constitution.",
    condition: {
      kind: "quests_by_ability",
      ability: "CON",
      target: 5
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "con-quetes-25",
    category: "maitrise",
    name: "Constitution : 25 qu\xEAtes",
    description: "Accomplir 25 qu\xEAtes de Constitution.",
    condition: {
      kind: "quests_by_ability",
      ability: "CON",
      target: 25
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "con-quetes-100",
    category: "maitrise",
    name: "Constitution : 100 qu\xEAtes",
    description: "Accomplir 100 qu\xEAtes de Constitution.",
    condition: {
      kind: "quests_by_ability",
      ability: "CON",
      target: 100
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "int-quetes-5",
    category: "maitrise",
    name: "Intelligence : 5 qu\xEAtes",
    description: "Accomplir 5 qu\xEAtes d\u2019Intelligence.",
    condition: {
      kind: "quests_by_ability",
      ability: "INT",
      target: 5
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "int-quetes-25",
    category: "maitrise",
    name: "Intelligence : 25 qu\xEAtes",
    description: "Accomplir 25 qu\xEAtes d\u2019Intelligence.",
    condition: {
      kind: "quests_by_ability",
      ability: "INT",
      target: 25
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "int-quetes-100",
    category: "maitrise",
    name: "Intelligence : 100 qu\xEAtes",
    description: "Accomplir 100 qu\xEAtes d\u2019Intelligence.",
    condition: {
      kind: "quests_by_ability",
      ability: "INT",
      target: 100
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "sag-quetes-5",
    category: "maitrise",
    name: "Sagesse : 5 qu\xEAtes",
    description: "Accomplir 5 qu\xEAtes de Sagesse.",
    condition: {
      kind: "quests_by_ability",
      ability: "SAG",
      target: 5
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "sag-quetes-25",
    category: "maitrise",
    name: "Sagesse : 25 qu\xEAtes",
    description: "Accomplir 25 qu\xEAtes de Sagesse.",
    condition: {
      kind: "quests_by_ability",
      ability: "SAG",
      target: 25
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "sag-quetes-100",
    category: "maitrise",
    name: "Sagesse : 100 qu\xEAtes",
    description: "Accomplir 100 qu\xEAtes de Sagesse.",
    condition: {
      kind: "quests_by_ability",
      ability: "SAG",
      target: 100
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "cha-quetes-5",
    category: "maitrise",
    name: "Charisme : 5 qu\xEAtes",
    description: "Accomplir 5 qu\xEAtes de Charisme.",
    condition: {
      kind: "quests_by_ability",
      ability: "CHA",
      target: 5
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "cha-quetes-25",
    category: "maitrise",
    name: "Charisme : 25 qu\xEAtes",
    description: "Accomplir 25 qu\xEAtes de Charisme.",
    condition: {
      kind: "quests_by_ability",
      ability: "CHA",
      target: 25
    },
    xpBonus: 75,
    titleUnlocked: null
  },
  {
    id: "cha-quetes-100",
    category: "maitrise",
    name: "Charisme : 100 qu\xEAtes",
    description: "Accomplir 100 qu\xEAtes de Charisme.",
    condition: {
      kind: "quests_by_ability",
      ability: "CHA",
      target: 100
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "niveau-5",
    category: "maitrise",
    name: "Niveau 5",
    description: "Atteindre le niveau 5.",
    condition: {
      kind: "level",
      target: 5
    },
    xpBonus: 100,
    titleUnlocked: "Niveau 5"
  },
  {
    id: "niveau-10",
    category: "maitrise",
    name: "Dix niveaux de patience",
    description: "Atteindre le niveau 10.",
    condition: {
      kind: "level",
      target: 10
    },
    xpBonus: 200,
    titleUnlocked: null
  },
  {
    id: "niveau-11",
    category: "maitrise",
    name: "Niveau 11",
    description: "Atteindre le niveau 11.",
    condition: {
      kind: "level",
      target: 11
    },
    xpBonus: 250,
    titleUnlocked: "Niveau 11"
  },
  {
    id: "niveau-15",
    category: "maitrise",
    name: "Quinze niveaux",
    description: "Atteindre le niveau 15.",
    condition: {
      kind: "level",
      target: 15
    },
    xpBonus: 300,
    titleUnlocked: null
  },
  {
    id: "niveau-17",
    category: "maitrise",
    name: "Niveau 17",
    description: "Atteindre le niveau 17.",
    condition: {
      kind: "level",
      target: 17
    },
    xpBonus: 400,
    titleUnlocked: "Niveau 17"
  },
  {
    id: "niveau-20",
    category: "maitrise",
    name: "Niveau 20",
    description: "Atteindre le niveau 20.",
    condition: {
      kind: "level",
      target: 20
    },
    xpBonus: 500,
    titleUnlocked: "Niveau maximum"
  },
  {
    id: "rang-legendaire",
    category: "maitrise",
    name: "Au-del\xE0 du plafond",
    description: "Faire passer une caract\xE9ristique au rang l\xE9gendaire (score 21).",
    condition: {
      kind: "legendary_abilities",
      target: 1
    },
    xpBonus: 500,
    titleUnlocked: "Au-del\xE0 des limites"
  },
  {
    id: "decouvreur-10",
    category: "exploration",
    name: "Premiers horizons",
    description: "Accomplir 10 qu\xEAtes diff\xE9rentes.",
    condition: {
      kind: "discovered",
      target: 10
    },
    xpBonus: 50,
    titleUnlocked: null
  },
  {
    id: "decouvreur-50",
    category: "exploration",
    name: "Explorateur du catalogue",
    description: "Accomplir 50 qu\xEAtes diff\xE9rentes.",
    condition: {
      kind: "discovered",
      target: 50
    },
    xpBonus: 150,
    titleUnlocked: "Curieux"
  },
  {
    id: "decouvreur-100",
    category: "exploration",
    name: "Cartographe",
    description: "Accomplir 100 qu\xEAtes diff\xE9rentes.",
    condition: {
      kind: "discovered",
      target: 100
    },
    xpBonus: 250,
    titleUnlocked: null
  },
  {
    id: "decouvreur-200",
    category: "exploration",
    name: "Catalogue complet",
    description: "Accomplir 200 qu\xEAtes diff\xE9rentes.",
    condition: {
      kind: "discovered",
      target: 200
    },
    xpBonus: 500,
    titleUnlocked: "Biblioth\xE9caire"
  },
  {
    id: "premier-journal",
    category: "exploration",
    name: "Premi\xE8re page",
    description: "Valider une qu\xEAte Journal.",
    condition: {
      kind: "journal_entries",
      target: 1
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "journal-10",
    category: "exploration",
    name: "Le journal se remplit",
    description: "\xC9crire 10 entr\xE9es de journal.",
    condition: {
      kind: "journal_entries",
      target: 10
    },
    xpBonus: 100,
    titleUnlocked: null
  },
  {
    id: "journal-50",
    category: "exploration",
    name: "Assidu du journal",
    description: "\xC9crire 50 entr\xE9es de journal.",
    condition: {
      kind: "journal_entries",
      target: 50
    },
    xpBonus: 250,
    titleUnlocked: "Assidu du journal"
  },
  {
    id: "forgeron",
    category: "exploration",
    name: "Premi\xE8re qu\xEAte cr\xE9\xE9e",
    description: "Forger ta premi\xE8re qu\xEAte personnalis\xE9e.",
    condition: {
      kind: "custom_quests",
      target: 1
    },
    xpBonus: 50,
    titleUnlocked: null
  },
  {
    id: "maitre-forgeron",
    category: "exploration",
    name: "Cr\xE9ateur de qu\xEAtes",
    description: "Forger 5 qu\xEAtes personnalis\xE9es.",
    condition: {
      kind: "custom_quests",
      target: 5
    },
    xpBonus: 150,
    titleUnlocked: "Cr\xE9ateur de qu\xEAtes"
  },
  {
    id: "premiere-publication",
    category: "exploration",
    name: "Premi\xE8re publication",
    description: "Publier ta premi\xE8re victoire au Village.",
    condition: {
      kind: "posts_shared",
      target: 1
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "dix-publications",
    category: "exploration",
    name: "Dix publications",
    description: "Publier 10 victoires au Village.",
    condition: {
      kind: "posts_shared",
      target: 10
    },
    xpBonus: 100,
    titleUnlocked: null
  },
  {
    id: "cinquante-publications",
    category: "exploration",
    name: "Cinquante publications",
    description: "Publier 50 victoires au Village.",
    condition: {
      kind: "posts_shared",
      target: 50
    },
    xpBonus: 250,
    titleUnlocked: "Cinquante publications"
  },
  {
    id: "premier-compagnon",
    category: "exploration",
    name: "Une main tendue",
    description: "Ajouter ton premier compagnon.",
    condition: {
      kind: "friends",
      target: 1
    },
    xpBonus: 50,
    titleUnlocked: null
  },
  {
    id: "cinq-compagnons",
    category: "exploration",
    name: "Cinq amis",
    description: "Avoir 5 compagnons.",
    condition: {
      kind: "friends",
      target: 5
    },
    xpBonus: 100,
    titleUnlocked: null
  },
  {
    id: "vingt-compagnons",
    category: "exploration",
    name: "Vingt amis",
    description: "Avoir 20 compagnons.",
    condition: {
      kind: "friends",
      target: 20
    },
    xpBonus: 250,
    titleUnlocked: "Rassembleur"
  },
  {
    id: "encourageur",
    category: "exploration",
    name: "Le Mot Gentil",
    description: "Encourager 100 publications de tes compagnons.",
    condition: {
      kind: "reactions_given",
      target: 100
    },
    xpBonus: 150,
    titleUnlocked: "Le Bienveillant"
  },
  {
    id: "tueur-de-dragons-1",
    category: "exploits",
    name: "Premi\xE8re qu\xEAte l\xE9gendaire",
    description: "Accomplir une qu\xEAte L\xE9gendaire.",
    condition: {
      kind: "quests_by_difficulty",
      difficulty: "expert",
      target: 1
    },
    xpBonus: 100,
    titleUnlocked: null
  },
  {
    id: "tueur-de-dragons-5",
    category: "exploits",
    name: "5 qu\xEAtes l\xE9gendaires",
    description: "Accomplir 5 qu\xEAtes L\xE9gendaires.",
    condition: {
      kind: "quests_by_difficulty",
      difficulty: "expert",
      target: 5
    },
    xpBonus: 250,
    titleUnlocked: null
  },
  {
    id: "tueur-de-dragons",
    category: "exploits",
    name: "10 qu\xEAtes l\xE9gendaires",
    description: "Accomplir 10 qu\xEAtes L\xE9gendaires.",
    condition: {
      kind: "quests_by_difficulty",
      difficulty: "expert",
      target: 10
    },
    xpBonus: 400,
    titleUnlocked: "10 qu\xEAtes l\xE9gendaires"
  },
  {
    id: "tueur-de-dragons-25",
    category: "exploits",
    name: "25 qu\xEAtes l\xE9gendaires",
    description: "Accomplir 25 qu\xEAtes L\xE9gendaires.",
    condition: {
      kind: "quests_by_difficulty",
      difficulty: "expert",
      target: 25
    },
    xpBonus: 500,
    titleUnlocked: null
  },
  {
    id: "audacieux-10",
    category: "exploits",
    name: "Audacieux",
    description: "Accomplir 10 qu\xEAtes Audacieuses.",
    condition: {
      kind: "quests_by_difficulty",
      difficulty: "high",
      target: 10
    },
    xpBonus: 100,
    titleUnlocked: null
  },
  {
    id: "audacieux-50",
    category: "exploits",
    name: "50 qu\xEAtes audacieuses",
    description: "Accomplir 50 qu\xEAtes Audacieuses.",
    condition: {
      kind: "quests_by_difficulty",
      difficulty: "high",
      target: 50
    },
    xpBonus: 300,
    titleUnlocked: "50 qu\xEAtes audacieuses"
  },
  {
    id: "semainier",
    category: "exploits",
    name: "Ma\xEEtre de la semaine",
    description: "Accomplir 10 qu\xEAtes hebdomadaires.",
    condition: {
      kind: "weekly_done",
      target: 10
    },
    xpBonus: 150,
    titleUnlocked: null
  },
  {
    id: "moissonneur",
    category: "exploits",
    name: "6 qu\xEAtes mensuelles",
    description: "Accomplir 6 qu\xEAtes mensuelles.",
    condition: {
      kind: "monthly_done",
      target: 6
    },
    xpBonus: 250,
    titleUnlocked: null
  },
  {
    id: "dix-heures-silence",
    category: "exploits",
    name: "Dix heures chronom\xE9tr\xE9es",
    description: "Cumuler 10 heures sur le chronom\xE8tre int\xE9gr\xE9.",
    condition: {
      kind: "timer_minutes",
      target: 600
    },
    xpBonus: 150,
    titleUnlocked: null
  },
  {
    id: "cinquante-heures",
    category: "exploits",
    name: "Cinquante heures chronom\xE9tr\xE9es",
    description: "Cumuler 50 heures sur le chronom\xE8tre int\xE9gr\xE9.",
    condition: {
      kind: "timer_minutes",
      target: 3e3
    },
    xpBonus: 400,
    titleUnlocked: "Le Patient"
  },
  {
    id: "inspire-1",
    category: "exploits",
    name: "Premi\xE8re \xE9tincelle",
    description: "Utiliser un point d\u2019Inspiration.",
    condition: {
      kind: "inspiration_used",
      target: 1
    },
    xpBonus: 25,
    titleUnlocked: null
  },
  {
    id: "inspire-10",
    category: "exploits",
    name: "\xC9tincelle",
    description: "Utiliser 10 points d\u2019Inspiration.",
    condition: {
      kind: "inspiration_used",
      target: 10
    },
    xpBonus: 150,
    titleUnlocked: null
  },
  {
    id: "equilibre-15",
    category: "equilibre",
    name: "Ligne droite",
    description: "Avoir toutes les caract\xE9ristiques \xE0 15 ou plus.",
    condition: {
      kind: "all_scores_min",
      target: 15
    },
    xpBonus: 250,
    titleUnlocked: null
  },
  {
    id: "equilibre-18",
    category: "equilibre",
    name: "Presque parfait",
    description: "Avoir toutes les caract\xE9ristiques \xE0 18 ou plus.",
    condition: {
      kind: "all_scores_min",
      target: 18
    },
    xpBonus: 450,
    titleUnlocked: null
  },
  {
    id: "polymathe",
    category: "equilibre",
    name: "Polymathe",
    description: "Avoir toutes les caract\xE9ristiques \xE0 14 ou plus.",
    condition: {
      kind: "all_scores_min",
      target: 14
    },
    xpBonus: 300,
    titleUnlocked: "Polymathe"
  },
  {
    id: "equilibre-16",
    category: "equilibre",
    name: "Profil complet",
    description: "Avoir toutes les caract\xE9ristiques \xE0 16 ou plus.",
    condition: {
      kind: "all_scores_min",
      target: 16
    },
    xpBonus: 400,
    titleUnlocked: null
  },
  {
    id: "six-couleurs",
    category: "equilibre",
    name: "Les Six Couleurs",
    description: "Accomplir une qu\xEAte dans chacune des six caract\xE9ristiques au cours d\u2019une m\xEAme semaine.",
    condition: {
      kind: "week_all_abilities",
      target: 6
    },
    xpBonus: 150,
    titleUnlocked: "Arc-en-ciel"
  },
  {
    id: "equilibre-20",
    category: "equilibre",
    name: "La Perfection tranquille",
    description: "Avoir toutes les caract\xE9ristiques \xE0 20.",
    condition: {
      kind: "all_scores_min",
      target: 20
    },
    xpBonus: 500,
    titleUnlocked: "Perfection tranquille"
  },
  {
    id: "retour-du-roi",
    category: "secrets",
    name: "De retour",
    description: "Reprendre apr\xE8s 14 jours d\u2019absence.",
    condition: {
      kind: "comeback",
      target: 14
    },
    xpBonus: 100,
    titleUnlocked: "De retour",
    isSecret: true,
    hint: "Reprendre apr\xE8s une pause compte aussi."
  },
  {
    id: "retour-30",
    category: "secrets",
    name: "Retour apr\xE8s 30 jours",
    description: "Reprendre apr\xE8s 30 jours d\u2019absence.",
    condition: {
      kind: "comeback",
      target: 30
    },
    xpBonus: 150,
    titleUnlocked: null,
    isSecret: true,
    hint: "Il n\u2019est jamais trop tard."
  },
  {
    id: "dix-mille-xp",
    category: "secrets",
    name: "10 000 XP",
    description: "Gagner 10 000 XP au total.",
    condition: {
      kind: "total_xp",
      target: 1e4
    },
    xpBonus: 200,
    titleUnlocked: null,
    isSecret: true,
    hint: "Les chiffres ronds portent chance."
  },
  {
    id: "cinquante-mille-xp",
    category: "secrets",
    name: "50 000 XP",
    description: "Gagner 50 000 XP au total.",
    condition: {
      kind: "total_xp",
      target: 5e4
    },
    xpBonus: 400,
    titleUnlocked: null,
    isSecret: true,
    hint: "Peu de joueurs vont jusque-l\xE0."
  },
  {
    id: "repos-10",
    category: "secrets",
    name: "Le Sage Patient",
    description: "D\xE9clarer 10 jours de repos.",
    condition: {
      kind: "rest_days",
      target: 10
    },
    xpBonus: 100,
    titleUnlocked: "Le Sage Patient",
    isSecret: true,
    hint: "Savoir s\u2019arr\xEAter est aussi une force."
  },
  {
    id: "inspire-30",
    category: "secrets",
    name: "30 Inspirations",
    description: "Utiliser 30 points d\u2019Inspiration.",
    condition: {
      kind: "inspiration_used",
      target: 30
    },
    xpBonus: 250,
    titleUnlocked: null,
    isSecret: true,
    hint: "Une habitude s\u2019est install\xE9e."
  }
];

// packages/content/data/dungeons.fr.json
var dungeons_fr_default = [
  {
    id: "dj-randonnee",
    theme: "randonnee",
    name: "Sentier des Brumes",
    glyph: "\u{1F97E}",
    blurb: "Sentier des Brumes met \xE0 l\u2019\xE9preuve ta discipline en randonn\xE9e.",
    tier: 1,
    unlockLevel: 3,
    rooms: [
      "un Corbeau moqueur",
      "une Ronce vorace",
      "un Sanglier boueux",
      "un Loup des \xE9boulis",
      "un Esprit de la brume"
    ],
    boss: "le G\xE9ant des Cimes"
  },
  {
    id: "dj-danse",
    theme: "danse",
    name: "Salle des Miroirs",
    glyph: "\u{1F483}",
    blurb: "Salle des Miroirs met \xE0 l\u2019\xE9preuve ta discipline en danse.",
    tier: 1,
    unlockLevel: 3,
    rooms: [
      "un Valet maladroit",
      "une Marionnette folle",
      "un Cavalier sans visage",
      "une Danseuse fant\xF4me",
      "un Ma\xEEtre de ballet spectral"
    ],
    boss: "la Reine du Bal Maudit"
  },
  {
    id: "dj-yoga",
    theme: "yoga",
    name: "Temple des Souffles",
    glyph: "\u{1F9D8}",
    blurb: "Temple des Souffles met \xE0 l\u2019\xE9preuve ta discipline en yoga.",
    tier: 1,
    unlockLevel: 3,
    rooms: [
      "un Moineau agit\xE9",
      "une Pens\xE9e parasite",
      "un Singe bavard",
      "un Gardien du seuil",
      "un Serpent d\u2019orage"
    ],
    boss: "le Dragon du Lotus"
  },
  {
    id: "dj-cuisine",
    theme: "cuisine",
    name: "Cuisines Infernales",
    glyph: "\u{1F373}",
    blurb: "Cuisines Infernales met \xE0 l\u2019\xE9preuve ta discipline en cuisine.",
    tier: 1,
    unlockLevel: 3,
    rooms: [
      "un Rat de cave",
      "un Couteau volant",
      "une Soupe vivante",
      "un Marmiton rancunier",
      "un Four hurlant"
    ],
    boss: "le Chef des Casseroles"
  },
  {
    id: "dj-mobilite",
    theme: "mobilite",
    name: "Gorges des Raideurs",
    glyph: "\u{1F938}",
    blurb: "Gorges des Raideurs met \xE0 l\u2019\xE9preuve ta discipline en mobilit\xE9 et stretching.",
    tier: 2,
    unlockLevel: 6,
    rooms: [
      "une Poulie grin\xE7ante",
      "un N\u0153ud de muscles",
      "un Golem de rouille",
      "un Mur de courbatures",
      "une Chim\xE8re contract\xE9e"
    ],
    boss: "le Titan Rouill\xE9"
  },
  {
    id: "dj-nutrition",
    theme: "nutrition",
    name: "Jardins Gloutons",
    glyph: "\u{1F957}",
    blurb: "Jardins Gloutons met \xE0 l\u2019\xE9preuve ta discipline en nutrition et sant\xE9.",
    tier: 2,
    unlockLevel: 6,
    rooms: [
      "un Pigeon pillard",
      "une Carotte mutante",
      "un Gobelin sucr\xE9",
      "une Grande Faim",
      "un Spectre du grignotage"
    ],
    boss: "l\u2019Ogre du Buffet"
  },
  {
    id: "dj-sommeil",
    theme: "sommeil",
    name: "Royaume des R\xEAves",
    glyph: "\u{1F319}",
    blurb: "Royaume des R\xEAves met \xE0 l\u2019\xE9preuve ta discipline en sommeil et r\xE9cup\xE9ration.",
    tier: 2,
    unlockLevel: 6,
    rooms: [
      "une Chauve-souris insomniaque",
      "un Cauchemar tapi",
      "un Lutin des soupirs",
      "une Horloge affol\xE9e",
      "un Spectre des \xE9crans"
    ],
    boss: "le Marchand d\u2019Insomnies"
  },
  {
    id: "dj-botanique",
    theme: "botanique",
    name: "For\xEAt des Racines",
    glyph: "\u{1F33F}",
    blurb: "For\xEAt des Racines met \xE0 l\u2019\xE9preuve ta discipline en botanique.",
    tier: 2,
    unlockLevel: 6,
    rooms: [
      "un Pissenlit rebelle",
      "une Liane \xE9trangleuse",
      "un Champignon hargneux",
      "un Loup-garou des foug\xE8res",
      "une Dryade furieuse"
    ],
    boss: "l\u2019Arbre-Monde"
  },
  {
    id: "dj-course",
    theme: "course",
    name: "Piste des Vents",
    glyph: "\u{1F3C3}",
    blurb: "Piste des Vents met \xE0 l\u2019\xE9preuve ta discipline en course \xE0 pied.",
    tier: 3,
    unlockLevel: 9,
    rooms: [
      "un Li\xE8vre arrogant",
      "un L\xE9vrier de brume",
      "un Centaure essouffl\xE9",
      "une Harpie du dernier kilom\xE8tre",
      "un Mur invisible"
    ],
    boss: "le Cerb\xE8re du Marathon"
  },
  {
    id: "dj-dessin",
    theme: "dessin",
    name: "Atelier des Teintes",
    glyph: "\u{1F3A8}",
    blurb: "Atelier des Teintes met \xE0 l\u2019\xE9preuve ta discipline en dessin et peinture.",
    tier: 3,
    unlockLevel: 9,
    rooms: [
      "une Tache rebelle",
      "un Pinceau enrag\xE9",
      "un Croquis vivant",
      "un Golem de fusain",
      "un Spectre de la toile blanche"
    ],
    boss: "le Peintre Sans Visage"
  },
  {
    id: "dj-musique",
    theme: "musique",
    name: "Salle des \xC9chos",
    glyph: "\u{1F3B5}",
    blurb: "Salle des \xC9chos met \xE0 l\u2019\xE9preuve ta discipline en musique.",
    tier: 3,
    unlockLevel: 9,
    rooms: [
      "un Diapason fou",
      "une Corde vengeresse",
      "un Tambour des profondeurs",
      "une Sir\xE8ne d\xE9saccord\xE9e",
      "un Barde sans \xE2me"
    ],
    boss: "le Chef d\u2019Orchestre Fant\xF4me"
  },
  {
    id: "dj-lecture-ecriture",
    theme: "lecture-ecriture",
    name: "Biblioth\xE8que Interdite",
    glyph: "\u{1F4DA}",
    blurb: "Biblioth\xE8que Interdite met \xE0 l\u2019\xE9preuve ta discipline en lecture et \xE9criture.",
    tier: 3,
    unlockLevel: 9,
    rooms: [
      "un Ver de papier",
      "une Page blanche hant\xE9e",
      "un Grimoire mordeur",
      "un Scribe fant\xF4me",
      "un Gardien des index"
    ],
    boss: "le Grand Censeur"
  },
  {
    id: "dj-pilates",
    theme: "pilates",
    name: "Studio des \xC9quilibres",
    glyph: "\u2696\uFE0F",
    blurb: "Studio des \xC9quilibres met \xE0 l\u2019\xE9preuve ta discipline en pilates.",
    tier: 4,
    unlockLevel: 12,
    rooms: [
      "un Tapis glissant",
      "un Ballon rebelle",
      "un Ressort affol\xE9",
      "un Gardien du centre",
      "un Spectre de la posture"
    ],
    boss: "le Funambule Noir"
  },
  {
    id: "dj-natation",
    theme: "natation",
    name: "Grottes Immerg\xE9es",
    glyph: "\u{1F3CA}",
    blurb: "Grottes Immerg\xE9es met \xE0 l\u2019\xE9preuve ta discipline en natation.",
    tier: 4,
    unlockLevel: 12,
    rooms: [
      "une M\xE9duse nerveuse",
      "un Crabe pin\xE7ant",
      "une Mur\xE8ne sournoise",
      "un Banc de piranhas",
      "une Sir\xE8ne des abysses"
    ],
    boss: "le Kraken des Profondeurs"
  },
  {
    id: "dj-cyclisme",
    theme: "cyclisme",
    name: "Col des G\xE9ants",
    glyph: "\u{1F6B4}",
    blurb: "Col des G\xE9ants met \xE0 l\u2019\xE9preuve ta discipline en cyclisme.",
    tier: 4,
    unlockLevel: 12,
    rooms: [
      "un Chien de ferme hargneux",
      "un Virage tra\xEEtre",
      "un Vent de face",
      "un Cyclope des lacets",
      "un Spectre du brouillard"
    ],
    boss: "le Dragon du Col Maudit"
  },
  {
    id: "dj-langues",
    theme: "langues",
    name: "Tour de Babel",
    glyph: "\u{1F5E3}\uFE0F",
    blurb: "Tour de Babel met \xE0 l\u2019\xE9preuve ta discipline en langues.",
    tier: 4,
    unlockLevel: 12,
    rooms: [
      "un Perroquet malicieux",
      "un Faux-ami sournois",
      "un Verbe irr\xE9gulier",
      "un Golem de grammaire",
      "un Sphinx des conjugaisons"
    ],
    boss: "le Seigneur des Idiomes"
  },
  {
    id: "dj-meditation",
    theme: "meditation",
    name: "Montagne du Silence",
    glyph: "\u{1F3D4}\uFE0F",
    blurb: "Montagne du Silence met \xE0 l\u2019\xE9preuve ta discipline en m\xE9ditation et respiration.",
    tier: 5,
    unlockLevel: 15,
    rooms: [
      "un Souffle volage",
      "une Pens\xE9e envahissante",
      "un Moine bavard",
      "un \xC9cho tenace",
      "un Fant\xF4me d\u2019inqui\xE9tude"
    ],
    boss: "l\u2019Ermite du Vide"
  },
  {
    id: "dj-bricolage",
    theme: "bricolage",
    name: "Forge Oubli\xE9e",
    glyph: "\u{1F527}",
    blurb: "Forge Oubli\xE9e met \xE0 l\u2019\xE9preuve ta discipline en bricolage et artisanat.",
    tier: 5,
    unlockLevel: 15,
    rooms: [
      "un Clou rebelle",
      "une Scie dentue",
      "un \xC9tau vorace",
      "un Automate d\xE9traqu\xE9",
      "un Marteau-pilon"
    ],
    boss: "le Colosse de Rouille"
  },
  {
    id: "dj-entraide",
    theme: "entraide",
    name: "Village Assi\xE9g\xE9",
    glyph: "\u{1F91D}",
    blurb: "Village Assi\xE9g\xE9 met \xE0 l\u2019\xE9preuve ta discipline en entraide et b\xE9n\xE9volat.",
    tier: 5,
    unlockLevel: 15,
    rooms: [
      "un Brigand \xE9go\xEFste",
      "une Temp\xEAte de mis\xE8re",
      "un Corbeau du doute",
      "un Garde sourd",
      "un Spectre de solitude"
    ],
    boss: "le Seigneur de l\u2019Indiff\xE9rence"
  },
  {
    id: "dj-strategie",
    theme: "strategie",
    name: "\xC9chiquier G\xE9ant",
    glyph: "\u265F\uFE0F",
    blurb: "\xC9chiquier G\xE9ant met \xE0 l\u2019\xE9preuve ta discipline en jeux de strat\xE9gie.",
    tier: 5,
    unlockLevel: 15,
    rooms: [
      "un Pion hargneux",
      "un Cavalier pi\xE9geux",
      "un Fou retors",
      "une Tour implacable",
      "une Dame cruelle"
    ],
    boss: "le Roi Noir"
  },
  {
    id: "dj-theatre",
    theme: "theatre",
    name: "Th\xE9\xE2tre des Ombres",
    glyph: "\u{1F3AD}",
    blurb: "Th\xE9\xE2tre des Ombres met \xE0 l\u2019\xE9preuve ta discipline en th\xE9\xE2tre et prise de parole.",
    tier: 6,
    unlockLevel: 18,
    rooms: [
      "un Trac d\xE9vorant",
      "un Accessoire hant\xE9",
      "un Critique mordant",
      "un Fant\xF4me de l\u2019op\xE9ra",
      "une Voix du public"
    ],
    boss: "le Souffleur Maudit"
  },
  {
    id: "dj-culture",
    theme: "culture",
    name: "Mus\xE9e des \xC2ges",
    glyph: "\u{1F3DB}\uFE0F",
    blurb: "Mus\xE9e des \xC2ges met \xE0 l\u2019\xE9preuve ta discipline en culture g\xE9n\xE9rale.",
    tier: 6,
    unlockLevel: 18,
    rooms: [
      "une Statue sceptique",
      "une Momie \xE9rudite",
      "un Vase maudit",
      "un Gardien de fresques",
      "un Chevalier d\u2019armure vide"
    ],
    boss: "le Conservateur \xC9ternel"
  },
  {
    id: "dj-escalade",
    theme: "escalade",
    name: "Falaise du Vertige",
    glyph: "\u{1F9D7}",
    blurb: "Falaise du Vertige met \xE0 l\u2019\xE9preuve ta discipline en escalade.",
    tier: 6,
    unlockLevel: 18,
    rooms: [
      "un Rocher branlant",
      "une Chauve-souris des fissures",
      "un Aigle jaloux",
      "un Vertige rampant",
      "un \xC9boulement vivant"
    ],
    boss: "le Gardien du Sommet"
  },
  {
    id: "dj-programmation",
    theme: "programmation",
    name: "Labyrinthe du Code",
    glyph: "\u{1F4BB}",
    blurb: "Labyrinthe du Code met \xE0 l\u2019\xE9preuve ta discipline en programmation.",
    tier: 6,
    unlockLevel: 18,
    rooms: [
      "un Point-virgule manquant",
      "une Boucle infinie",
      "un Gobelin des d\xE9pendances",
      "un Golem de spaghetti",
      "un D\xE9mon de la production"
    ],
    boss: "le Bug Originel"
  },
  {
    id: "dj-musculation",
    theme: "musculation",
    name: "Ar\xE8ne de Fonte",
    glyph: "\u{1F3CB}\uFE0F",
    blurb: "Ar\xE8ne de Fonte met \xE0 l\u2019\xE9preuve ta discipline en musculation.",
    tier: 7,
    unlockLevel: 20,
    rooms: [
      "un Halt\xE8re fou",
      "un Sac de sable vivant",
      "un Golem de plaques",
      "un Minotaure du squat",
      "un Titan de barres"
    ],
    boss: "le Colosse de Fonte"
  },
  {
    id: "dj-arts-martiaux",
    theme: "arts-martiaux",
    name: "Dojo des Cent Combats",
    glyph: "\u{1F94B}",
    blurb: "Dojo des Cent Combats met \xE0 l\u2019\xE9preuve ta discipline en arts martiaux.",
    tier: 7,
    unlockLevel: 20,
    rooms: [
      "un Disciple fougueux",
      "un Ninja des ombres",
      "un Moine guerrier",
      "un Samoura\xEF fant\xF4me",
      "un Dragon de jade"
    ],
    boss: "le Ma\xEEtre Sans Nom"
  }
];

// packages/content/data/items.fr.json
var items_fr_default = [
  {
    id: "epee-du-sentier",
    slot: "arme",
    ability: "FOR",
    name: "\xC9p\xE9e du sentier",
    glyph: "\u2694\uFE0F",
    blurb: "Une lame honn\xEAte, forg\xE9e pour ceux qui avancent un pas apr\xE8s l\u2019autre.",
    setId: "titan"
  },
  {
    id: "dague-vive",
    slot: "arme",
    ability: "DEX",
    name: "Dague vive",
    glyph: "\u{1F5E1}\uFE0F",
    blurb: "L\xE9g\xE8re et rapide, elle r\xE9compense les gestes pr\xE9cis.",
    setId: "ombre"
  },
  {
    id: "baton-des-sages",
    slot: "arme",
    ability: "INT",
    name: "B\xE2ton des sages",
    glyph: "\u{1FA84}",
    blurb: "Il s\u2019\xE9claire quand on r\xE9fl\xE9chit avant d\u2019agir.",
    setId: "erudit"
  },
  {
    id: "arc-de-l-aube",
    slot: "arme",
    ability: "SAG",
    name: "Arc de l\u2019aube",
    glyph: "\u{1F3F9}",
    blurb: "Il ne rate jamais ceux qui savent attendre le bon moment.",
    setId: "aube"
  },
  {
    id: "sceptre-d-eloquence",
    slot: "arme",
    ability: "CHA",
    name: "Sceptre d\u2019\xE9loquence",
    glyph: "\u{1F531}",
    blurb: "Les foules se taisent quand on le brandit.",
    setId: "troubadour"
  },
  {
    id: "masse-du-rempart",
    slot: "arme",
    ability: "CON",
    name: "Masse du rempart",
    glyph: "\u{1F528}",
    blurb: "Lourde \xE0 porter, plus lourde encore \xE0 encaisser.",
    setId: "rempart"
  },
  {
    id: "hache-du-forgeron",
    slot: "arme",
    ability: "FOR",
    name: "Hache du forgeron",
    glyph: "\u{1FA93}",
    blurb: "Chaque coup raconte des heures d\u2019entra\xEEnement.",
    setId: null
  },
  {
    id: "fleuret-leger",
    slot: "arme",
    ability: "DEX",
    name: "Fleuret l\xE9ger",
    glyph: "\u{1F93A}",
    blurb: "Une pointe fine pour des appuis parfaits.",
    setId: null
  },
  {
    id: "casque-de-fer",
    slot: "tete",
    ability: "CON",
    name: "Casque de fer",
    glyph: "\u26D1\uFE0F",
    blurb: "Il en a vu d\u2019autres, et il tient toujours.",
    setId: "rempart"
  },
  {
    id: "chapeau-de-voyageur",
    slot: "tete",
    ability: "DEX",
    name: "Chapeau de voyageur",
    glyph: "\u{1F3A9}",
    blurb: "Un chapeau qui aime le grand air et les chemins de traverse.",
    setId: "ombre"
  },
  {
    id: "couronne-de-lauriers",
    slot: "tete",
    ability: "CHA",
    name: "Couronne de lauriers",
    glyph: "\u{1F451}",
    blurb: "Offerte \xE0 celui qui a su rassembler.",
    setId: "troubadour"
  },
  {
    id: "diademe-du-savant",
    slot: "tete",
    ability: "INT",
    name: "Diad\xE8me du savant",
    glyph: "\u{1F393}",
    blurb: "Il scintille \xE0 chaque nouvelle id\xE9e.",
    setId: "erudit"
  },
  {
    id: "capuche-du-veilleur",
    slot: "tete",
    ability: "SAG",
    name: "Capuche du veilleur",
    glyph: "\u{1F977}",
    blurb: "Sous sa capuche, on entend mieux ce qui compte.",
    setId: "aube"
  },
  {
    id: "bandeau-du-guerrier",
    slot: "tete",
    ability: "FOR",
    name: "Bandeau du guerrier",
    glyph: "\u{1F3F4}",
    blurb: "Nou\xE9 serr\xE9, il retient la sueur et le doute.",
    setId: "titan"
  },
  {
    id: "heaume-du-gardien",
    slot: "tete",
    ability: "CON",
    name: "Heaume du gardien",
    glyph: "\u{1FA96}",
    blurb: "Un heaume qui n\u2019a jamais c\xE9d\xE9.",
    setId: null
  },
  {
    id: "lunettes-d-erudit",
    slot: "tete",
    ability: "INT",
    name: "Lunettes d\u2019\xE9rudit",
    glyph: "\u{1F453}",
    blurb: "Elles lisent entre les lignes.",
    setId: null
  },
  {
    id: "cotte-de-mailles",
    slot: "torse",
    ability: "CON",
    name: "Cotte de mailles",
    glyph: "\u{1F6E1}\uFE0F",
    blurb: "Des milliers d\u2019anneaux, pour une seule certitude : tenir bon.",
    setId: "rempart"
  },
  {
    id: "tunique-du-voyageur",
    slot: "torse",
    ability: "DEX",
    name: "Tunique du voyageur",
    glyph: "\u{1F455}",
    blurb: "Souple et l\xE9g\xE8re, elle suit tous les mouvements.",
    setId: "ombre"
  },
  {
    id: "armure-de-plates",
    slot: "torse",
    ability: "FOR",
    name: "Armure de plates",
    glyph: "\u{1F9BA}",
    blurb: "Pour qui porte sa force avec fiert\xE9.",
    setId: "titan"
  },
  {
    id: "robe-de-sagesse",
    slot: "torse",
    ability: "SAG",
    name: "Robe de sagesse",
    glyph: "\u{1F458}",
    blurb: "Elle apaise tout ce qui la touche.",
    setId: "aube"
  },
  {
    id: "manteau-d-orateur",
    slot: "torse",
    ability: "CHA",
    name: "Manteau d\u2019orateur",
    glyph: "\u{1F9E5}",
    blurb: "Un manteau qui donne envie de prendre la parole.",
    setId: "troubadour"
  },
  {
    id: "veste-de-l-artisan",
    slot: "torse",
    ability: "INT",
    name: "Veste de l\u2019artisan",
    glyph: "\u{1F97C}",
    blurb: "Pleine de poches, pleine de solutions.",
    setId: "erudit"
  },
  {
    id: "plastron-de-cuir",
    slot: "torse",
    ability: "CON",
    name: "Plastron de cuir",
    glyph: "\u{1F94B}",
    blurb: "\xC9prouv\xE9 par mille entra\xEEnements.",
    setId: null
  },
  {
    id: "cape-du-conteur",
    slot: "torse",
    ability: "CHA",
    name: "Cape du conteur",
    glyph: "\u{1F9E3}",
    blurb: "Elle claque au vent quand l\u2019histoire commence.",
    setId: null
  },
  {
    id: "gantelets-de-force",
    slot: "mains",
    ability: "FOR",
    name: "Gantelets de force",
    glyph: "\u{1F9E4}",
    blurb: "Ils serrent plus fort qu\u2019on ne l\u2019imagine.",
    setId: "titan"
  },
  {
    id: "gants-d-artisan",
    slot: "mains",
    ability: "DEX",
    name: "Gants d\u2019artisan",
    glyph: "\u270B",
    blurb: "Un tour de main h\xE9rit\xE9 de g\xE9n\xE9rations d\u2019ateliers.",
    setId: "ombre"
  },
  {
    id: "bracelets-de-calme",
    slot: "mains",
    ability: "SAG",
    name: "Bracelets de calme",
    glyph: "\u{1F4FF}",
    blurb: "Un souffle, un grain, un instant de paix.",
    setId: "aube"
  },
  {
    id: "mitaines-d-ecriture",
    slot: "mains",
    ability: "INT",
    name: "Mitaines d\u2019\xE9criture",
    glyph: "\u270D\uFE0F",
    blurb: "Elles laissent les doigts libres pour la plume.",
    setId: "erudit"
  },
  {
    id: "poignets-du-rempart",
    slot: "mains",
    ability: "CON",
    name: "Poignets du rempart",
    glyph: "\u{1F932}",
    blurb: "Rien ne les fait plier.",
    setId: "rempart"
  },
  {
    id: "gants-de-velours",
    slot: "mains",
    ability: "CHA",
    name: "Gants de velours",
    glyph: "\u{1F91D}",
    blurb: "Pour les poign\xE9es de main qui scellent les amiti\xE9s.",
    setId: "troubadour"
  },
  {
    id: "poings-d-acier",
    slot: "mains",
    ability: "FOR",
    name: "Poings d\u2019acier",
    glyph: "\u{1F94A}",
    blurb: "Une garde solide, une volont\xE9 plus solide encore.",
    setId: null
  },
  {
    id: "anneau-de-vivacite",
    slot: "mains",
    ability: "DEX",
    name: "Anneau de vivacit\xE9",
    glyph: "\u{1F48D}",
    blurb: "Il rend chaque geste plus vif.",
    setId: null
  },
  {
    id: "bottes-de-sept-lieues",
    slot: "bottes",
    ability: "DEX",
    name: "Bottes de sept lieues",
    glyph: "\u{1F97E}",
    blurb: "Elles avalent les kilom\xE8tres sans fatigue.",
    setId: "ombre"
  },
  {
    id: "sandales-du-pelerin",
    slot: "bottes",
    ability: "SAG",
    name: "Sandales du p\xE8lerin",
    glyph: "\u{1FA74}",
    blurb: "Elles connaissent le chemin, m\xEAme sans carte.",
    setId: "aube"
  },
  {
    id: "bottes-de-fer",
    slot: "bottes",
    ability: "CON",
    name: "Bottes de fer",
    glyph: "\u{1F462}",
    blurb: "Elles ancrent leur porteur dans la terre.",
    setId: "rempart"
  },
  {
    id: "souliers-de-danse",
    slot: "bottes",
    ability: "CHA",
    name: "Souliers de danse",
    glyph: "\u{1F45E}",
    blurb: "Impossible de les porter sans sourire.",
    setId: "troubadour"
  },
  {
    id: "chaussons-de-lecture",
    slot: "bottes",
    ability: "INT",
    name: "Chaussons de lecture",
    glyph: "\u{1F9E6}",
    blurb: "Pour les longues soir\xE9es avec un bon livre.",
    setId: "erudit"
  },
  {
    id: "sabots-du-bucheron",
    slot: "bottes",
    ability: "FOR",
    name: "Sabots du b\xFBcheron",
    glyph: "\u{1FAB5}",
    blurb: "Solides comme le ch\xEAne qu\u2019ils ont vu tomber.",
    setId: "titan"
  },
  {
    id: "bottines-de-sentier",
    slot: "bottes",
    ability: "CON",
    name: "Bottines de sentier",
    glyph: "\u{1F97F}",
    blurb: "Elles tiennent la distance, saison apr\xE8s saison.",
    setId: null
  },
  {
    id: "baskets-du-coureur",
    slot: "bottes",
    ability: "DEX",
    name: "Baskets du coureur",
    glyph: "\u{1F45F}",
    blurb: "L\xE9g\xE8res, fid\xE8les, toujours pr\xEAtes \xE0 partir.",
    setId: null
  },
  {
    id: "pendentif-du-sage",
    slot: "amulette",
    ability: "INT",
    name: "Pendentif du sage",
    glyph: "\u{1F52E}",
    blurb: "Il murmure la r\xE9ponse \xE0 ceux qui cherchent.",
    setId: "erudit"
  },
  {
    id: "talisman-de-force",
    slot: "amulette",
    ability: "FOR",
    name: "Talisman de force",
    glyph: "\u{1F9FF}",
    blurb: "Il chauffe quand l\u2019effort se fait sentir.",
    setId: "titan"
  },
  {
    id: "medaillon-de-l-aube",
    slot: "amulette",
    ability: "SAG",
    name: "M\xE9daillon de l\u2019aube",
    glyph: "\u{1F305}",
    blurb: "Il brille chaque matin o\xF9 l\u2019on recommence.",
    setId: "aube"
  },
  {
    id: "collier-du-troubadour",
    slot: "amulette",
    ability: "CHA",
    name: "Collier du troubadour",
    glyph: "\u{1F4EF}",
    blurb: "Les chansons y sont grav\xE9es.",
    setId: "troubadour"
  },
  {
    id: "amulette-de-vigueur",
    slot: "amulette",
    ability: "CON",
    name: "Amulette de vigueur",
    glyph: "\u2764\uFE0F",
    blurb: "Elle bat au rythme de ton endurance.",
    setId: "rempart"
  },
  {
    id: "breloque-agile",
    slot: "amulette",
    ability: "DEX",
    name: "Breloque agile",
    glyph: "\u{1F340}",
    blurb: "Un porte-bonheur pour les pieds l\xE9gers.",
    setId: "ombre"
  },
  {
    id: "sautoir-d-erudit",
    slot: "amulette",
    ability: "INT",
    name: "Sautoir d\u2019\xE9rudit",
    glyph: "\u{1F4DC}",
    blurb: "Il porte la m\xE9moire de mille lectures.",
    setId: null
  },
  {
    id: "sceau-du-gardien",
    slot: "amulette",
    ability: "SAG",
    name: "Sceau du gardien",
    glyph: "\u{1FAAC}",
    blurb: "Il veille sur ceux qui veillent sur les autres.",
    setId: null
  }
];

// packages/content/data/sets.fr.json
var sets_fr_default = [
  {
    id: "titan",
    name: "Panoplie du Titan",
    glyph: "\u{1F9BE}",
    ability: "FOR",
    blurb: "Forg\xE9e pour ceux qui soul\xE8vent le monde un effort apr\xE8s l\u2019autre.",
    pieces: {
      arme: "epee-du-sentier",
      tete: "bandeau-du-guerrier",
      torse: "armure-de-plates",
      mains: "gantelets-de-force",
      bottes: "sabots-du-bucheron",
      amulette: "talisman-de-force"
    },
    bonuses: [
      {
        pieces: 2,
        pp: 5,
        ability: 1
      },
      {
        pieces: 4,
        pp: 12,
        ability: 3
      },
      {
        pieces: 6,
        pp: 25,
        ability: 6
      }
    ]
  },
  {
    id: "ombre",
    name: "Panoplie de l\u2019Ombre",
    glyph: "\u{1F312}",
    ability: "DEX",
    blurb: "L\xE9g\xE8re, silencieuse, toujours un pas devant.",
    pieces: {
      arme: "dague-vive",
      tete: "chapeau-de-voyageur",
      torse: "tunique-du-voyageur",
      mains: "gants-d-artisan",
      bottes: "bottes-de-sept-lieues",
      amulette: "breloque-agile"
    },
    bonuses: [
      {
        pieces: 2,
        pp: 5,
        ability: 1
      },
      {
        pieces: 4,
        pp: 12,
        ability: 3
      },
      {
        pieces: 6,
        pp: 25,
        ability: 6
      }
    ]
  },
  {
    id: "rempart",
    name: "Panoplie du Rempart",
    glyph: "\u{1F3F0}",
    ability: "CON",
    blurb: "Rien ne la fait plier, et rien ne la fait reculer.",
    pieces: {
      arme: "masse-du-rempart",
      tete: "casque-de-fer",
      torse: "cotte-de-mailles",
      mains: "poignets-du-rempart",
      bottes: "bottes-de-fer",
      amulette: "amulette-de-vigueur"
    },
    bonuses: [
      {
        pieces: 2,
        pp: 5,
        ability: 1
      },
      {
        pieces: 4,
        pp: 12,
        ability: 3
      },
      {
        pieces: 6,
        pp: 25,
        ability: 6
      }
    ]
  },
  {
    id: "erudit",
    name: "Panoplie de l\u2019\xC9rudit",
    glyph: "\u{1F4DA}",
    ability: "INT",
    blurb: "Chaque pi\xE8ce garde la trace d\u2019une id\xE9e qui a fait ses preuves.",
    pieces: {
      arme: "baton-des-sages",
      tete: "diademe-du-savant",
      torse: "veste-de-l-artisan",
      mains: "mitaines-d-ecriture",
      bottes: "chaussons-de-lecture",
      amulette: "pendentif-du-sage"
    },
    bonuses: [
      {
        pieces: 2,
        pp: 5,
        ability: 1
      },
      {
        pieces: 4,
        pp: 12,
        ability: 3
      },
      {
        pieces: 6,
        pp: 25,
        ability: 6
      }
    ]
  },
  {
    id: "aube",
    name: "Panoplie de l\u2019Aube",
    glyph: "\u{1F304}",
    ability: "SAG",
    blurb: "Elle brille pour ceux qui recommencent chaque matin.",
    pieces: {
      arme: "arc-de-l-aube",
      tete: "capuche-du-veilleur",
      torse: "robe-de-sagesse",
      mains: "bracelets-de-calme",
      bottes: "sandales-du-pelerin",
      amulette: "medaillon-de-l-aube"
    },
    bonuses: [
      {
        pieces: 2,
        pp: 5,
        ability: 1
      },
      {
        pieces: 4,
        pp: 12,
        ability: 3
      },
      {
        pieces: 6,
        pp: 25,
        ability: 6
      }
    ]
  },
  {
    id: "troubadour",
    name: "Panoplie du Troubadour",
    glyph: "\u{1F3AD}",
    ability: "CHA",
    blurb: "Faite pour rassembler : on la porte pour qu\u2019on vous suive.",
    pieces: {
      arme: "sceptre-d-eloquence",
      tete: "couronne-de-lauriers",
      torse: "manteau-d-orateur",
      mains: "gants-de-velours",
      bottes: "souliers-de-danse",
      amulette: "collier-du-troubadour"
    },
    bonuses: [
      {
        pieces: 2,
        pp: 5,
        ability: 1
      },
      {
        pieces: 4,
        pp: 12,
        ability: 3
      },
      {
        pieces: 6,
        pp: 25,
        ability: 6
      }
    ]
  }
];

// packages/engine/src/server/hero-stats.ts
var SETS = sets_fr_default;
var CLASSES = classes_fr_default;
function buildSnapshot(character, items) {
  const masteries = masteriesOf(CLASSES, character.classId);
  const equipped = items.filter((i) => i.equipped);
  const setBonus = setBonusTotals(SETS, items);
  return {
    items,
    equipped,
    setBonus,
    scores: adventureScores(abilityScores(character), equipped, masteries, setBonus),
    power: heroPowerBreakdown(character, items, masteries, setBonus)
  };
}
async function heroSnapshot(store, userId, character, known) {
  return buildSnapshot(character, known ?? await store.listItems(userId));
}
async function heroCombatStats(store, userId, character) {
  const snap = await heroSnapshot(store, userId, character);
  return { power: snap.power.total, scores: snap.scores };
}

// packages/engine/src/server/season-game.ts
var fail = (error, message) => ({ ok: false, error, message });
async function recordPower(ctx, userId, character, power, today) {
  const next = character.power === power ? character : { ...character, power };
  if (next !== character) await ctx.store.saveCharacter(userId, next);
  await ctx.store.upsertSeasonScore(userId, seasonInfo(today).key, power, today);
  return next;
}
async function syncHeroPower(ctx, userId) {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return;
  const snap = await heroSnapshot(ctx.store, userId, character);
  await recordPower(ctx, userId, character, snap.power.total, gameDate(ctx.now(), settings.timezone, settings.resetHour));
}
function viewOfResult(r) {
  const idx = seasonIndexOfKey(r.seasonKey) ?? 0;
  return {
    seasonKey: r.seasonKey,
    name: `Saison ${idx}`,
    rank: r.rank,
    participants: r.participants,
    power: r.power,
    frame: r.frame ?? null,
    chest: r.frame !== null
  };
}
async function evaluateSeasons(ctx, userId, character, today, settings) {
  const current = seasonInfo(today);
  const [scores, results] = await Promise.all([ctx.store.listSeasonScores(userId), ctx.store.listSeasonResults(userId)]);
  const done = new Set(results.map((r) => r.seasonKey));
  const due = scores.filter((s) => !done.has(s.seasonKey) && (seasonIndexOfKey(s.seasonKey) ?? Infinity) < current.index).sort((a, b) => (seasonIndexOfKey(a.seasonKey) ?? 0) - (seasonIndexOfKey(b.seasonKey) ?? 0));
  const evaluated = [];
  const nowIso = new Date(ctx.now()).toISOString();
  let hero = character;
  for (const score of due) {
    const qualifies = seasonQualifies(score.firstDay, score.lastDay);
    let rank = null;
    let participants = 0;
    let reward = null;
    if (qualifies) {
      const board = settings.leaderboardOptIn ? rankSeason(await ctx.store.seasonRanking(userId, score.seasonKey)) : [];
      participants = board.length;
      rank = board.find((r) => r.profileId === userId)?.rank ?? null;
      reward = seasonReward(rank, participants);
      const chest = { id: ctx.uuid(), rarity: SEASON_CHEST, source: "season", sourceKey: score.seasonKey, instanceId: null, createdAt: nowIso, openedAt: null };
      await ctx.store.insertChest(userId, chest);
    }
    const record = { seasonKey: score.seasonKey, rank, participants, power: score.power, frame: reward?.frame ?? null, createdAt: nowIso };
    if (!await ctx.store.insertSeasonResult(userId, record)) continue;
    const view = viewOfResult(record);
    evaluated.push(view);
    if (reward) {
      hero = { ...hero, frameStyle: frameStyleOf(score.seasonKey, reward.frame) };
      await ctx.store.saveCharacter(userId, hero);
      try {
        await ctx.store.notify(userId, "season_end", { season: score.seasonKey, name: view.name, rank, participants, frame: reward.frame });
      } catch (e) {
        console.error("season notify", e);
      }
    }
  }
  return { character: hero, evaluated };
}
async function getSeasonState(ctx, userId) {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return fail("no-character");
  const today = gameDate(ctx.now(), settings.timezone, settings.resetHour);
  const season = seasonInfo(today);
  const evaluation = await evaluateSeasons(ctx, userId, character, today, settings);
  const snap = await heroSnapshot(ctx.store, userId, evaluation.character);
  const hero = await recordPower(ctx, userId, evaluation.character, snap.power.total, today);
  const [scores, board, results] = await Promise.all([
    ctx.store.listSeasonScores(userId),
    ctx.store.seasonRanking(userId, season.key),
    ctx.store.listSeasonResults(userId)
  ]);
  const ranked = settings.leaderboardOptIn ? rankSeason(board) : [];
  const rank = ranked.find((r) => r.profileId === userId)?.rank ?? null;
  const mine = scores.find((s) => s.seasonKey === season.key);
  const reward = seasonReward(rank, ranked.length);
  const def = SEASON_FRAME_DEFS[reward.frame];
  const style = parseFrameStyle(hero.frameStyle);
  return {
    ok: true,
    character: hero,
    state: {
      season,
      power: snap.power.total,
      optedIn: settings.leaderboardOptIn,
      rank,
      participants: ranked.length,
      daysPlayed: mine ? Math.max(0, diffDays(mine.lastDay, mine.firstDay)) + 1 : 1,
      qualifies: mine ? seasonQualifies(mine.firstDay, mine.lastDay) : false,
      reward: { ...reward, frameLabel: def.label, frameGlyph: def.glyph, frameColor: def.color },
      frame: style ? { ...style, ...SEASON_FRAME_DEFS[style.frame] } : null,
      results: results.map(viewOfResult).sort((a, b) => (seasonIndexOfKey(b.seasonKey) ?? 0) - (seasonIndexOfKey(a.seasonKey) ?? 0)),
      evaluated: evaluation.evaluated
    }
  };
}

// packages/engine/src/server/adventure-game.ts
var ITEMS = items_fr_default;
var DUNGEONS = dungeons_fr_default;
var CLASSES2 = classes_fr_default;
var fail2 = (error, message) => ({ ok: false, error, message });
async function loadAdv(ctx, userId) {
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
    masteries: masteriesOf(CLASSES2, character.classId)
  };
}
var SET_OF = new Map(ITEMS.filter((i) => i.setId).map((i) => [i.id, i.setId]));
function viewOf(item, masteries) {
  return {
    ...item,
    setId: SET_OF.get(item.templateId) ?? null,
    power: itemPower(item, masteries),
    abilityBonus: itemAbilityBonus(item, masteries),
    upgradeCost: upgradeCost(item.level),
    dismantleValue: dismantleValue(item.rarity)
  };
}
var opensToday = (c, today) => c.chestOpensDate === today ? c.chestOpensToday : 0;
function expeditionStart(env) {
  const ms = Date.parse(env.character.expeditionStartedAt ?? "");
  return Number.isNaN(ms) ? env.nowMs : Math.min(ms, env.nowMs);
}
async function snapshot(env, knownItems) {
  return buildSnapshot(env.character, knownItems ?? await env.ctx.store.listItems(env.userId));
}
async function syncGear(env, character = env.character) {
  const snap = await snapshot({ ...env, character });
  return recordPower(env.ctx, env.userId, character, snap.power.total, env.today);
}
function expeditionOf(env, snap) {
  const startMs = expeditionStart(env);
  const y = expeditionYield({ pp: snap.power.total, scores: snap.scores, streak: env.character.streakCurrent, elapsedMs: env.nowMs - startMs });
  return {
    ...y,
    startedAt: new Date(startMs).toISOString(),
    capHours: EXPEDITION_CAP_HOURS,
    streakMultiplier: streakMultiplier(env.character.streakCurrent),
    claimable: env.nowMs - startMs >= EXPEDITION_MIN_CLAIM_MS
  };
}
async function stateOf(env) {
  const [snap, chests] = await Promise.all([snapshot(env), env.ctx.store.listChests(env.userId, { opened: false })]);
  const counts = Object.fromEntries(CHEST_RARITIES.map((r) => [r, 0]));
  for (const c of chests) counts[c.rarity]++;
  const used = opensToday(env.character, env.today);
  const equipped = {};
  for (const it of snap.equipped) equipped[it.slot] = it.id;
  return {
    today: env.today,
    power: snap.power.total,
    powerBreakdown: { level: snap.power.level, scores: snap.power.scores, items: snap.power.items, sets: snap.power.sets },
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
    items: snap.items.map((i) => viewOf(i, env.masteries)),
    equipped,
    sets: setsProgress(SETS, snap.items),
    setBonus: { pp: snap.setBonus.pp, abilities: snap.setBonus.abilities },
    seasonEvaluated: []
  };
}
async function getAdventureState(ctx, userId) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  if (!env.character.expeditionStartedAt) {
    env.character = { ...env.character, expeditionStartedAt: env.nowIso };
    await ctx.store.saveCharacter(userId, env.character);
  }
  const season = await evaluateSeasons(ctx, userId, env.character, env.today, env.settings);
  env.character = season.character;
  await ctx.store.insertChest(userId, newChest(env, DAILY_FREE_CHEST, "daily", env.today));
  const state = { ...await stateOf(env), seasonEvaluated: season.evaluated };
  env.character = await recordPower(ctx, userId, env.character, state.power, env.today);
  return { ok: true, state, character: env.character };
}
async function claimExpedition(ctx, userId) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  const startMs = expeditionStart(env);
  if (env.nowMs - startMs < EXPEDITION_MIN_CLAIM_MS) return fail2("nothing-pending", "Ton exp\xE9dition vient de partir : reviens plus tard.");
  const snap = await snapshot(env);
  const y = expeditionOf(env, snap);
  const keyGained = env.character.keys < MAX_KEYS && rollExpeditionKey(`${userId}|exp|${new Date(startMs).toISOString()}`, y.keyChance);
  const character = {
    ...env.character,
    gold: env.character.gold + y.gold,
    fragments: env.character.fragments + y.fragments,
    keys: Math.min(MAX_KEYS, env.character.keys + (keyGained ? 1 : 0)),
    expeditionStartedAt: env.nowIso
  };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, claim: { gold: y.gold, fragments: y.fragments, hours: y.hours, capped: y.capped, keyGained }, character };
}
var newChest = (env, rarity, source, sourceKey, instanceId = null) => ({
  id: env.ctx.uuid(),
  rarity,
  source,
  sourceKey,
  instanceId,
  createdAt: env.nowIso,
  openedAt: null
});
async function openChest(ctx, userId, input) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  const chests = await ctx.store.listChests(userId);
  const chest = chests.find((c) => c.id === input.chestId);
  if (!chest) return fail2("not-found", "Coffre introuvable.");
  if (chest.openedAt) return fail2("not-found", "Ce coffre est d\xE9j\xE0 ouvert.");
  const used = opensToday(env.character, env.today);
  if (used >= CHEST_OPENS_PER_DAY) return fail2("daily-cap", `Tu as d\xE9j\xE0 ouvert ${CHEST_OPENS_PER_DAY} coffres aujourd\u2019hui : reviens demain.`);
  const snap = await snapshot(env);
  const draw = drawChest({
    chest: chest.rarity,
    sag: snap.scores.SAG,
    pity: env.character.chestPity,
    // Graine : profil + compteur d'ouvertures (déterministe pour les tests).
    seed: `${userId}|chest|${chests.filter((c) => c.openedAt).length}`,
    templates: ITEMS
  });
  if (!await ctx.store.markChestOpened(userId, chest.id, env.nowIso)) return fail2("not-found", "Ce coffre est d\xE9j\xE0 ouvert.");
  const item = {
    id: ctx.uuid(),
    templateId: draw.template.id,
    rarity: draw.rarity,
    slot: draw.template.slot,
    ability: draw.template.ability,
    level: 0,
    equipped: false,
    createdAt: env.nowIso
  };
  await ctx.store.insertItems(userId, [item]);
  const character = {
    ...env.character,
    gold: env.character.gold + draw.gold,
    fragments: env.character.fragments + draw.fragments,
    chestPity: draw.pity,
    chestOpensDate: env.today,
    chestOpensToday: used + 1
  };
  await ctx.store.saveCharacter(userId, character);
  return {
    ok: true,
    opening: {
      chest: { ...chest, openedAt: env.nowIso },
      item: viewOf(item, env.masteries),
      gold: draw.gold,
      fragments: draw.fragments,
      guaranteed: draw.guaranteed,
      opensToday: used + 1
    },
    character
  };
}
async function mergeChests(ctx, userId, input) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  if (!CHEST_RARITIES.includes(input.rarity)) return fail2("invalid", "Raret\xE9 de coffre inconnue.");
  const next = nextChestRarity(input.rarity);
  if (!next) return fail2("invalid", "Un coffre mythique ne peut pas \xEAtre fusionn\xE9.");
  const pool = (await ctx.store.listChests(userId, { opened: false })).filter((c) => c.rarity === input.rarity);
  if (pool.length < MERGE_COUNT) return fail2("insufficient", `Il faut ${MERGE_COUNT} coffres de m\xEAme raret\xE9 pour les fusionner.`);
  for (const c of pool.slice(0, MERGE_COUNT)) {
    if (!await ctx.store.markChestOpened(userId, c.id, env.nowIso)) return fail2("not-found", "Un des coffres a d\xE9j\xE0 \xE9t\xE9 utilis\xE9.");
  }
  const chest = newChest(env, next, "merge", ctx.uuid());
  await ctx.store.insertChest(userId, chest);
  return { ok: true, chest };
}
async function grantQuestChests(i) {
  const chests = [];
  let keysGained = 0;
  const mk = (rarity, source, sourceKey) => ({
    id: i.uuid(),
    rarity,
    source,
    sourceKey,
    instanceId: i.instanceId,
    createdAt: i.nowIso,
    openedAt: null
  });
  const give = async (chest, key) => {
    if (await i.store.insertChest(i.userId, chest)) {
      chests.push(chest);
      if (key) keysGained++;
    }
  };
  if (i.isTrackQuest && i.isDaily) await give(mk(dailyChestRarity(i.streak), "quest", i.completedDay), false);
  if (i.promotion) await give(mk(rungChestRarity(i.promotion.rung), "rung", `${i.promotion.trackId}:${i.promotion.rung}`), true);
  if (i.isDaily && i.streak > i.prevStreak) {
    const rarity = streakMilestoneChest(i.streak);
    if (rarity) await give(mk(rarity, "streak", `${i.streak}:${i.completedDay}`), true);
  }
  const keys = Math.min(MAX_KEYS, i.character.keys + keysGained);
  return { character: keys === i.character.keys ? i.character : { ...i.character, keys }, chests, keysGained: keys - i.character.keys };
}
async function revokeQuestChests(store, userId, instanceId) {
  const mine = (await store.listChests(userId, { opened: false })).filter((c) => c.instanceId === instanceId);
  if (!mine.length) return { removed: 0, keysLost: 0 };
  await store.deleteChests(userId, mine.map((c) => c.id));
  return { removed: mine.length, keysLost: mine.filter((c) => c.source === "rung" || c.source === "streak").length };
}
var itemNotFound = () => fail2("not-found", "Objet introuvable.");
async function equipItem(ctx, userId, input) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  const items = await ctx.store.listItems(userId);
  const item = items.find((i) => i.id === input.itemId);
  if (!item) return itemNotFound();
  if (item.equipped) return { ok: true, item: viewOf(item, env.masteries), replaced: null };
  const current = items.find((i) => i.slot === item.slot && i.equipped);
  if (current) await ctx.store.updateItem(userId, current.id, { equipped: false });
  await ctx.store.updateItem(userId, item.id, { equipped: true });
  await syncGear(env);
  return { ok: true, item: viewOf({ ...item, equipped: true }, env.masteries), replaced: current?.id ?? null };
}
async function unequipSlot(ctx, userId, input) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  if (!EQUIP_SLOTS.includes(input.slot)) return fail2("invalid", "Emplacement inconnu.");
  const current = (await ctx.store.listItems(userId)).find((i) => i.slot === input.slot && i.equipped);
  if (!current) return fail2("not-found", "Aucun objet \xE9quip\xE9 \xE0 cet emplacement.");
  await ctx.store.updateItem(userId, current.id, { equipped: false });
  await syncGear(env);
  return { ok: true, item: viewOf({ ...current, equipped: false }, env.masteries) };
}
async function upgradeItem(ctx, userId, input) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  const item = (await ctx.store.listItems(userId)).find((i) => i.id === input.itemId);
  if (!item) return itemNotFound();
  const cost = upgradeCost(item.level);
  if (!cost) return fail2("invalid", `Cet objet est d\xE9j\xE0 au niveau maximal (${ITEM_MAX_LEVEL}).`);
  if (env.character.fragments < cost.fragments || env.character.gold < cost.gold) {
    return fail2("insufficient", `Il faut ${cost.fragments} fragments et ${cost.gold} or pour am\xE9liorer cet objet.`);
  }
  const character = { ...env.character, fragments: env.character.fragments - cost.fragments, gold: env.character.gold - cost.gold };
  await ctx.store.saveCharacter(userId, character);
  await ctx.store.updateItem(userId, item.id, { level: item.level + 1 });
  const synced = item.equipped ? await syncGear(env, character) : character;
  return { ok: true, item: viewOf({ ...item, level: item.level + 1 }, env.masteries), character: synced };
}
async function mergeItems(ctx, userId, input) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  const ids = [...new Set(input.itemIds ?? [])];
  if (ids.length !== MERGE_COUNT || (input.itemIds ?? []).length !== MERGE_COUNT) return fail2("invalid", `Choisis exactement ${MERGE_COUNT} objets diff\xE9rents.`);
  const items = await ctx.store.listItems(userId);
  const chosen = ids.map((id) => items.find((i) => i.id === id));
  if (chosen.some((i) => !i)) return itemNotFound();
  const picked = chosen;
  if (picked.some((i) => i.equipped)) return fail2("invalid", "Un objet \xE9quip\xE9 ne peut pas \xEAtre fusionn\xE9.");
  const rarity = picked[0].rarity;
  if (picked.some((i) => i.rarity !== rarity)) return fail2("invalid", "Les 3 objets doivent avoir la m\xEAme raret\xE9.");
  const next = nextItemRarity(rarity);
  if (!next) return fail2("invalid", "Un objet l\xE9gendaire ne peut pas \xEAtre fusionn\xE9.");
  const template = pickTemplateForSlot(ITEMS, picked[0].slot, `${userId}|${ids.join(",")}`);
  if (!template) return fail2("invalid", "Aucun mod\xE8le d\u2019objet pour cet emplacement.");
  await ctx.store.deleteItems(userId, ids);
  const item = {
    id: ctx.uuid(),
    templateId: template.id,
    rarity: next,
    slot: template.slot,
    ability: template.ability,
    level: 0,
    equipped: false,
    createdAt: env.nowIso
  };
  await ctx.store.insertItems(userId, [item]);
  return { ok: true, item: viewOf(item, env.masteries) };
}
async function dismantleItem(ctx, userId, input) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  const item = (await ctx.store.listItems(userId)).find((i) => i.id === input.itemId);
  if (!item) return itemNotFound();
  if (item.equipped) return fail2("invalid", "Retire cet objet avant de le d\xE9monter.");
  const fragments = dismantleValue(item.rarity);
  await ctx.store.deleteItems(userId, [item.id]);
  const character = { ...env.character, fragments: env.character.fragments + fragments };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, fragments, character };
}
async function listDungeons(ctx, userId) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  const [progress, snap] = await Promise.all([ctx.store.listDungeonProgress(userId), snapshot(env)]);
  const dungeons = DUNGEONS.map((d) => {
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
      bossChestClaimed: (p?.bossDefeatedTier ?? 0) >= d.tier
    };
  });
  return { ok: true, dungeons, keys: env.character.keys, maxKeys: MAX_KEYS, power: snap.power.total };
}
async function runDungeon(ctx, userId, input) {
  const env = await loadAdv(ctx, userId);
  if (!env) return fail2("no-character");
  const dungeon = DUNGEONS.find((d) => d.id === input.dungeonId);
  if (!dungeon) return fail2("not-found", "Donjon inconnu.");
  if (env.character.level < dungeon.unlockLevel) return fail2("level-too-low", `Ce donjon s\u2019ouvre au niveau ${dungeon.unlockLevel}.`);
  if (env.character.keys < 1) return fail2("no-key", "Il te faut une Cl\xE9 de donjon.");
  const [progressList, snap] = await Promise.all([ctx.store.listDungeonProgress(userId), snapshot(env)]);
  const before = progressList.find((p) => p.dungeonId === dungeon.id) ?? { dungeonId: dungeon.id, bestRoom: 0, bossDefeatedTier: 0, lastRunDate: null };
  const result = resolveDungeon({
    dungeon,
    pp: snap.power.total,
    scores: snap.scores,
    firstBossVictory: before.bossDefeatedTier < dungeon.tier,
    seed: `${userId}|${dungeon.id}|${env.today}|${env.character.keys}`
  });
  let chest = null;
  if (result.chest) {
    const c = newChest(env, result.chest, "dungeon", dungeon.id);
    if (await ctx.store.insertChest(userId, c)) chest = c;
  }
  const progress = {
    dungeonId: dungeon.id,
    bestRoom: Math.max(before.bestRoom, result.bossDefeated ? DUNGEON_BOSS_ROOM : result.reachedRoom),
    bossDefeatedTier: result.bossDefeated ? Math.max(before.bossDefeatedTier, dungeon.tier) : before.bossDefeatedTier,
    lastRunDate: env.today
  };
  await ctx.store.saveDungeonProgress(userId, progress);
  const character = {
    ...env.character,
    keys: env.character.keys - 1,
    gold: env.character.gold + result.gold,
    fragments: env.character.fragments + result.fragments
  };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, result: { ...result, chest: chest ? chest.rarity : null }, progress, chest, character };
}

// packages/engine/src/server/raid-game.ts
var fail3 = (error, message) => ({ ok: false, error, message });
var LOOKBACK_DAYS = 14;
async function loadRaidEnv(ctx, userId) {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return null;
  const nowMs = ctx.now();
  const today = gameDate(nowMs, settings.timezone, settings.resetHour);
  return { ctx, userId, character, settings, today, weekStart: raidWeekStart(today), weekEnd: raidWeekEnd(today), nowIso: new Date(nowMs).toISOString() };
}
var RAID_RULES = {
  minMembers: RAID_MIN_MEMBERS,
  maxMembers: RAID_MAX_MEMBERS,
  baseHp: RAID_BASE_HP,
  chaCap: RAID_CHA_CAP,
  encourageStep: RAID_ENCOURAGE_STEP,
  encourageCap: RAID_ENCOURAGE_CAP,
  fastDays: RAID_FAST_DAYS,
  winChest: RAID_WIN_CHEST,
  fastChest: RAID_FAST_CHEST
};
function emptyRaidState(today, available = false) {
  return {
    available,
    today,
    week: raidWeekKey(today),
    weekStart: raidWeekStart(today),
    weekEnd: raidWeekEnd(today),
    boss: raidBossFor(today),
    rules: RAID_RULES,
    team: null,
    invitations: [],
    hit: null,
    lastResult: null
  };
}
async function safeNotify(ctx, userId, type, payload) {
  try {
    await ctx.store.notify(userId, type, payload);
  } catch (e) {
    console.error("raid notify", type, e);
  }
}
var joinedOf = (members) => members.filter((m) => m.status === "joined");
var sumDamage = (rows) => rows.reduce((n, d) => n + d.damage, 0);
var rewardOf = (team) => team.outcome === "victory" && team.victoryDay ? { rarity: raidRewardChest(raidDaysToKill(team.weekStart, team.victoryDay)), days: raidDaysToKill(team.weekStart, team.victoryDay) } : null;
async function settleTeam(env, team) {
  if (team.resolvedAt) return team;
  const { ctx } = env;
  const [members, damage] = await Promise.all([ctx.store.listRaidMembers(team.id), ctx.store.listRaidDamage(team.id)]);
  const joined = joinedOf(members);
  const maxHp = raidMaxHp(joined.length);
  const totalDamage = sumDamage(damage);
  const outcome = raidOutcome({ joined: joined.length, totalDamage, maxHp, weekOver: raidWeekOver(team.weekStart, env.today) });
  if (!outcome) return team;
  const victoryDay = outcome === "victory" ? raidVictoryDay(damage.map((d) => ({ date: d.gameDate, damage: d.damage })), maxHp) : null;
  const reward = rewardOf({ outcome, victoryDay, weekStart: team.weekStart });
  const week = raidWeekKey(team.weekStart);
  if (reward) {
    for (const m of joined) {
      const chest = { id: ctx.uuid(), rarity: reward.rarity, source: "raid", sourceKey: `${week}:${team.id}`, instanceId: null, createdAt: env.nowIso, openedAt: null };
      await ctx.store.insertChest(m.profileId, chest);
    }
  }
  const closed = await ctx.store.resolveRaidTeam(team.id, { outcome, maxHp, totalDamage, victoryDay, at: env.nowIso });
  if (closed && reward) {
    for (const m of joined) {
      await safeNotify(ctx, m.profileId, "raid_victory", { team: team.id, week, chest: reward.rarity, days: reward.days, boss: raidBossFor(team.weekStart).name });
    }
  }
  return await ctx.store.getRaidTeam(team.id) ?? team;
}
async function loadRoster(ctx, members, me) {
  return Promise.all(
    members.map(async (record) => {
      const character = me && record.profileId === me.id ? me.character : await ctx.store.getCharacter(record.profileId);
      if (!character) return { record, character: null, power: 0, cha: 0, forScore: 0 };
      const s = await heroCombatStats(ctx.store, record.profileId, character);
      return { record, character, power: s.power, cha: s.scores.CHA, forScore: s.scores.FOR };
    })
  );
}
async function applyHit(env, team, roster, damage) {
  if (team.resolvedAt || env.today < team.weekStart || env.today > raidWeekEnd(team.weekStart)) return null;
  const mine = roster.find((r) => r.record.profileId === env.userId && r.record.status === "joined");
  if (!mine) return null;
  if (damage.some((d) => d.profileId === env.userId && d.gameDate === env.today)) return null;
  const chaBonus = raidChaBonus(roster.filter((r) => r.record.status === "joined" && r.character).map((r) => r.cha));
  const baseDamage = raidBaseDamage({ pp: mine.power, forScore: mine.forScore, chaBonus });
  const received = (await env.ctx.store.listRaidEncouragements(team.id, env.today)).filter((e) => e.toId === env.userId).length;
  const record = { teamId: team.id, profileId: env.userId, gameDate: env.today, baseDamage, encouragements: received, damage: raidDamage(baseDamage, received) };
  if (!await env.ctx.store.insertRaidDamage(record)) return null;
  return { teamId: team.id, date: env.today, damage: record.damage, baseDamage, chaBonus, encouragements: received, victory: false };
}
async function syncRaid(env) {
  const { ctx } = env;
  const memberships = await ctx.store.listRaidMemberships(env.userId, addDays(env.weekStart, -LOOKBACK_DAYS));
  for (const m of memberships.filter((x) => x.status === "joined" && x.weekStart < env.weekStart)) {
    const t = await ctx.store.getRaidTeam(m.teamId);
    if (t && !t.resolvedAt) await settleTeam(env, t);
  }
  const mine = memberships.find((m) => m.status === "joined" && m.weekStart === env.weekStart);
  if (!mine) return { team: null, members: [], hit: null, roster: [], damage: [], memberships };
  let team = await ctx.store.getRaidTeam(mine.teamId);
  if (!team) return { team: null, members: [], hit: null, roster: [], damage: [], memberships };
  team = await settleTeam(env, team);
  const members = await ctx.store.listRaidMembers(team.id);
  const roster = await loadRoster(ctx, joinedOf(members), { id: env.userId, character: env.character });
  let damage = await ctx.store.listRaidDamage(team.id);
  const hit = await applyHit(env, team, roster, damage);
  if (hit) {
    damage = await ctx.store.listRaidDamage(team.id);
    team = await settleTeam(env, team);
    if (team.outcome === "victory") hit.victory = true;
  }
  return { team, members, hit, roster, damage, memberships };
}
async function teamView(env, s) {
  const team = s.team;
  if (!team) return null;
  const { ctx } = env;
  const joined = joinedOf(s.members);
  const encToday = await ctx.store.listRaidEncouragements(team.id, env.today);
  const resolved = !!team.resolvedAt;
  const maxHp = resolved && team.maxHp !== null ? team.maxHp : raidMaxHp(joined.length);
  const damage = resolved && team.totalDamage !== null ? team.totalDamage : sumDamage(s.damage);
  const chaBonus = raidChaBonus(s.roster.filter((r) => r.character).map((r) => r.cha));
  const members = s.roster.filter((r) => r.character).map((r) => {
    const c = r.character;
    const id = r.record.profileId;
    const mineRows = s.damage.filter((d) => d.profileId === id);
    const today = mineRows.find((d) => d.gameDate === env.today);
    return {
      profileId: id,
      name: c.name,
      classId: c.classId,
      portraitId: c.portraitId,
      frameColor: c.frameColor,
      level: c.level,
      power: r.power,
      isLeader: id === team.leaderId,
      isMe: id === env.userId,
      joinedAt: r.record.joinedAt,
      hitToday: !!today,
      damageToday: today?.damage ?? 0,
      damageWeek: sumDamage(mineRows),
      encouragementsToday: encToday.filter((e) => e.toId === id).length,
      encouragedByMe: encToday.some((e) => e.toId === id && e.fromId === env.userId)
    };
  }).sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "") || a.profileId.localeCompare(b.profileId));
  const pendingRecords = s.members.filter((m) => m.status === "invited");
  const pending = await Promise.all(
    pendingRecords.map(async (m) => ({ profileId: m.profileId, name: (await ctx.store.getCharacter(m.profileId))?.name ?? "" }))
  );
  const reward = rewardOf(team);
  const status = team.outcome ?? (joined.length < RAID_MIN_MEMBERS ? "forming" : "active");
  return {
    id: team.id,
    weekStart: team.weekStart,
    weekEnd: raidWeekEnd(team.weekStart),
    leaderId: team.leaderId,
    status,
    members,
    pending,
    maxHp,
    damage,
    hpLeft: Math.max(0, maxHp - damage),
    ratio: maxHp > 0 ? Math.min(1, damage / maxHp) : 0,
    chaBonus,
    daysLeft: Math.max(0, diffDays(raidWeekEnd(team.weekStart), env.today) + 1),
    victoryDay: team.victoryDay,
    daysToKill: team.victoryDay ? raidDaysToKill(team.weekStart, team.victoryDay) : null,
    reward: reward?.rarity ?? null,
    resolvedAt: team.resolvedAt
  };
}
async function stateOf2(env, s) {
  const { ctx } = env;
  const team = await teamView(env, s);
  const invitations = [];
  if (!team) {
    for (const inv of s.memberships.filter((m) => m.status === "invited" && m.weekStart === env.weekStart)) {
      const t = await ctx.store.getRaidTeam(inv.teamId);
      if (!t || t.resolvedAt) continue;
      const [leader, members] = await Promise.all([ctx.store.getCharacter(t.leaderId), ctx.store.listRaidMembers(t.id)]);
      invitations.push({ teamId: t.id, leaderId: t.leaderId, leaderName: leader?.name ?? "", invitedAt: inv.createdAt, members: joinedOf(members).length });
    }
  }
  let lastResult = null;
  const past = s.memberships.filter((m) => m.status === "joined" && m.weekStart < env.weekStart).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  for (const m of past) {
    const t = await ctx.store.getRaidTeam(m.teamId);
    if (!t?.resolvedAt || !t.outcome) continue;
    const reward = rewardOf(t);
    lastResult = {
      teamId: t.id,
      weekStart: t.weekStart,
      boss: raidBossFor(t.weekStart),
      outcome: t.outcome,
      maxHp: t.maxHp ?? 0,
      damage: t.totalDamage ?? 0,
      daysToKill: t.victoryDay ? raidDaysToKill(t.weekStart, t.victoryDay) : null,
      reward: reward?.rarity ?? null,
      resolvedAt: t.resolvedAt
    };
    break;
  }
  return {
    ...emptyRaidState(env.today, true),
    team,
    invitations,
    hit: s.hit,
    lastResult
  };
}
async function freshState(env) {
  return stateOf2(env, await syncRaid(env));
}
async function getRaidState(ctx, userId) {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail3("no-character");
  return { ok: true, state: await freshState(env) };
}
async function autoRaidHit(ctx, userId) {
  try {
    const env = await loadRaidEnv(ctx, userId);
    return env ? (await syncRaid(env)).hit : null;
  } catch (e) {
    console.error("raid auto-hit", e);
    return null;
  }
}
async function createRaidTeam(ctx, userId) {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail3("no-character");
  const team = { id: ctx.uuid(), weekStart: env.weekStart, leaderId: userId, createdAt: env.nowIso, resolvedAt: null, outcome: null, maxHp: null, totalDamage: null, victoryDay: null };
  const leader = { teamId: team.id, profileId: userId, weekStart: env.weekStart, status: "joined", invitedBy: userId, createdAt: env.nowIso, joinedAt: env.nowIso };
  const existing = (await ctx.store.listRaidMemberships(userId, env.weekStart)).find((m) => m.status === "joined" && m.weekStart === env.weekStart);
  if (existing) return fail3("already-active", "Tu es d\xE9j\xE0 dans une \xE9quipe de raid cette semaine.");
  if (!await ctx.store.insertRaidTeam(team, leader)) return fail3("already-active", "Tu es d\xE9j\xE0 dans une \xE9quipe de raid cette semaine.");
  await ctx.store.deleteRaidInvites(userId, env.weekStart);
  return { ok: true, state: await freshState(env) };
}
async function myOpenTeam(env) {
  const mine = (await env.ctx.store.listRaidMemberships(env.userId, env.weekStart)).find((m) => m.status === "joined" && m.weekStart === env.weekStart);
  if (!mine) return null;
  const team = await env.ctx.store.getRaidTeam(mine.teamId);
  return team && !team.resolvedAt ? team : null;
}
async function inviteToRaid(ctx, userId, input) {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail3("no-character");
  const team = await myOpenTeam(env);
  if (!team) return fail3("no-team", "Cr\xE9e d\u2019abord ton \xE9quipe de raid.");
  if (team.leaderId !== userId) return fail3("forbidden", "Seul le chef d\u2019\xE9quipe peut inviter.");
  const target = input.profileId;
  if (!target || target === userId) return fail3("invalid", "Choisis un ami \xE0 inviter.");
  if (!await ctx.store.areFriends(userId, target)) return fail3("not-friends", "Tu ne peux inviter que tes compagnons.");
  const targetChar = await ctx.store.getCharacter(target);
  if (!targetChar) return fail3("not-found", "Ce compagnon n\u2019a pas encore de h\xE9ros.");
  const members = await ctx.store.listRaidMembers(team.id);
  if (members.some((m) => m.profileId === target)) return { ok: true, state: await freshState(env) };
  const theirs = await ctx.store.listRaidMemberships(target, env.weekStart);
  if (theirs.some((m) => m.status === "joined" && m.weekStart === env.weekStart)) return fail3("already-active", `${targetChar.name} est d\xE9j\xE0 dans une \xE9quipe cette semaine.`);
  if (members.length >= RAID_MAX_MEMBERS) return fail3("team-full", `Une \xE9quipe compte ${RAID_MAX_MEMBERS} membres au plus.`);
  const w = await ctx.store.insertRaidMember({ teamId: team.id, profileId: target, weekStart: env.weekStart, status: "invited", invitedBy: userId, createdAt: env.nowIso, joinedAt: null });
  if (w === "full") return fail3("team-full", `Une \xE9quipe compte ${RAID_MAX_MEMBERS} membres au plus.`);
  if (w === "not-friend") return fail3("not-friends", "Tu ne peux inviter que tes compagnons.");
  if (w === "conflict") return fail3("already-active", `${targetChar.name} est d\xE9j\xE0 dans une \xE9quipe cette semaine.`);
  if (w === "ok") await safeNotify(ctx, target, "raid_invite", { from: userId, username: env.character.name, team: team.id, week: raidWeekKey(env.weekStart) });
  return { ok: true, state: await freshState(env) };
}
async function joinRaidTeam(ctx, userId, input) {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail3("no-character");
  const team = input.teamId ? await ctx.store.getRaidTeam(input.teamId) : null;
  if (!team) return fail3("not-found", "Cette \xE9quipe n\u2019existe plus.");
  if (team.resolvedAt || team.weekStart !== env.weekStart) return fail3("raid-closed", "Ce raid est termin\xE9.");
  const members = await ctx.store.listRaidMembers(team.id);
  const me = members.find((m) => m.profileId === userId);
  if (me?.status === "joined") return { ok: true, state: await freshState(env) };
  if (!me) return fail3("forbidden", "Tu n\u2019as pas \xE9t\xE9 invit\xE9 dans cette \xE9quipe.");
  if ((await ctx.store.listRaidMemberships(userId, env.weekStart)).some((m) => m.status === "joined" && m.weekStart === env.weekStart)) {
    return fail3("already-active", "Tu es d\xE9j\xE0 dans une \xE9quipe de raid cette semaine.");
  }
  if (!await ctx.store.areFriends(me.invitedBy, userId)) {
    await ctx.store.deleteRaidMember(team.id, userId);
    return fail3("not-friends", "Tu n\u2019es plus compagnon de ce chef d\u2019\xE9quipe.");
  }
  if (joinedOf(members).length >= RAID_MAX_MEMBERS) return fail3("team-full", `Cette \xE9quipe compte d\xE9j\xE0 ${RAID_MAX_MEMBERS} membres.`);
  const w = await ctx.store.joinRaidMember(team.id, userId, env.nowIso);
  if (w === "full") return fail3("team-full", `Cette \xE9quipe compte d\xE9j\xE0 ${RAID_MAX_MEMBERS} membres.`);
  if (w === "conflict") return fail3("already-active", "Tu es d\xE9j\xE0 dans une \xE9quipe de raid cette semaine.");
  if (w === "not-friend") return fail3("not-friends", "Tu n\u2019es plus compagnon de ce chef d\u2019\xE9quipe.");
  await ctx.store.deleteRaidInvites(userId, env.weekStart);
  return { ok: true, state: await freshState(env) };
}
async function leaveRaidTeam(ctx, userId, input = {}) {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail3("no-character");
  const mine = (await ctx.store.listRaidMemberships(userId, env.weekStart)).filter((m) => m.weekStart === env.weekStart && (!input.teamId || m.teamId === input.teamId));
  const joined = mine.find((m) => m.status === "joined");
  const invited = mine.filter((m) => m.status === "invited");
  if (!joined) {
    if (!invited.length) return fail3("no-team", "Tu n\u2019as ni \xE9quipe ni invitation cette semaine.");
    for (const inv of invited) await ctx.store.deleteRaidMember(inv.teamId, userId);
    return { ok: true, state: await freshState(env) };
  }
  const team = await ctx.store.getRaidTeam(joined.teamId);
  if (team?.resolvedAt) return fail3("raid-closed", "Ce raid est termin\xE9.");
  await ctx.store.deleteRaidMember(joined.teamId, userId);
  if (team) {
    const rest = joinedOf(await ctx.store.listRaidMembers(team.id)).sort((a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "") || a.profileId.localeCompare(b.profileId));
    if (!rest.length) await ctx.store.deleteRaidTeam(team.id);
    else if (team.leaderId === userId) await ctx.store.setRaidLeader(team.id, rest[0].profileId);
  }
  return { ok: true, state: await freshState(env) };
}
async function encourageRaid(ctx, userId, input) {
  const env = await loadRaidEnv(ctx, userId);
  if (!env) return fail3("no-character");
  const team = await myOpenTeam(env);
  if (!team) return fail3("no-team", "Tu n\u2019as pas d\u2019\xE9quipe de raid en cours.");
  const target = input.profileId;
  if (!target || target === userId) return fail3("invalid", "Choisis un co\xE9quipier \xE0 encourager.");
  const members = joinedOf(await ctx.store.listRaidMembers(team.id));
  if (!members.some((m) => m.profileId === target)) return fail3("not-found", "Ce joueur ne fait pas partie de ton \xE9quipe.");
  const inserted = await ctx.store.insertRaidEncouragement({ teamId: team.id, fromId: userId, toId: target, gameDate: env.today, createdAt: env.nowIso });
  if (!inserted) return fail3("already-done", "Tu as d\xE9j\xE0 encourag\xE9 ce compagnon aujourd\u2019hui.");
  const received = (await ctx.store.listRaidEncouragements(team.id, env.today)).filter((e) => e.toId === target).length;
  const row = (await ctx.store.listRaidDamage(team.id)).find((d) => d.profileId === target && d.gameDate === env.today);
  if (row) await ctx.store.updateRaidDamage(team.id, target, env.today, { encouragements: received, damage: raidDamage(row.baseDamage, received) });
  await safeNotify(ctx, target, "raid_encouraged", { from: userId, username: env.character.name, team: team.id, week: raidWeekKey(env.weekStart) });
  return { ok: true, state: await freshState(env) };
}

// packages/engine/src/server/game.ts
var CLASSES3 = classes_fr_default;
var ACHIEVEMENTS = achievements_fr_default;
var STREAK_POSTS = [7, 14, 30, 60, 100, 200, 365];
var MAX_FREE_QUESTS_PER_DAY = 4;
var fail4 = (error, message) => ({ ok: false, error, message });
async function loadEnv(ctx, userId) {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return null;
  const nowMs = ctx.now();
  return { ctx, userId, character, settings, nowMs, today: gameDate(nowMs, settings.timezone, settings.resetHour), templates: {} };
}
function loadTemplates(env, withRungs = true) {
  const c = env.templates;
  if (withRungs) return c.full ??= env.ctx.store.listTemplates(env.userId);
  if (c.full) return c.full.then((l) => l.filter((t) => !t.trackId));
  return c.plain ??= env.ctx.store.listTemplates(env.userId, { withRungs: false }).then((l) => l.filter((t) => !t.trackId));
}
function masteriesFor(c) {
  return masteriesOf(CLASSES3, c.classId);
}
function pathAbilityFor(c) {
  return pathAbilityOf(CLASSES3, c.classId, c.pathId);
}
function snapshotOf(t) {
  return {
    ability: t.ability,
    difficulty: t.difficulty,
    title: t.title,
    flavor: t.flavor,
    objective: t.objective,
    tips: t.tips,
    validation: t.validation,
    tags: t.tags,
    ...t.theme ? { theme: t.theme } : {},
    ...t.secondary?.length ? { secondary: t.secondary } : {}
  };
}
function newInstance(id, t, period, start, end, status, nowIso, free = false, tune = 0, meta = {}) {
  const snapshot2 = tunedSnapshot(snapshotOf(t), t.validation, tune ?? 0);
  return {
    id,
    templateId: t.id,
    snapshot: snapshot2,
    period,
    periodStart: start,
    periodEnd: end,
    status,
    progress: 0,
    stepsDone: t.validation.type === "steps" ? t.validation.steps.map(() => false) : void 0,
    xpAwarded: 0,
    inspirationUsed: false,
    free,
    run: meta.run ?? 1,
    origin: meta.origin ?? "draw",
    ...meta.trackId ? { trackId: meta.trackId, rung: meta.rung ?? null } : {},
    acceptedAt: status === "accepted" ? nowIso : null,
    completedAt: null
  };
}
function eventFor(ctx, e, gameDay) {
  return { id: ctx.uuid(), custom: false, ...e, createdAt: new Date(ctx.now()).toISOString(), gameDate: gameDay };
}
function mergeChar(base, core) {
  return { ...base, ...core };
}
async function computePlayerStats(store, userId, character, settings, knownTemplates) {
  const [completed, templates, rest, journal, social] = await Promise.all([
    store.listInstances(userId, { status: "completed" }),
    knownTemplates ?? store.listTemplates(userId, { withRungs: false }),
    store.listRestDays(userId),
    store.countJournal(userId),
    store.socialCounts(userId)
  ]);
  const stats = emptyStats();
  stats.questsTotal = completed.length;
  stats.streakBest = character.streakBest;
  stats.level = character.level;
  stats.totalXp = character.totalXp;
  stats.scores = abilityScores(character);
  const days = /* @__PURE__ */ new Set();
  const abilitiesByWeek = /* @__PURE__ */ new Map();
  const discovered = /* @__PURE__ */ new Set();
  for (const q of completed) {
    stats.byDifficulty[q.snapshot.difficulty]++;
    stats.byAbility[q.snapshot.ability]++;
    discovered.add(q.templateId);
    if (q.inspirationUsed) stats.inspirationUsed++;
    if (q.period === "weekly") stats.weeklyDone++;
    if (q.period === "monthly") stats.monthlyDone++;
    if (q.snapshot.validation.type === "timer") stats.timerMinutes += q.snapshot.validation.minutes;
    if (q.completedAt) {
      const ms = Date.parse(q.completedAt);
      const minutes = localMinutes(ms, settings.timezone);
      if (minutes < 8 * 60) stats.earlyQuests++;
      if (minutes >= 21 * 60) stats.lateQuests++;
      const day = gameDate(ms, settings.timezone, settings.resetHour);
      days.add(day);
      const w = isoWeek(day);
      const key = `${w.year}-${w.week}`;
      if (!abilitiesByWeek.has(key)) abilitiesByWeek.set(key, /* @__PURE__ */ new Set());
      abilitiesByWeek.get(key).add(q.snapshot.ability);
    }
  }
  stats.discovered = discovered.size;
  const sorted = [...days].sort();
  for (let i = 1; i < sorted.length; i++) {
    stats.comebackGap = Math.max(stats.comebackGap, diffDays(sorted[i], sorted[i - 1]) - 1);
  }
  for (const set of abilitiesByWeek.values()) stats.weekAbilitiesMax = Math.max(stats.weekAbilitiesMax, set.size);
  const dailyByDay = /* @__PURE__ */ new Map();
  for (const q of await store.listInstances(userId, { period: "daily" })) {
    if (q.free) continue;
    if (!dailyByDay.has(q.periodStart)) dailyByDay.set(q.periodStart, []);
    dailyByDay.get(q.periodStart).push(q);
  }
  for (const qs of dailyByDay.values()) {
    if (qs.length && qs.every((q) => q.status === "completed")) stats.perfectDays++;
  }
  stats.journalEntries = journal;
  stats.customQuests = templates.filter((t) => t.source === "custom").length;
  stats.restDays = rest.length;
  stats.postsShared = social.posts;
  stats.friends = social.friends;
  stats.reactionsGiven = social.reactionsGiven;
  return stats;
}
async function achievementProgress(ctx, userId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return [];
  return evaluateAchievements(ACHIEVEMENTS, await computePlayerStats(ctx.store, userId, env.character, env.settings, await loadTemplates(env, false)));
}
async function recomputeCharacter(ctx, userId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return null;
  const events = await ctx.store.listXpEvents(userId);
  const abilityXp = emptyAbilityRecord(0);
  for (const e of events) abilityXp[e.ability] += e.amount;
  for (const a of ABILITIES) abilityXp[a] = Math.max(abilityXp[a], 0);
  const totalXp = ABILITIES.reduce((s, a) => s + abilityXp[a], 0);
  const streak = await streakInfo(ctx.store, userId, env.settings, env.today);
  const c = {
    ...env.character,
    abilityXp,
    totalXp,
    level: levelFromXp(totalXp),
    streakCurrent: streak.current,
    streakBest: Math.max(env.character.streakBest, streak.best)
  };
  await ctx.store.saveCharacter(userId, c);
  return c;
}
async function streakInfo(store, userId, settings, today) {
  const [daily, rest, tracks] = await Promise.all([
    store.listInstances(userId, { period: "daily", status: "completed", from: addDays(today, -800) }),
    store.listRestDays(userId),
    store.listTracks(userId)
  ]);
  const trackMode = tracks.some((t) => t.status === "active");
  let trackRuleFrom = null;
  for (const t of tracks) {
    const ms = Date.parse(t.startedAt);
    if (Number.isNaN(ms)) continue;
    const d = gameDate(ms, settings.timezone, settings.resetHour);
    if (trackRuleFrom === null || d < trackRuleFrom) trackRuleFrom = d;
  }
  const days = [];
  for (const q of daily) {
    if (!q.completedAt) continue;
    const day = gameDate(Date.parse(q.completedAt), settings.timezone, settings.resetHour);
    if (!trackMode || q.origin === "track" || trackRuleFrom !== null && day < trackRuleFrom) days.push(day);
  }
  const s = computeStreak(days, rest, today);
  return { current: s.current, doneToday: s.doneToday, best: computeBestStreak(days, rest), days };
}
async function createCharacter(ctx, userId, input) {
  if (await ctx.store.getCharacter(userId)) return fail4("already-has-character");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 30) return fail4("invalid", "Le nom doit faire entre 2 et 30 caract\xE8res.");
  if (!CLASSES3.some((c) => c.id === input.classId)) return fail4("invalid", "Classe inconnue.");
  if (!isValidPointBuy(input.scores)) return fail4("invalid", "R\xE9partition de points invalide.");
  if ((input.motto ?? "").length > 80) return fail4("invalid", "Devise trop longue.");
  const nowIso = new Date(ctx.now()).toISOString();
  const character = {
    id: ctx.uuid(),
    profileId: userId,
    name,
    classId: input.classId,
    pathId: null,
    baseScores: { ...input.scores },
    improvements: emptyAbilityRecord(0),
    improvementsChosen: 0,
    totalXp: 0,
    abilityXp: emptyAbilityRecord(0),
    level: 1,
    streakCurrent: 0,
    streakBest: 0,
    inspiration: 0,
    portraitId: input.portraitId,
    frameColor: input.frameColor,
    motto: input.motto ?? "",
    oath: input.oath ?? "",
    titleEquipped: null,
    rerollsDate: null,
    rerollsUsed: 0,
    createdAt: nowIso,
    ...emptyAdventureFields(),
    // L'expédition est toujours en cours dès la création du personnage.
    expeditionStartedAt: nowIso
  };
  await ctx.store.saveSettings(userId, { ...defaultSettings(input.timezone), interests: sanitizeInterests(input.interests) });
  await ctx.store.saveCharacter(userId, character);
  await ensureQuests(ctx, userId);
  return { ok: true, character };
}
var isOrphanTrack = (t, shapes) => shapes.size > 0 && !shapes.has(t.trackId);
var countActiveTracks = (tracks, shapes) => tracks.filter((t) => t.status === "active" && !isOrphanTrack(t, shapes)).length;
async function settleTracks(ctx, userId, today, tracks) {
  const { store } = ctx;
  const yesterday = addDays(today, -1);
  const demoted = [];
  const pending = tracks.filter((t) => t.status === "active" && (!t.lastCheckedDate || t.lastCheckedDate < yesterday));
  if (!pending.length) return { tracks, demoted };
  const rest = await store.listRestDays(userId);
  const checked = pending.map((t) => t.lastCheckedDate).filter((d) => !!d);
  const completed = checked.length ? await store.listInstances(userId, { period: "daily", status: "completed", from: addDays(checked.reduce((a, b) => a < b ? a : b), 1) }) : [];
  const out = [];
  for (const t of tracks) {
    if (!pending.includes(t)) {
      out.push(t);
      continue;
    }
    const next = t.lastCheckedDate ? applyMisses(
      t,
      today,
      rest,
      completed.filter((q) => q.trackId === t.trackId).map((q) => q.periodStart)
    ).state : { ...t, lastCheckedDate: today };
    if (next.rung !== t.rung || next.hits !== t.hits || next.lastCheckedDate !== t.lastCheckedDate) await store.saveTrack(userId, next);
    if (next.rung < t.rung) demoted.push({ trackId: t.trackId, from: t.rung, to: next.rung });
    out.push(next);
  }
  return { tracks: out, demoted };
}
async function ensureQuests(ctx, userId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return { created: [], expired: [], levelUps: [] };
  return ensureQuestsFor(env);
}
async function ensureQuestsFor(env) {
  const { ctx, userId, store } = { ...env, store: env.ctx.store };
  const result = { created: [], expired: [], levelUps: [] };
  let { character } = env;
  const { settings, today } = env;
  const nowIso = new Date(env.nowMs).toISOString();
  const allTemplates = await loadTemplates(env);
  const shapes = trackShapes(allTemplates);
  const stored = await store.listTracks(userId);
  const live = [];
  for (const t of stored) {
    if (isOrphanTrack(t, shapes)) await store.deleteTrack(userId, t.trackId);
    else live.push(t);
  }
  const settled = await settleTracks(ctx, userId, today, live);
  const tracks = settled.tracks;
  if (settled.demoted.length) result.demoted = settled.demoted;
  const open = await store.listInstances(userId, { status: ["proposed", "accepted"] });
  const customIds = new Set(allTemplates.filter((t) => t.source === "custom").map((t) => t.id));
  const masteries = masteriesFor(character);
  const pathAbility = pathAbilityFor(character);
  const events = [];
  for (const inst of open) {
    if (inst.periodEnd >= today) continue;
    let xp = 0;
    if (inst.status === "accepted") {
      xp = expiredPartialXp(inst, character.level, masteries, pathAbility);
      if (xp > 0) {
        const parts = splitXp(xp, inst.snapshot.ability, inst.snapshot.secondary);
        for (const p of parts) events.push(eventFor(ctx, { instanceId: inst.id, ability: p.ability, amount: p.amount, reason: "partial", custom: customIds.has(inst.templateId) }, inst.periodEnd));
        const applied = applyXpParts(character, parts);
        character = mergeChar(character, applied.character);
        result.levelUps.push(...applied.levelsGained);
      }
    }
    await store.updateInstance(userId, inst.id, { status: "expired", xpAwarded: xp });
    result.expired.push({ ...inst, status: "expired", xpAwarded: xp });
  }
  if (events.length) await store.insertXpEvents(userId, events);
  const templates = allTemplates;
  const [prefs, history] = await Promise.all([
    store.getPreferences(userId),
    store.listInstances(userId, { from: addDays(today, -400) })
  ]);
  const scores = abilityScores(character);
  const toInsert = [];
  const dayBounds = periodBounds("daily", today);
  for (const t of tracks) {
    if (t.status !== "active") continue;
    const shape = shapes.get(t.trackId);
    if (!shape) continue;
    if (history.some((i) => i.trackId === t.trackId && i.period === "daily" && i.periodStart === dayBounds.start)) continue;
    const rung = effectiveRung(shape, t, scores);
    const tpl = templates.find((x) => x.id === rungTemplateId(t.trackId, rung));
    if (!tpl) continue;
    toInsert.push(newInstance(ctx.uuid(), tpl, "daily", dayBounds.start, dayBounds.end, "proposed", nowIso, false, 0, { origin: "track", trackId: t.trackId, rung }));
  }
  const u = unlocksAt(character.level);
  const periods = ["daily", "weekly", "monthly"];
  if (u.epic) periods.push("epic");
  for (const period of periods) {
    const b = periodBounds(period, today);
    if (history.some((i) => i.period === period && i.periodStart === b.start && (i.origin ?? "draw") === "draw")) continue;
    const already = history.filter((i) => i.period === period && i.periodStart === b.start).map((i) => i.templateId);
    const base = {
      characterId: character.id,
      period,
      periodStart: b.start,
      level: character.level,
      scores,
      templates,
      preferences: prefs,
      lastDrawn: lastDrawnMap(history, period)
    };
    if (period === "daily") {
      const freeCount = Math.min(Math.max(Math.trunc(settings.dailyQuestCount) || 0, 0), MAX_FREE_QUESTS_PER_DAY);
      if (freeCount === 0) continue;
      const pinned = templates.filter(
        (t) => !t.trackId && t.isActive !== false && prefs[t.id]?.isPinned && !prefs[t.id]?.isExcluded && t.periods.includes("daily") && !already.includes(t.id) && tierUnlocked(t.difficulty, scores[t.ability], character.level)
      );
      for (const t of pinned) toInsert.push(newInstance(ctx.uuid(), t, period, b.start, b.end, "proposed", nowIso, true, prefs[t.id]?.tune));
      const more = drawQuests({
        ...base,
        count: freeCount,
        difficultyPlan: Array.from({ length: freeCount }, (_, i) => i % 2 === 0 ? "medium" : "high"),
        exclude: [...already, ...pinned.map((t) => t.id)],
        seedSuffix: "free",
        skipPinned: true
      });
      for (const t of more.picks) toInsert.push(newInstance(ctx.uuid(), t, period, b.start, b.end, "proposed", nowIso, true, prefs[t.id]?.tune));
      continue;
    }
    const count = questCountFor(period, character.level);
    if (count <= 0) continue;
    const main = drawQuests({ ...base, count, exclude: already });
    for (const t of main.picks) toInsert.push(newInstance(ctx.uuid(), t, period, b.start, b.end, "proposed", nowIso, false, prefs[t.id]?.tune));
  }
  if (toInsert.length) await store.insertInstances(userId, toInsert);
  result.created = toInsert;
  const streak = await streakInfo(store, userId, settings, today);
  character = { ...character, streakCurrent: streak.current, streakBest: Math.max(character.streakBest, streak.best) };
  await store.saveCharacter(userId, character);
  return result;
}
async function acceptQuest(ctx, userId, instanceId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail4("not-found");
  if (inst.status !== "proposed") return fail4("not-accepted");
  if (env.today > lastAcceptDate(inst.period, inst.periodStart, inst.periodEnd) || env.today > inst.periodEnd) {
    return fail4("too-late-to-accept", "Il est trop tard pour accepter cette qu\xEAte.");
  }
  const patch = { status: "accepted", acceptedAt: new Date(env.nowMs).toISOString() };
  await ctx.store.updateInstance(userId, instanceId, patch);
  return { ok: true, instance: { ...inst, ...patch } };
}
async function abandonQuest(ctx, userId, instanceId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail4("not-found");
  if (inst.status !== "proposed" && inst.status !== "accepted") return fail4("not-accepted");
  if (inst.origin === "track") return fail4("invalid", "Mets le parcours en pause plut\xF4t que d\u2019abandonner sa qu\xEAte.");
  await ctx.store.updateInstance(userId, instanceId, { status: "abandoned" });
  return { ok: true, instance: { ...inst, status: "abandoned" } };
}
async function updateProgress(ctx, userId, instanceId, patch) {
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail4("not-found");
  if (inst.status !== "accepted") return fail4("not-accepted");
  const next = {};
  if (patch.progress !== void 0) next.progress = Math.max(0, patch.progress);
  if (patch.stepsDone) next.stepsDone = patch.stepsDone;
  await ctx.store.updateInstance(userId, instanceId, next);
  return { ok: true, instance: { ...inst, ...next } };
}
async function startFromTemplate(env, t, period) {
  const { ctx, userId, character } = env;
  if (!PERIODS.includes(period) || !t.periods.includes(period)) return fail4("invalid", "Cette qu\xEAte ne se fait pas sur cette p\xE9riode.");
  if (period === "epic" && !unlocksAt(character.level).epic) return fail4("level-too-low", "Les qu\xEAtes \xE9piques s\u2019ouvrent au niveau 11.");
  const lock = questLock(t.difficulty, abilityScores(character)[t.ability], character.level);
  if (lock.locked) return fail4("locked", lock.reason);
  const b = periodBounds(period, env.today);
  if (env.today > lastAcceptDate(period, b.start, b.end)) return fail4("too-late-to-accept", "Il est trop tard pour d\xE9marrer cette qu\xEAte.");
  const inPeriod = await ctx.store.listInstances(userId, { period, from: b.start, to: b.start });
  const same = inPeriod.filter((i) => i.templateId === t.id);
  if (same.some((i) => i.status === "accepted")) return fail4("already-active", "Cette qu\xEAte est d\xE9j\xE0 en cours.");
  const nowIso = new Date(env.nowMs).toISOString();
  const proposed = same.find((i) => i.status === "proposed");
  if (proposed) {
    const patch = { status: "accepted", acceptedAt: nowIso };
    await ctx.store.updateInstance(userId, proposed.id, patch);
    return { ok: true, instance: { ...proposed, ...patch } };
  }
  if (same.filter((i) => i.status === "completed").length >= MAX_RUNS[period]) {
    return fail4("run-limit", period === "daily" ? "Tu as d\xE9j\xE0 refait cette qu\xEAte trois fois aujourd\u2019hui." : "Cette qu\xEAte a d\xE9j\xE0 \xE9t\xE9 faite le maximum de fois sur cette p\xE9riode.");
  }
  const openExtras = inPeriod.filter((i) => i.status === "accepted" && (i.free || (i.origin ?? "draw") !== "draw")).length;
  if (openExtras >= MAX_OPEN_EXTRAS[period]) return fail4("too-many-open", "Trop de qu\xEAtes en cours : termine-en une avant d\u2019en ajouter.");
  const run = same.reduce((n, i) => Math.max(n, i.run ?? 1), 0) + 1;
  const prefs = await ctx.store.getPreferences(userId);
  const inst = newInstance(ctx.uuid(), t, period, b.start, b.end, "accepted", nowIso, true, prefs[t.id]?.tune, { origin: same.length ? "redo" : "chosen", run });
  await ctx.store.insertInstances(userId, [inst]);
  return { ok: true, instance: inst };
}
async function startQuest(ctx, userId, input) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const t = (await loadTemplates(env, false)).find((x) => x.id === input.templateId && x.isActive !== false && !x.trackId);
  if (!t) return fail4("not-found");
  return startFromTemplate(env, t, input.period);
}
async function redoQuest(ctx, userId, instanceId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail4("not-found");
  if (inst.status === "proposed" || inst.status === "accepted") return fail4("already-active", "Cette qu\xEAte est d\xE9j\xE0 en cours.");
  if (inst.trackId) return fail4("invalid", "Une qu\xEAte de parcours ne se refait pas : elle revient chaque jour.");
  const t = (await loadTemplates(env, false)).find((x) => x.id === inst.templateId && x.isActive !== false && !x.trackId);
  if (!t) return fail4("not-found", "Cette qu\xEAte n\u2019existe plus dans le catalogue.");
  return startFromTemplate(env, t, inst.period);
}
async function rerollQuest(ctx, userId, instanceId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail4("not-found");
  if (inst.status === "completed" || inst.status === "expired" || inst.status === "abandoned") return fail4("not-accepted");
  if (inst.progress > 0) return fail4("invalid", "Une qu\xEAte d\xE9j\xE0 entam\xE9e ne peut pas \xEAtre relanc\xE9e.");
  if ((inst.origin ?? "draw") !== "draw") return fail4("invalid", "Seules les qu\xEAtes tir\xE9es peuvent \xEAtre relanc\xE9es.");
  const character = { ...env.character };
  if (character.rerollsDate !== env.today) {
    character.rerollsDate = env.today;
    character.rerollsUsed = 0;
  }
  let usedInspiration = false;
  if (character.rerollsUsed >= 1) {
    if (character.inspiration < 1) return fail4("no-reroll", "Plus de relance gratuite aujourd\u2019hui et aucune Inspiration.");
    character.inspiration -= 1;
    usedInspiration = true;
  }
  character.rerollsUsed += 1;
  const [templates, prefs, history, same] = await Promise.all([
    loadTemplates(env, false),
    ctx.store.getPreferences(userId),
    ctx.store.listInstances(userId, { from: addDays(env.today, -400) }),
    ctx.store.listInstances(userId, { period: inst.period, from: inst.periodStart, to: inst.periodStart })
  ]);
  const draw = drawQuests({
    characterId: character.id,
    period: inst.period,
    periodStart: inst.periodStart,
    count: 1,
    level: character.level,
    scores: abilityScores(character),
    templates,
    preferences: prefs,
    lastDrawn: lastDrawnMap(history, inst.period),
    exclude: same.map((i) => i.templateId),
    difficultyPlan: [inst.snapshot.difficulty],
    seedSuffix: `reroll-${character.rerollsUsed}-${ctx.uuid()}`,
    skipPinned: true
  });
  const t = draw.picks[0];
  if (!t) return fail4("invalid", "Aucune autre qu\xEAte disponible.");
  const fresh = newInstance(ctx.uuid(), t, inst.period, inst.periodStart, inst.periodEnd, inst.status, new Date(env.nowMs).toISOString(), inst.free, prefs[t.id]?.tune);
  await ctx.store.deleteInstance(userId, instanceId);
  await ctx.store.insertInstances(userId, [fresh]);
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, instance: fresh, usedInspiration };
}
async function tuneQuest(ctx, userId, instanceId, direction) {
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail4("not-found");
  if (inst.status !== "proposed" && inst.status !== "accepted") return fail4("not-accepted");
  if (inst.origin === "track") return fail4("invalid", "L\u2019exigence d\u2019une qu\xEAte de parcours suit ton \xE9chelon : elle ne se r\xE8gle pas.");
  const template = (await ctx.store.listTemplates(userId, { withRungs: false })).find((t) => t.id === inst.templateId);
  const base = template?.validation;
  if (!base || tunableTarget(base) === null) return fail4("invalid", "Cette qu\xEAte ne peut pas \xEAtre ajust\xE9e.");
  const next = nextTune(inst.snapshot.tune, base, direction);
  if (next === null) return fail4("invalid", direction === "easier" ? "Cette qu\xEAte est d\xE9j\xE0 au plus facile." : "Cette qu\xEAte est d\xE9j\xE0 au plus difficile.");
  const { tune: _t, baseTarget: _b, ...plain } = inst.snapshot;
  const snapshot2 = tunedSnapshot(plain, base, next);
  const target = tunableTarget(snapshot2.validation) ?? 0;
  const progress = Math.min(inst.progress, target);
  await ctx.store.updateInstance(userId, instanceId, { snapshot: snapshot2, progress });
  const prefs = await ctx.store.getPreferences(userId);
  await ctx.store.savePreference(userId, { ...prefs[inst.templateId] ?? { templateId: inst.templateId }, tune: next });
  return { ok: true, instance: { ...inst, snapshot: snapshot2, progress } };
}
async function completeQuestAction(ctx, userId, req) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const { store } = ctx;
  const inst = await store.getInstance(userId, req.instanceId);
  if (!inst) return fail4("not-found");
  if (inst.status === "completed") {
    const streak2 = await streakInfo(store, userId, env.settings, env.today);
    return {
      ok: true,
      data: {
        xpAwarded: inst.xpAwarded,
        breakdown: { base: 0, multiplier: 0, mastery: 0, affinity: 0, doubled: inst.inspirationUsed, total: inst.xpAwarded },
        duplicate: true,
        character: env.character,
        levelUps: [],
        abilityUps: [],
        achievements: [],
        pendingImprovements: pendingImprovements(env.character.level, env.character.improvementsChosen),
        pendingPath: pendingPath(env.character.level, env.character.pathId),
        inspirationGained: false,
        inspirationOverflow: false,
        streak: streak2.current
      }
    };
  }
  let completedMs = env.nowMs;
  const offline = !!req.clientCompletedAt;
  if (offline) {
    const clientMs = Date.parse(req.clientCompletedAt);
    if (Number.isNaN(clientMs)) return fail4("invalid");
    if (env.nowMs - clientMs > OFFLINE_MAX_DELAY_MS) return fail4("too-late", "Cette validation hors ligne date de plus de 72 h et ne peut plus \xEAtre enregistr\xE9e.");
    completedMs = Math.min(clientMs, env.nowMs);
  }
  const completedDay = gameDate(completedMs, env.settings.timezone, env.settings.resetHour);
  if (!isDateInRange(completedDay, inst.periodStart, inst.periodEnd)) {
    return fail4("out-of-period", "Cette qu\xEAte n\u2019est plus valable \xE0 cette date.");
  }
  const statusOk = inst.status === "accepted" || inst.status === "proposed" && inst.origin === "track" || offline && inst.status === "expired";
  if (!statusOk) return fail4("not-accepted");
  const trackBefore = inst.trackId ? (await store.listTracks(userId)).find((t) => t.trackId === inst.trackId) : void 0;
  if (offline && inst.status === "expired" && trackBefore?.status === "active" && trackBefore.lastCheckedDate && inst.periodStart <= trackBefore.lastCheckedDate) {
    const startMs = Date.parse(trackBefore.startedAt);
    const startDay = Number.isNaN(startMs) ? null : gameDate(startMs, env.settings.timezone, env.settings.resetHour);
    if (inst.periodStart !== startDay) {
      return fail4("too-late", "Ce jour est d\xE9j\xE0 r\xE9gl\xE9 pour ce parcours : cette validation hors ligne ne peut plus \xEAtre enregistr\xE9e.");
    }
  }
  const siblings = await store.listInstances(userId, { period: inst.period, from: inst.periodStart, to: inst.periodStart });
  const repeat = siblings.filter((i) => i.templateId === inst.templateId && i.id !== inst.id && i.status === "completed").length;
  const masteries = masteriesFor(env.character);
  const check = completeQuest({
    character: env.character,
    masteries,
    pathAbility: pathAbilityFor(env.character),
    instance: { ...inst, status: "accepted" },
    useInspiration: req.useInspiration,
    repeat,
    progress: req.progress,
    stepsDone: req.stepsDone,
    journalText: req.journalText
  });
  if (!check.ok) return fail4(check.error);
  const res = check.result;
  const completedAtIso = new Date(completedMs).toISOString();
  const levelUps = [...res.levelsGained];
  const abilityUps = [...res.abilityUps];
  let character = mergeChar(env.character, res.character);
  const templates = await loadTemplates(env, !!inst.trackId);
  const custom = templates.some((t) => t.id === inst.templateId && t.source === "custom");
  const events = res.parts.map(
    (p) => eventFor(ctx, { instanceId: inst.id, ability: p.ability, amount: p.amount, reason: "quest", custom }, completedDay)
  );
  let trackUpdate;
  let snapshot2 = inst.snapshot;
  if (trackBefore) {
    const maxRung = trackShapes(templates).get(inst.trackId)?.rungs.length ?? TRACK_RUNGS;
    const after = advanceOnCompletion(trackBefore, inst.periodStart, maxRung);
    trackUpdate = { state: after, promoted: after.rung > trackBefore.rung };
    if (after !== trackBefore) {
      const { rung, hits, bestRung, lastDoneDate } = trackBefore;
      snapshot2 = { ...inst.snapshot, trackBefore: { rung, hits, bestRung, lastDoneDate } };
    }
  }
  await store.updateInstance(userId, inst.id, {
    status: "completed",
    ...snapshot2 !== inst.snapshot ? { snapshot: snapshot2 } : {},
    progress: req.progress ?? inst.progress,
    stepsDone: req.stepsDone ?? inst.stepsDone,
    xpAwarded: res.xpAwarded,
    inspirationUsed: res.inspirationSpent,
    completedAt: completedAtIso,
    ...inst.acceptedAt ? {} : { acceptedAt: completedAtIso }
  });
  if (req.journalText?.trim()) {
    await store.saveJournal(userId, { id: ctx.uuid(), instanceId: inst.id, text: req.journalText.trim(), createdAt: completedAtIso });
  }
  await store.insertXpEvents(userId, events);
  if (trackBefore && trackUpdate && trackUpdate.state !== trackBefore) await store.saveTrack(userId, trackUpdate.state);
  const prevStreak = character.streakCurrent;
  const streak = await streakInfo(store, userId, env.settings, env.today);
  let inspirationGained = false;
  let inspirationOverflow = false;
  character.streakCurrent = streak.current;
  character.streakBest = Math.max(character.streakBest, streak.best);
  if (inst.period === "daily") {
    const g = inspirationAfterStreak(prevStreak, streak.current, character.inspiration);
    character.inspiration = g.inspiration;
    inspirationGained = g.gained;
    inspirationOverflow = g.overflow;
  }
  const granted = inst.period === "daily" ? await grantQuestChests({
    store,
    userId,
    uuid: ctx.uuid,
    nowIso: completedAtIso,
    instanceId: inst.id,
    completedDay,
    isTrackQuest: inst.origin === "track",
    isDaily: true,
    streak: streak.current,
    prevStreak,
    promotion: trackUpdate?.promoted ? { trackId: inst.trackId, rung: trackUpdate.state.rung } : void 0,
    character
  }) : null;
  if (granted) character = granted.character;
  await store.saveCharacter(userId, character);
  const unlockedNow = [];
  const already = new Set((await store.listUnlocked(userId)).map((u) => u.achievementId));
  for (let pass = 0; pass < 3; pass++) {
    const stats = await computePlayerStats(store, userId, character, env.settings, templates);
    const fresh = newlyUnlocked(ACHIEVEMENTS, stats, already);
    if (!fresh.length) break;
    const bonusEvents = [];
    for (const a of fresh) {
      already.add(a.id);
      await store.unlockAchievement(userId, a.id, completedAtIso);
      unlockedNow.push({ id: a.id, name: a.name, description: a.description, xpBonus: a.xpBonus, titleUnlocked: a.titleUnlocked ?? null });
      if (a.xpBonus > 0) {
        bonusEvents.push(eventFor(ctx, { instanceId: inst.id, ability: inst.snapshot.ability, amount: a.xpBonus, reason: "achievement" }, completedDay));
        const applied = applyXp(character, inst.snapshot.ability, a.xpBonus);
        character = mergeChar(character, applied.character);
        levelUps.push(...applied.levelsGained);
        abilityUps.push(...applied.abilityUps);
      }
      if (a.titleUnlocked && !character.titleEquipped) character.titleEquipped = a.titleUnlocked;
    }
    if (bonusEvents.length) await store.insertXpEvents(userId, bonusEvents);
    await store.saveCharacter(userId, character);
  }
  let postId;
  if (req.share) {
    postId = await store.createPost(userId, {
      type: "quest",
      instanceId: inst.id,
      text: req.share.text.slice(0, 500),
      visibility: req.share.visibility,
      mediaPaths: req.share.mediaPaths.slice(0, 4),
      payload: { xp: res.xpAwarded }
    });
  }
  const autos = [];
  if (env.settings.autoShare.level && levelUps.length) {
    const top = Math.max(...levelUps);
    autos.push({ type: "level_up", text: "", visibility: env.settings.defaultVisibility, mediaPaths: [], payload: { level: top } });
  }
  if (env.settings.autoShare.achievement) {
    for (const a of unlockedNow) {
      autos.push({ type: "achievement", text: "", visibility: env.settings.defaultVisibility, mediaPaths: [], payload: { id: a.id, name: a.name, description: a.description } });
    }
  }
  if (env.settings.autoShare.streak && inst.period === "daily" && STREAK_POSTS.includes(streak.current) && streak.current > prevStreak) {
    autos.push({ type: "streak", text: "", visibility: env.settings.defaultVisibility, mediaPaths: [], payload: { days: streak.current } });
  }
  for (const d of autos) await store.createPost(userId, d);
  const raidHit = await autoRaidHit(ctx, userId);
  if (levelUps.length) await syncHeroPower(ctx, userId).catch((e) => console.error("sync power", e));
  return {
    ok: true,
    data: {
      xpAwarded: res.xpAwarded,
      breakdown: res.breakdown,
      duplicate: false,
      character,
      levelUps: [...new Set(levelUps)].sort((a, b) => a - b),
      abilityUps,
      achievements: unlockedNow,
      pendingImprovements: pendingImprovements(character.level, character.improvementsChosen),
      pendingPath: pendingPath(character.level, character.pathId),
      inspirationGained,
      inspirationOverflow,
      streak: streak.current,
      postId,
      ...granted?.chests.length ? { chests: granted.chests, keysGained: granted.keysGained } : {},
      ...raidHit ? { raid: raidHit } : {},
      ...res.balance.length ? { balance: res.balance } : {},
      ...trackUpdate ? { track: trackUpdate.state, trackPromoted: trackUpdate.promoted } : {}
    }
  };
}
async function undoQuest(ctx, userId, instanceId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail4("not-found");
  if (inst.status !== "completed" || !canUndo(inst.completedAt, env.nowMs)) return fail4("cannot-undo", "Cette qu\xEAte ne peut plus \xEAtre annul\xE9e (24 h maximum).");
  const paid = emptyAbilityRecord(0);
  let hasEvents = false;
  for (const e of await ctx.store.listXpEvents(userId)) {
    if (e.instanceId !== instanceId || e.reason !== "quest" && e.reason !== "undo") continue;
    paid[e.ability] += e.amount;
    hasEvents = true;
  }
  const undoParts = hasEvents ? ABILITIES.filter((a) => paid[a] !== 0).map((a) => ({ ability: a, amount: paid[a] })) : splitXp(inst.xpAwarded, inst.snapshot.ability, inst.snapshot.secondary);
  await ctx.store.insertXpEvents(
    userId,
    undoParts.map((p) => eventFor(ctx, { instanceId, ability: p.ability, amount: -p.amount, reason: "undo" }, env.today))
  );
  const { trackBefore: counted, ...plainSnapshot } = inst.snapshot;
  const patch = { status: "accepted", xpAwarded: 0, inspirationUsed: false, completedAt: null, ...counted ? { snapshot: plainSnapshot } : {} };
  await ctx.store.updateInstance(userId, instanceId, patch);
  await ctx.store.detachPostsFromInstance(userId, instanceId);
  if (inst.trackId && counted) {
    const track = (await ctx.store.listTracks(userId)).find((t) => t.trackId === inst.trackId);
    if (track) {
      const maxRung = trackShapes(await loadTemplates(env)).get(inst.trackId)?.rungs.length ?? TRACK_RUNGS;
      const expected = advanceOnCompletion({ ...track, ...counted, status: "active" }, inst.periodStart, maxRung);
      const untouched = track.rung === expected.rung && track.hits === expected.hits && track.bestRung === expected.bestRung && track.lastDoneDate === expected.lastDoneDate;
      if (untouched) {
        await ctx.store.saveTrack(userId, { ...track, ...counted });
      } else {
        const others = await ctx.store.listInstances(userId, { period: "daily", status: "completed", from: addDays(env.today, -60) });
        const previous = others.filter((q) => q.trackId === inst.trackId && q.id !== inst.id).map((q) => q.periodStart).sort().pop() ?? null;
        await ctx.store.saveTrack(userId, revertCompletion(track, inst.periodStart, previous));
      }
    }
  }
  let character = env.character;
  const revoked = await revokeQuestChests(ctx.store, userId, instanceId);
  if (revoked.keysLost) character = { ...character, keys: Math.max(0, character.keys - revoked.keysLost) };
  if (inst.inspirationUsed) character = { ...character, inspiration: Math.min(character.inspiration + 1, MAX_INSPIRATION) };
  if (character !== env.character) await ctx.store.saveCharacter(userId, character);
  const recomputed = await recomputeCharacter(ctx, userId) ?? character;
  return { ok: true, character: recomputed, instance: { ...inst, ...patch } };
}
async function startTrack(ctx, userId, input) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const shapes = trackShapes(await loadTemplates(env));
  if (!shapes.has(input.trackId)) return fail4("not-found", "Parcours inconnu.");
  const refusal = (tracks) => tracks.some((t) => t.trackId === input.trackId) ? fail4("already-active", "Ce parcours est d\xE9j\xE0 suivi.") : countActiveTracks(tracks, shapes) >= MAX_ACTIVE_TRACKS ? fail4("too-many-open", `Tu peux suivre ${MAX_ACTIVE_TRACKS} parcours \xE0 la fois : mets-en un en pause ou arr\xEAte-en un.`) : null;
  const first = refusal(await ctx.store.listTracks(userId));
  if (first) return first;
  const track = {
    trackId: input.trackId,
    status: "active",
    rung: 1,
    hits: 0,
    lastDoneDate: null,
    lastCheckedDate: env.today,
    bestRung: 1,
    startedAt: new Date(env.nowMs).toISOString()
  };
  const again = refusal(await ctx.store.listTracks(userId));
  if (again) return again;
  await ctx.store.saveTrack(userId, track);
  await ensureQuestsFor(env);
  return { ok: true, track };
}
async function setTrackPaused(ctx, userId, input) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const tracks = await ctx.store.listTracks(userId);
  const current = tracks.find((t) => t.trackId === input.trackId);
  if (!current) return fail4("not-found", "Parcours inconnu.");
  if (input.paused === (current.status === "paused")) return { ok: true, track: current };
  const resumeRefused = async (list) => {
    if (input.paused) return null;
    return countActiveTracks(list, trackShapes(await loadTemplates(env))) >= MAX_ACTIVE_TRACKS ? fail4("too-many-open", `Tu peux suivre ${MAX_ACTIVE_TRACKS} parcours \xE0 la fois : mets-en un en pause ou arr\xEAte-en un.`) : null;
  };
  const first = await resumeRefused(tracks);
  if (first) return first;
  const fresh = input.paused ? tracks : await ctx.store.listTracks(userId);
  const again = await resumeRefused(fresh);
  if (again) return again;
  const track = input.paused ? { ...current, status: "paused" } : { ...current, status: "active", lastCheckedDate: env.today };
  await ctx.store.saveTrack(userId, track);
  if (!input.paused) await ensureQuestsFor(env);
  return { ok: true, track };
}
async function stopTrack(ctx, userId, input) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  if (!(await ctx.store.listTracks(userId)).some((t) => t.trackId === input.trackId)) return fail4("not-found", "Parcours inconnu.");
  await ctx.store.deleteTrack(userId, input.trackId);
  const stale = await ctx.store.listInstances(userId, { period: "daily", status: "proposed", from: env.today, to: env.today });
  for (const q of stale) if (q.origin === "track" && q.trackId === input.trackId) await ctx.store.deleteInstance(userId, q.id);
  return { ok: true, trackId: input.trackId };
}
async function choosePath(ctx, userId, pathId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  if (env.character.level < PATH_LEVEL) return fail4("level-too-low");
  if (env.character.pathId) return fail4("nothing-pending");
  const cls = CLASSES3.find((c) => c.id === env.character.classId);
  if (!cls?.paths.some((p) => p.id === pathId)) return fail4("invalid");
  const character = { ...env.character, pathId };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, character };
}
async function chooseImprovement(ctx, userId, choice) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const c = env.character;
  if (pendingImprovements(c.level, c.improvementsChosen) < 1) return fail4("nothing-pending");
  const add = emptyAbilityRecord(0);
  if ("plus2" in choice) add[choice.plus2] += 2;
  else {
    const [a, b] = choice.plus1;
    if (a === b) return fail4("invalid", "Choisis deux caract\xE9ristiques diff\xE9rentes.");
    add[a] += 1;
    add[b] += 1;
  }
  const scores = abilityScores(c);
  for (const a of ABILITIES) {
    if (add[a] && scores[a] + add[a] > SOFT_CAP_SCORE) return fail4("invalid", "Une caract\xE9ristique ne peut pas d\xE9passer 20 par am\xE9lioration.");
  }
  const improvements = { ...c.improvements };
  for (const a of ABILITIES) improvements[a] += add[a];
  const character = { ...c, improvements, improvementsChosen: c.improvementsChosen + 1 };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, character };
}
async function declareRest(ctx, userId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  const rest = await ctx.store.listRestDays(userId);
  if (rest.includes(env.today) || !canDeclareRest(rest, env.today)) return fail4("rest-unavailable", "Tu as d\xE9j\xE0 utilis\xE9 ton jour de repos cette semaine.");
  await ctx.store.addRestDay(userId, env.today);
  const streak = await streakInfo(ctx.store, userId, env.settings, env.today);
  await ctx.store.saveCharacter(userId, { ...env.character, streakCurrent: streak.current });
  return { ok: true, day: env.today };
}
async function equipTitle(ctx, userId, title) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail4("no-character");
  if (title) {
    const unlocked = new Set((await ctx.store.listUnlocked(userId)).map((u) => u.achievementId));
    const owned = ACHIEVEMENTS.some((a) => unlocked.has(a.id) && a.titleUnlocked === title);
    if (!owned) return fail4("forbidden", "Ce titre n\u2019est pas encore d\xE9bloqu\xE9.");
  }
  const character = { ...env.character, titleEquipped: title };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, character };
}
function canForge(level) {
  return level >= FORGE_LEVEL;
}
function startOfWeek(date) {
  return startOfIsoWeek(date);
}

// packages/engine/src/server/memory-store.ts
var emptyUserData = () => ({
  character: null,
  settings: defaultSettings(),
  customTemplates: [],
  preferences: {},
  instances: [],
  xpEvents: [],
  unlocked: [],
  restDays: [],
  journal: [],
  tracks: [],
  items: [],
  chests: [],
  dungeons: [],
  seasonScores: [],
  seasonResults: []
});
var asArray = (v) => v === void 0 ? void 0 : Array.isArray(v) ? v : [v];
var MemoryStore = class {
  constructor(catalog = []) {
    this.catalog = catalog;
  }
  users = /* @__PURE__ */ new Map();
  posts = [];
  /** Appelé après chaque écriture (persistance du mode local) */
  onChange;
  /** Raids d'amis : équipes, membres, dégâts, encouragements (partagés entre joueurs, jamais persistés en mode local) */
  raidTeams = [];
  raidMembers = [];
  raidDamage = [];
  raidEncouragements = [];
  /** Amitiés acceptées, sous la forme « a|b » (a < b) ; réservé aux tests (l'app locale n'a pas d'amis) */
  friendPairs = /* @__PURE__ */ new Set();
  /** Notifications créées (tests) */
  notifications = [];
  socialCountsFn;
  data(userId) {
    let d = this.users.get(userId);
    if (!d) {
      d = emptyUserData();
      this.users.set(userId, d);
    }
    d.tracks ??= [];
    d.items ??= [];
    d.chests ??= [];
    d.dungeons ??= [];
    d.seasonScores ??= [];
    d.seasonResults ??= [];
    return d;
  }
  touch() {
    this.onChange?.();
  }
  snapshot() {
    return { users: Object.fromEntries(this.users), posts: this.posts };
  }
  restore(s) {
    this.users = new Map(Object.entries(s.users ?? {}));
    this.posts = s.posts ?? [];
  }
  async getCharacter(userId) {
    const c = this.data(userId).character;
    return c ? structuredClone({ ...emptyAdventureFields(), ...c }) : null;
  }
  async saveCharacter(userId, c) {
    this.data(userId).character = structuredClone(c);
    this.touch();
  }
  async getSettings(userId) {
    return structuredClone(this.data(userId).settings);
  }
  async saveSettings(userId, s) {
    this.data(userId).settings = structuredClone(s);
    this.touch();
  }
  async listTemplates(userId, opts = {}) {
    const all = [...this.catalog, ...this.data(userId).customTemplates];
    return opts.withRungs === false ? all.filter((t) => !t.trackId) : all;
  }
  async getPreferences(userId) {
    return structuredClone(this.data(userId).preferences);
  }
  async saveTemplate(userId, t) {
    const d = this.data(userId);
    const i = d.customTemplates.findIndex((x) => x.id === t.id);
    if (i >= 0) d.customTemplates[i] = t;
    else d.customTemplates.push(t);
    this.touch();
  }
  async savePreference(userId, p) {
    this.data(userId).preferences[p.templateId] = p;
    this.touch();
  }
  async listInstances(userId, f = {}) {
    const statuses = asArray(f.status);
    return structuredClone(
      this.data(userId).instances.filter(
        (i) => (!f.period || i.period === f.period) && (!statuses || statuses.includes(i.status)) && (!f.from || i.periodStart >= f.from) && (!f.to || i.periodStart <= f.to) && (!f.covers || i.periodStart <= f.covers && i.periodEnd >= f.covers)
      )
    );
  }
  async getInstance(userId, id) {
    const i = this.data(userId).instances.find((x) => x.id === id);
    return i ? structuredClone(i) : null;
  }
  async insertInstances(userId, instances) {
    this.data(userId).instances.push(...structuredClone(instances));
    this.touch();
  }
  async updateInstance(userId, id, patch) {
    const i = this.data(userId).instances.find((x) => x.id === id);
    if (i) Object.assign(i, structuredClone(patch));
    this.touch();
  }
  async deleteInstance(userId, id) {
    const d = this.data(userId);
    d.instances = d.instances.filter((i) => i.id !== id);
    this.touch();
  }
  async insertXpEvents(userId, events) {
    this.data(userId).xpEvents.push(...structuredClone(events));
    this.touch();
  }
  async listXpEvents(userId, since) {
    return structuredClone(this.data(userId).xpEvents.filter((e) => !since || e.gameDate >= since));
  }
  async listUnlocked(userId) {
    return structuredClone(this.data(userId).unlocked);
  }
  async unlockAchievement(userId, achievementId, at) {
    const d = this.data(userId);
    if (!d.unlocked.some((u) => u.achievementId === achievementId)) d.unlocked.push({ achievementId, unlockedAt: at });
    this.touch();
  }
  async listRestDays(userId) {
    return [...this.data(userId).restDays];
  }
  async addRestDay(userId, day) {
    const d = this.data(userId);
    if (!d.restDays.includes(day)) d.restDays.push(day);
    this.touch();
  }
  async saveJournal(userId, entry) {
    this.data(userId).journal.push(entry);
    this.touch();
  }
  async countJournal(userId) {
    return this.data(userId).journal.length;
  }
  async listJournal(userId) {
    return structuredClone(this.data(userId).journal);
  }
  async listTracks(userId) {
    return structuredClone(this.data(userId).tracks);
  }
  async saveTrack(userId, t) {
    const list = this.data(userId).tracks;
    const i = list.findIndex((x) => x.trackId === t.trackId);
    if (i >= 0) list[i] = structuredClone(t);
    else list.push(structuredClone(t));
    this.touch();
  }
  async deleteTrack(userId, trackId) {
    const d = this.data(userId);
    d.tracks = d.tracks.filter((t) => t.trackId !== trackId);
    this.touch();
  }
  async listItems(userId) {
    return structuredClone(this.data(userId).items);
  }
  async insertItems(userId, items) {
    this.data(userId).items.push(...structuredClone(items));
    this.touch();
  }
  async updateItem(userId, id, patch) {
    const it = this.data(userId).items.find((x) => x.id === id);
    if (it) Object.assign(it, patch);
    this.touch();
  }
  async deleteItems(userId, ids) {
    const d = this.data(userId);
    d.items = d.items.filter((i) => !ids.includes(i.id));
    this.touch();
  }
  async listChests(userId, filter = {}) {
    return structuredClone(
      this.data(userId).chests.filter((c) => filter.opened === void 0 || c.openedAt !== null === filter.opened)
    );
  }
  async insertChest(userId, chest) {
    const list = this.data(userId).chests;
    if (list.some((c) => c.source === chest.source && c.sourceKey === chest.sourceKey)) return false;
    list.push(structuredClone(chest));
    this.touch();
    return true;
  }
  async markChestOpened(userId, id, at) {
    const c = this.data(userId).chests.find((x) => x.id === id);
    if (!c || c.openedAt) return false;
    c.openedAt = at;
    this.touch();
    return true;
  }
  async deleteChests(userId, ids) {
    const d = this.data(userId);
    d.chests = d.chests.filter((c) => !ids.includes(c.id));
    this.touch();
  }
  async listDungeonProgress(userId) {
    return structuredClone(this.data(userId).dungeons);
  }
  async saveDungeonProgress(userId, p) {
    const list = this.data(userId).dungeons;
    const i = list.findIndex((x) => x.dungeonId === p.dungeonId);
    if (i >= 0) list[i] = structuredClone(p);
    else list.push(structuredClone(p));
    this.touch();
  }
  // ───── Raids d'amis
  addFriendship(a, b) {
    this.friendPairs.add([a, b].sort().join("|"));
  }
  async areFriends(a, b) {
    return a !== b && this.friendPairs.has([a, b].sort().join("|"));
  }
  async getRaidTeam(teamId) {
    const t = this.raidTeams.find((x) => x.id === teamId);
    return t ? structuredClone(t) : null;
  }
  async listRaidMemberships(userId, since) {
    return structuredClone(this.raidMembers.filter((m) => m.profileId === userId && m.weekStart >= since));
  }
  async listRaidMembers(teamId) {
    return structuredClone(this.raidMembers.filter((m) => m.teamId === teamId));
  }
  joinedElsewhere(m) {
    return this.raidMembers.some((x) => x.status === "joined" && x.profileId === m.profileId && x.weekStart === m.weekStart && x.teamId !== m.teamId);
  }
  joinedCount(teamId, except) {
    return this.raidMembers.filter((x) => x.teamId === teamId && x.status === "joined" && x.profileId !== except).length;
  }
  async insertRaidTeam(team, leader) {
    if (this.joinedElsewhere(leader)) return false;
    this.raidTeams.push(structuredClone(team));
    this.raidMembers.push(structuredClone(leader));
    this.touch();
    return true;
  }
  async insertRaidMember(m) {
    const team = this.raidTeams.find((t) => t.id === m.teamId);
    if (!team || team.weekStart !== m.weekStart) return "conflict";
    if (this.raidMembers.some((x) => x.teamId === m.teamId && x.profileId === m.profileId)) return "duplicate";
    if (m.profileId !== team.leaderId && !await this.areFriends(team.leaderId, m.profileId)) return "not-friend";
    if (m.status === "joined") {
      if (this.joinedElsewhere(m)) return "conflict";
      if (this.joinedCount(m.teamId) >= RAID_MAX_MEMBERS) return "full";
    }
    this.raidMembers.push(structuredClone(m));
    this.touch();
    return "ok";
  }
  async joinRaidMember(teamId, profileId, at) {
    const m = this.raidMembers.find((x) => x.teamId === teamId && x.profileId === profileId);
    if (!m) return "conflict";
    if (m.status === "joined") return "duplicate";
    if (this.joinedElsewhere(m)) return "conflict";
    if (this.joinedCount(teamId) >= RAID_MAX_MEMBERS) return "full";
    m.status = "joined";
    m.joinedAt = at;
    this.touch();
    return "ok";
  }
  async deleteRaidMember(teamId, profileId) {
    this.raidMembers = this.raidMembers.filter((m) => !(m.teamId === teamId && m.profileId === profileId));
    this.raidDamage = this.raidDamage.filter((d) => !(d.teamId === teamId && d.profileId === profileId));
    this.raidEncouragements = this.raidEncouragements.filter((e) => !(e.teamId === teamId && (e.fromId === profileId || e.toId === profileId)));
    this.touch();
  }
  async deleteRaidInvites(profileId, weekStart) {
    this.raidMembers = this.raidMembers.filter((m) => !(m.profileId === profileId && m.weekStart === weekStart && m.status === "invited"));
    this.touch();
  }
  async setRaidLeader(teamId, leaderId) {
    const t = this.raidTeams.find((x) => x.id === teamId);
    if (t) t.leaderId = leaderId;
    this.touch();
  }
  async deleteRaidTeam(teamId) {
    this.raidTeams = this.raidTeams.filter((t) => t.id !== teamId);
    this.raidMembers = this.raidMembers.filter((m) => m.teamId !== teamId);
    this.raidDamage = this.raidDamage.filter((d) => d.teamId !== teamId);
    this.raidEncouragements = this.raidEncouragements.filter((e) => e.teamId !== teamId);
    this.touch();
  }
  async resolveRaidTeam(teamId, r) {
    const t = this.raidTeams.find((x) => x.id === teamId);
    if (!t || t.resolvedAt) return false;
    Object.assign(t, { resolvedAt: r.at, outcome: r.outcome, maxHp: r.maxHp, totalDamage: r.totalDamage, victoryDay: r.victoryDay });
    this.touch();
    return true;
  }
  async listRaidDamage(teamId) {
    return structuredClone(this.raidDamage.filter((d) => d.teamId === teamId));
  }
  async insertRaidDamage(d) {
    if (this.raidDamage.some((x) => x.profileId === d.profileId && x.gameDate === d.gameDate)) return false;
    this.raidDamage.push(structuredClone(d));
    this.touch();
    return true;
  }
  async updateRaidDamage(teamId, profileId, gameDate2, patch) {
    const d = this.raidDamage.find((x) => x.teamId === teamId && x.profileId === profileId && x.gameDate === gameDate2);
    if (d) Object.assign(d, patch);
    this.touch();
  }
  async listRaidEncouragements(teamId, gameDate2) {
    return structuredClone(this.raidEncouragements.filter((e) => e.teamId === teamId && e.gameDate === gameDate2));
  }
  async insertRaidEncouragement(e) {
    if (this.raidEncouragements.some((x) => x.teamId === e.teamId && x.fromId === e.fromId && x.toId === e.toId && x.gameDate === e.gameDate)) return false;
    this.raidEncouragements.push(structuredClone(e));
    this.touch();
    return true;
  }
  async notify(userId, type, payload) {
    this.notifications.push({ userId, type, payload: structuredClone(payload) });
  }
  // ───── Saisons
  async upsertSeasonScore(userId, seasonKey, power, day) {
    const list = this.data(userId).seasonScores;
    const cur = list.find((x) => x.seasonKey === seasonKey);
    if (cur) {
      cur.power = power;
      if (day > cur.lastDay) cur.lastDay = day;
      if (day < cur.firstDay) cur.firstDay = day;
    } else list.push({ seasonKey, power, firstDay: day, lastDay: day });
    this.touch();
  }
  async listSeasonScores(userId) {
    return structuredClone(this.data(userId).seasonScores);
  }
  async seasonRanking(userId, seasonKey) {
    const optedIn = (id) => this.data(id).settings.leaderboardOptIn !== false;
    if (!optedIn(userId)) return [];
    const rows = [];
    for (const id of this.users.keys()) {
      if (id !== userId && (!await this.areFriends(userId, id) || !optedIn(id))) continue;
      const score = this.data(id).seasonScores.find((x) => x.seasonKey === seasonKey);
      if (score) rows.push({ profileId: id, power: score.power });
    }
    return rows;
  }
  async listSeasonResults(userId) {
    return structuredClone(this.data(userId).seasonResults);
  }
  async insertSeasonResult(userId, r) {
    const list = this.data(userId).seasonResults;
    if (list.some((x) => x.seasonKey === r.seasonKey)) return false;
    list.push(structuredClone(r));
    this.touch();
    return true;
  }
  async createPost(userId, draft) {
    const id = `post-${this.posts.length + 1}-${Math.random().toString(36).slice(2, 8)}`;
    this.posts.push({ ...structuredClone(draft), id, authorId: userId, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    this.touch();
    return id;
  }
  async detachPostsFromInstance(userId, instanceId) {
    for (const p of this.posts) {
      if (p.authorId === userId && p.instanceId === instanceId) {
        p.instanceId = null;
        p.payload = { ...p.payload ?? {}, xp: void 0, questDetached: true };
      }
    }
    this.touch();
  }
  async socialCounts(userId) {
    const own = this.posts.filter((p) => p.authorId === userId && !p.deletedAt && (p.type === "quest" || p.type === "photo")).length;
    return this.socialCountsFn?.(userId) ?? { posts: own, friends: 0, reactionsGiven: 0 };
  }
};

// packages/engine/src/server/supabase-store.ts
var fail5 = (error, ctx) => {
  if (error) throw new Error(`${ctx}: ${error.message ?? error}`);
};
var PAGE = 1e3;
async function pageAll(build, ctx) {
  const out = [];
  for (let from = 0; from < 2e5; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    fail5(error, ctx);
    out.push(...data ?? []);
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}
function memberWrite(error, ctx) {
  if (!error) return "ok";
  const msg = String(error.message ?? "");
  if (/raid_full/.test(msg)) return "full";
  if (/raid_not_friend/.test(msg)) return "not-friend";
  if (/one_team_per_week/.test(msg)) return "conflict";
  if (error.code === "23505" || /duplicate key|unique/i.test(msg)) return "duplicate";
  if (error.code === "23503") return "conflict";
  throw new Error(`${ctx}: ${msg}`);
}
var toTeam = (r) => ({
  id: r.id,
  weekStart: r.week_start,
  leaderId: r.leader_id,
  createdAt: r.created_at,
  resolvedAt: r.resolved_at ?? null,
  outcome: r.outcome ?? null,
  maxHp: r.max_hp ?? null,
  totalDamage: r.total_damage ?? null,
  victoryDay: r.victory_day ?? null
});
var toMember = (r) => ({
  teamId: r.team_id,
  profileId: r.profile_id,
  weekStart: r.week_start,
  status: r.status,
  invitedBy: r.invited_by ?? "",
  createdAt: r.created_at,
  joinedAt: r.joined_at ?? null
});
var fromMember = (m) => ({
  team_id: m.teamId,
  profile_id: m.profileId,
  week_start: m.weekStart,
  status: m.status,
  invited_by: m.invitedBy,
  created_at: m.createdAt,
  joined_at: m.joinedAt ?? null
});
var SupabaseStore = class {
  constructor(db) {
    this.db = db;
  }
  // ───── Personnage et réglages
  async getCharacter(userId) {
    const { data, error } = await this.db.from("characters").select("*").eq("profile_id", userId).maybeSingle();
    fail5(error, "characters.select");
    if (!data) return null;
    const { data: s } = await this.db.from("settings").select("oath").eq("profile_id", userId).maybeSingle();
    return {
      id: data.id,
      profileId: data.profile_id,
      name: data.name,
      classId: data.class_id,
      pathId: data.path_id,
      portraitId: data.portrait_id,
      frameColor: data.frame_color,
      motto: data.motto,
      oath: s?.oath ?? "",
      titleEquipped: data.title_equipped,
      baseScores: data.base_scores,
      improvements: data.improvements,
      improvementsChosen: data.improvements_chosen,
      totalXp: data.total_xp,
      abilityXp: data.ability_xp,
      level: data.level,
      streakCurrent: data.streak_current,
      streakBest: data.streak_best,
      inspiration: data.inspiration,
      rerollsDate: data.rerolls_date,
      rerollsUsed: data.rerolls_used,
      createdAt: data.created_at,
      gold: data.gold ?? 0,
      fragments: data.fragments ?? 0,
      keys: data.keys ?? 0,
      chestPity: data.chest_pity ?? {},
      expeditionStartedAt: data.expedition_started_at ?? null,
      chestOpensDate: data.chest_opens_date ?? null,
      chestOpensToday: data.chest_opens_today ?? 0,
      power: data.power ?? 0,
      frameStyle: data.frame_style ?? null
    };
  }
  async saveCharacter(userId, c) {
    const { error } = await this.db.from("characters").upsert(
      {
        id: c.id,
        profile_id: userId,
        name: c.name,
        class_id: c.classId,
        path_id: c.pathId ?? null,
        portrait_id: c.portraitId,
        frame_color: c.frameColor,
        motto: c.motto,
        title_equipped: c.titleEquipped ?? null,
        base_scores: c.baseScores,
        improvements: c.improvements,
        improvements_chosen: c.improvementsChosen,
        total_xp: c.totalXp,
        ability_xp: c.abilityXp,
        level: c.level,
        streak_current: c.streakCurrent,
        streak_best: c.streakBest,
        inspiration: c.inspiration,
        rerolls_date: c.rerollsDate ?? null,
        rerolls_used: c.rerollsUsed,
        gold: c.gold ?? 0,
        fragments: c.fragments ?? 0,
        keys: c.keys ?? 0,
        chest_pity: c.chestPity ?? {},
        expedition_started_at: c.expeditionStartedAt ?? null,
        chest_opens_date: c.chestOpensDate ?? null,
        chest_opens_today: c.chestOpensToday ?? 0,
        power: c.power ?? 0,
        frame_style: c.frameStyle ?? null
      },
      { onConflict: "profile_id" }
    );
    fail5(error, "characters.upsert");
    if (typeof c.oath === "string") {
      const { error: e2 } = await this.db.from("settings").update({ oath: c.oath }).eq("profile_id", userId);
      fail5(e2, "settings.oath");
    }
  }
  async getSettings(userId) {
    const { data, error } = await this.db.from("settings").select("*").eq("profile_id", userId).maybeSingle();
    fail5(error, "settings.select");
    if (!data) {
      return {
        resetHour: 4,
        timezone: "Europe/Paris",
        dailyQuestCount: 2,
        hardcore: false,
        autoShare: { level: true, achievement: true, streak: true },
        defaultVisibility: "friends",
        leaderboardOptIn: true,
        notifPrefs: {},
        friendRequestsFrom: "everyone",
        theme: "auto",
        sounds: true,
        reducedMotion: false,
        lastRecapWeek: null,
        lastRecapMonth: null,
        interests: []
      };
    }
    return {
      resetHour: data.reset_hour,
      timezone: data.timezone,
      dailyQuestCount: data.daily_quest_count,
      hardcore: data.hardcore,
      autoShare: data.auto_share,
      defaultVisibility: data.default_visibility,
      leaderboardOptIn: data.leaderboard_opt_in,
      notifPrefs: data.notif_prefs,
      friendRequestsFrom: data.friend_requests_from,
      theme: data.theme,
      sounds: data.sounds,
      reducedMotion: data.reduced_motion,
      lastRecapWeek: data.last_recap_week,
      lastRecapMonth: data.last_recap_month,
      interests: data.interests ?? []
    };
  }
  async saveSettings(userId, s) {
    const { error } = await this.db.from("settings").upsert(
      {
        profile_id: userId,
        reset_hour: s.resetHour,
        timezone: s.timezone,
        daily_quest_count: s.dailyQuestCount,
        hardcore: s.hardcore,
        auto_share: s.autoShare,
        default_visibility: s.defaultVisibility,
        leaderboard_opt_in: s.leaderboardOptIn,
        notif_prefs: s.notifPrefs,
        friend_requests_from: s.friendRequestsFrom,
        theme: s.theme,
        sounds: s.sounds,
        reduced_motion: s.reducedMotion,
        last_recap_week: s.lastRecapWeek ?? null,
        last_recap_month: s.lastRecapMonth ?? null,
        interests: s.interests ?? []
      },
      { onConflict: "profile_id" }
    );
    fail5(error, "settings.upsert");
  }
  // ───── Catalogue et préférences
  async listTemplates(userId, opts = {}) {
    const rows = await pageAll((a, b) => {
      let q = this.db.from("quest_templates").select("*").eq("is_active", true).or(`source.eq.catalog,owner_id.eq.${userId}`);
      if (opts.withRungs === false) q = q.is("track_id", null);
      return q.order("id", { ascending: true }).range(a, b);
    }, "templates.select");
    return rows.map((t) => ({
      id: t.id,
      source: t.source,
      ownerId: t.owner_id,
      ability: t.ability,
      difficulty: t.difficulty,
      periods: t.periods,
      title: t.title,
      flavor: t.flavor,
      objective: t.objective,
      tips: t.tips,
      validation: t.validation,
      tags: t.tags,
      isActive: t.is_active,
      ...t.theme ? { theme: t.theme } : {},
      ...t.secondary?.length ? { secondary: t.secondary } : {},
      ...t.track_id ? { trackId: t.track_id, rung: t.rung ?? null } : {}
    }));
  }
  async getPreferences(userId) {
    const { data, error } = await this.db.from("quest_preferences").select("*").eq("profile_id", userId);
    fail5(error, "prefs.select");
    const out = {};
    for (const p of data ?? []) out[p.template_id] = { templateId: p.template_id, isFavorite: p.is_favorite, isExcluded: p.is_excluded, isPinned: p.is_pinned, tune: p.tune ?? 0 };
    return out;
  }
  async savePreference(userId, p) {
    const { error } = await this.db.from("quest_preferences").upsert({
      profile_id: userId,
      template_id: p.templateId,
      is_favorite: !!p.isFavorite,
      is_excluded: !!p.isExcluded,
      is_pinned: !!p.isPinned,
      tune: p.tune ?? 0
    }, { onConflict: "profile_id,template_id" });
    fail5(error, "prefs.upsert");
  }
  // ───── Instances
  toInstance(r) {
    return {
      id: r.id,
      templateId: r.template_id,
      snapshot: r.snapshot,
      period: r.period,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      status: r.status,
      progress: Number(r.progress),
      stepsDone: r.steps_done ?? void 0,
      xpAwarded: r.xp_awarded,
      inspirationUsed: r.inspiration_used,
      free: r.is_free,
      run: r.run ?? 1,
      origin: r.origin ?? "draw",
      acceptedAt: r.accepted_at,
      completedAt: r.completed_at,
      ...r.track_id ? { trackId: r.track_id, rung: r.rung ?? null } : {}
    };
  }
  fromInstance(userId, i) {
    return {
      id: i.id,
      profile_id: userId,
      template_id: i.templateId,
      snapshot: i.snapshot,
      period: i.period,
      period_start: i.periodStart,
      period_end: i.periodEnd,
      status: i.status,
      progress: i.progress,
      steps_done: i.stepsDone ?? null,
      xp_awarded: i.xpAwarded,
      inspiration_used: i.inspirationUsed,
      is_free: !!i.free,
      run: i.run ?? 1,
      origin: i.origin ?? "draw",
      accepted_at: i.acceptedAt ?? null,
      completed_at: i.completedAt ?? null,
      track_id: i.trackId ?? null,
      rung: i.rung ?? null
    };
  }
  async listInstances(userId, f = {}) {
    let q = this.db.from("quest_instances").select("*").eq("profile_id", userId);
    if (f.period) q = q.eq("period", f.period);
    if (f.status) q = Array.isArray(f.status) ? q.in("status", f.status) : q.eq("status", f.status);
    if (f.from) q = q.gte("period_start", f.from);
    if (f.to) q = q.lte("period_start", f.to);
    if (f.covers) q = q.lte("period_start", f.covers).gte("period_end", f.covers);
    const rows = await pageAll((a, b) => q.order("period_start", { ascending: true }).order("id", { ascending: true }).range(a, b), "instances.select");
    return rows.map((r) => this.toInstance(r));
  }
  async getInstance(userId, id) {
    const { data, error } = await this.db.from("quest_instances").select("*").eq("profile_id", userId).eq("id", id).maybeSingle();
    fail5(error, "instances.get");
    return data ? this.toInstance(data) : null;
  }
  async insertInstances(userId, instances) {
    if (!instances.length) return;
    const { error } = await this.db.from("quest_instances").upsert(instances.map((i) => this.fromInstance(userId, i)), { onConflict: "profile_id,template_id,period,period_start,run", ignoreDuplicates: true });
    fail5(error, "instances.insert");
  }
  async updateInstance(userId, id, patch) {
    const row = {};
    if ("status" in patch) row.status = patch.status;
    if ("progress" in patch) row.progress = patch.progress;
    if ("stepsDone" in patch) row.steps_done = patch.stepsDone ?? null;
    if ("xpAwarded" in patch) row.xp_awarded = patch.xpAwarded;
    if ("inspirationUsed" in patch) row.inspiration_used = patch.inspirationUsed;
    if ("acceptedAt" in patch) row.accepted_at = patch.acceptedAt ?? null;
    if ("completedAt" in patch) row.completed_at = patch.completedAt ?? null;
    if ("snapshot" in patch) row.snapshot = patch.snapshot;
    const { error } = await this.db.from("quest_instances").update(row).eq("profile_id", userId).eq("id", id);
    fail5(error, "instances.update");
  }
  async deleteInstance(userId, id) {
    const { error } = await this.db.from("quest_instances").delete().eq("profile_id", userId).eq("id", id);
    fail5(error, "instances.delete");
  }
  // ───── Parcours de discipline
  async listTracks(userId) {
    const { data, error } = await this.db.from("tracks").select("*").eq("profile_id", userId).order("track_id", { ascending: true });
    fail5(error, "tracks.select");
    return (data ?? []).map((r) => ({
      trackId: r.track_id,
      status: r.status,
      rung: r.rung,
      hits: r.hits,
      lastDoneDate: r.last_done_date ?? null,
      lastCheckedDate: r.last_checked_date ?? null,
      bestRung: r.best_rung,
      startedAt: r.started_at
    }));
  }
  async saveTrack(userId, t) {
    const { error } = await this.db.from("tracks").upsert(
      {
        profile_id: userId,
        track_id: t.trackId,
        status: t.status,
        rung: t.rung,
        hits: t.hits,
        last_done_date: t.lastDoneDate ?? null,
        last_checked_date: t.lastCheckedDate ?? null,
        best_rung: t.bestRung,
        started_at: t.startedAt
      },
      { onConflict: "profile_id,track_id" }
    );
    fail5(error, "tracks.upsert");
  }
  async deleteTrack(userId, trackId) {
    const { error } = await this.db.from("tracks").delete().eq("profile_id", userId).eq("track_id", trackId);
    fail5(error, "tracks.delete");
  }
  // ───── Aventure : équipement, coffres, donjons
  async listItems(userId) {
    const rows = await pageAll((a, b) => this.db.from("inventory_items").select("*").eq("profile_id", userId).order("created_at", { ascending: true }).order("id", { ascending: true }).range(a, b), "items.select");
    return rows.map((r) => ({
      id: r.id,
      templateId: r.template_id,
      rarity: r.rarity,
      slot: r.slot,
      ability: r.ability,
      level: r.level,
      equipped: r.equipped,
      createdAt: r.created_at
    }));
  }
  async insertItems(userId, items) {
    if (!items.length) return;
    const { error } = await this.db.from("inventory_items").insert(
      items.map((i) => ({
        id: i.id,
        profile_id: userId,
        template_id: i.templateId,
        rarity: i.rarity,
        slot: i.slot,
        ability: i.ability,
        level: i.level ?? 0,
        equipped: !!i.equipped,
        created_at: i.createdAt
      }))
    );
    fail5(error, "items.insert");
  }
  async updateItem(userId, id, patch) {
    const row = {};
    if ("level" in patch) row.level = patch.level;
    if ("equipped" in patch) row.equipped = !!patch.equipped;
    if (!Object.keys(row).length) return;
    const { error } = await this.db.from("inventory_items").update(row).eq("profile_id", userId).eq("id", id);
    fail5(error, "items.update");
  }
  async deleteItems(userId, ids) {
    if (!ids.length) return;
    const { error } = await this.db.from("inventory_items").delete().eq("profile_id", userId).in("id", ids);
    fail5(error, "items.delete");
  }
  async listChests(userId, filter = {}) {
    let q = this.db.from("chests").select("*").eq("profile_id", userId);
    if (filter.opened === true) q = q.not("opened_at", "is", null);
    if (filter.opened === false) q = q.is("opened_at", null);
    const rows = await pageAll((a, b) => q.order("created_at", { ascending: true }).order("id", { ascending: true }).range(a, b), "chests.select");
    return rows.map((r) => ({
      id: r.id,
      rarity: r.rarity,
      source: r.source,
      sourceKey: r.source_key,
      instanceId: r.instance_id ?? null,
      createdAt: r.created_at,
      openedAt: r.opened_at ?? null
    }));
  }
  async insertChest(userId, c) {
    const { error } = await this.db.from("chests").insert({
      id: c.id,
      profile_id: userId,
      rarity: c.rarity,
      source: c.source,
      source_key: c.sourceKey,
      instance_id: c.instanceId ?? null,
      created_at: c.createdAt,
      opened_at: c.openedAt ?? null
    });
    if (error && (error.code === "23505" || /duplicate key|unique/i.test(error.message ?? ""))) return false;
    fail5(error, "chests.insert");
    return true;
  }
  async markChestOpened(userId, id, at) {
    const { data, error } = await this.db.from("chests").update({ opened_at: at }).eq("profile_id", userId).eq("id", id).is("opened_at", null).select("id");
    fail5(error, "chests.open");
    return (data?.length ?? 0) > 0;
  }
  async deleteChests(userId, ids) {
    if (!ids.length) return;
    const { error } = await this.db.from("chests").delete().eq("profile_id", userId).in("id", ids);
    fail5(error, "chests.delete");
  }
  async listDungeonProgress(userId) {
    const { data, error } = await this.db.from("dungeon_progress").select("*").eq("profile_id", userId).order("dungeon_id", { ascending: true });
    fail5(error, "dungeon_progress.select");
    return (data ?? []).map((r) => ({ dungeonId: r.dungeon_id, bestRoom: r.best_room, bossDefeatedTier: r.boss_defeated_tier, lastRunDate: r.last_run_date ?? null }));
  }
  async saveDungeonProgress(userId, p) {
    const { error } = await this.db.from("dungeon_progress").upsert(
      { profile_id: userId, dungeon_id: p.dungeonId, best_room: p.bestRoom, boss_defeated_tier: p.bossDefeatedTier, last_run_date: p.lastRunDate ?? null },
      { onConflict: "profile_id,dungeon_id" }
    );
    fail5(error, "dungeon_progress.upsert");
  }
  // ───── Raids d'amis
  async areFriends(a, b) {
    if (a === b) return false;
    const { data, error } = await this.db.rpc("can_view_owner", { viewer: a, owner: b });
    fail5(error, "can_view_owner");
    return data === true;
  }
  async getRaidTeam(teamId) {
    const { data, error } = await this.db.from("raid_teams").select("*").eq("id", teamId).maybeSingle();
    fail5(error, "raid_teams.select");
    return data ? toTeam(data) : null;
  }
  async listRaidMemberships(userId, since) {
    const { data, error } = await this.db.from("raid_members").select("*").eq("profile_id", userId).gte("week_start", since).order("week_start", { ascending: true }).order("team_id", { ascending: true });
    fail5(error, "raid_members.select");
    return (data ?? []).map(toMember);
  }
  async listRaidMembers(teamId) {
    const { data, error } = await this.db.from("raid_members").select("*").eq("team_id", teamId).order("created_at", { ascending: true }).order("profile_id", { ascending: true });
    fail5(error, "raid_members.list");
    return (data ?? []).map(toMember);
  }
  async insertRaidTeam(team, leader) {
    const { error } = await this.db.from("raid_teams").insert({ id: team.id, week_start: team.weekStart, leader_id: team.leaderId, created_at: team.createdAt });
    fail5(error, "raid_teams.insert");
    const r = memberWrite((await this.db.from("raid_members").insert(fromMember(leader))).error, "raid_members.insert");
    if (r === "ok") return true;
    await this.db.from("raid_teams").delete().eq("id", team.id);
    if (r === "conflict" || r === "duplicate") return false;
    throw new Error(`raid_members.insert: ${r}`);
  }
  async insertRaidMember(m) {
    return memberWrite((await this.db.from("raid_members").insert(fromMember(m))).error, "raid_members.insert");
  }
  async joinRaidMember(teamId, profileId, at) {
    const { data, error } = await this.db.from("raid_members").update({ status: "joined", joined_at: at }).eq("team_id", teamId).eq("profile_id", profileId).eq("status", "invited").select("profile_id");
    const r = memberWrite(error, "raid_members.join");
    if (r !== "ok") return r;
    return (data?.length ?? 0) > 0 ? "ok" : "conflict";
  }
  async deleteRaidMember(teamId, profileId) {
    const { error } = await this.db.from("raid_members").delete().eq("team_id", teamId).eq("profile_id", profileId);
    fail5(error, "raid_members.delete");
  }
  async deleteRaidInvites(profileId, weekStart) {
    const { error } = await this.db.from("raid_members").delete().eq("profile_id", profileId).eq("week_start", weekStart).eq("status", "invited");
    fail5(error, "raid_members.invites");
  }
  async setRaidLeader(teamId, leaderId) {
    const { error } = await this.db.from("raid_teams").update({ leader_id: leaderId }).eq("id", teamId);
    fail5(error, "raid_teams.leader");
  }
  async deleteRaidTeam(teamId) {
    const { error } = await this.db.from("raid_teams").delete().eq("id", teamId);
    fail5(error, "raid_teams.delete");
  }
  async resolveRaidTeam(teamId, r) {
    const { data, error } = await this.db.from("raid_teams").update({ resolved_at: r.at, outcome: r.outcome, max_hp: r.maxHp, total_damage: r.totalDamage, victory_day: r.victoryDay }).eq("id", teamId).is("resolved_at", null).select("id");
    fail5(error, "raid_teams.resolve");
    return (data?.length ?? 0) > 0;
  }
  async listRaidDamage(teamId) {
    const { data, error } = await this.db.from("raid_damage").select("*").eq("team_id", teamId).order("game_date", { ascending: true }).order("profile_id", { ascending: true });
    fail5(error, "raid_damage.select");
    return (data ?? []).map((r) => ({
      teamId: r.team_id,
      profileId: r.profile_id,
      gameDate: r.game_date,
      damage: r.damage,
      baseDamage: r.base_damage,
      encouragements: r.encouragements
    }));
  }
  async insertRaidDamage(d) {
    const { error } = await this.db.from("raid_damage").insert({
      team_id: d.teamId,
      profile_id: d.profileId,
      game_date: d.gameDate,
      damage: d.damage,
      base_damage: d.baseDamage,
      encouragements: d.encouragements
    });
    if (error && (error.code === "23505" || /duplicate key|unique/i.test(error.message ?? ""))) return false;
    fail5(error, "raid_damage.insert");
    return true;
  }
  async updateRaidDamage(teamId, profileId, gameDate2, patch) {
    const { error } = await this.db.from("raid_damage").update({ damage: patch.damage, encouragements: patch.encouragements }).eq("team_id", teamId).eq("profile_id", profileId).eq("game_date", gameDate2);
    fail5(error, "raid_damage.update");
  }
  async listRaidEncouragements(teamId, gameDate2) {
    const { data, error } = await this.db.from("raid_encouragements").select("*").eq("team_id", teamId).eq("game_date", gameDate2);
    fail5(error, "raid_encouragements.select");
    return (data ?? []).map((r) => ({ teamId: r.team_id, fromId: r.from_id, toId: r.to_id, gameDate: r.game_date, createdAt: r.created_at }));
  }
  async insertRaidEncouragement(e) {
    const { error } = await this.db.from("raid_encouragements").insert({ team_id: e.teamId, from_id: e.fromId, to_id: e.toId, game_date: e.gameDate, created_at: e.createdAt });
    if (error && (error.code === "23505" || /duplicate key|unique/i.test(error.message ?? ""))) return false;
    fail5(error, "raid_encouragements.insert");
    return true;
  }
  async notify(userId, type, payload) {
    const { error } = await this.db.rpc("notify_user", { p_to: userId, p_type: type, p_payload: payload });
    fail5(error, "notify_user");
  }
  // ───── Saisons
  async upsertSeasonScore(userId, seasonKey, power, day) {
    const { error } = await this.db.rpc("record_season_power", { p_profile: userId, p_season: seasonKey, p_power: power, p_day: day });
    fail5(error, "record_season_power");
  }
  async listSeasonScores(userId) {
    const { data, error } = await this.db.from("season_scores").select("*").eq("profile_id", userId).order("season_key", { ascending: true });
    fail5(error, "season_scores.select");
    return (data ?? []).map((r) => ({ seasonKey: r.season_key, power: r.power, firstDay: r.first_day, lastDay: r.last_day }));
  }
  async seasonRanking(userId, seasonKey) {
    const { data, error } = await this.db.rpc("season_ranking", { p_viewer: userId, p_season: seasonKey });
    fail5(error, "season_ranking");
    return (data ?? []).map((r) => ({ profileId: r.profile_id, power: Number(r.power) }));
  }
  async listSeasonResults(userId) {
    const { data, error } = await this.db.from("season_results").select("*").eq("profile_id", userId).order("season_key", { ascending: true });
    fail5(error, "season_results.select");
    return (data ?? []).map((r) => ({
      seasonKey: r.season_key,
      rank: r.rank ?? null,
      participants: r.participants,
      power: r.power,
      frame: r.frame ?? null,
      createdAt: r.created_at
    }));
  }
  async insertSeasonResult(userId, r) {
    const { error } = await this.db.from("season_results").insert({
      profile_id: userId,
      season_key: r.seasonKey,
      rank: r.rank ?? null,
      participants: r.participants,
      power: r.power,
      frame: r.frame ?? null,
      created_at: r.createdAt
    });
    if (error && (error.code === "23505" || /duplicate key|unique/i.test(error.message ?? ""))) return false;
    fail5(error, "season_results.insert");
    return true;
  }
  // ───── Registre d'XP
  async insertXpEvents(userId, events) {
    if (!events.length) return;
    const { error } = await this.db.from("xp_events").insert(
      events.map((e) => ({
        id: e.id,
        profile_id: userId,
        instance_id: e.instanceId,
        ability: e.ability,
        amount: e.amount,
        reason: e.reason,
        is_custom: !!e.custom,
        game_date: e.gameDate,
        created_at: e.createdAt
      }))
    );
    fail5(error, "xp_events.insert");
  }
  async listXpEvents(userId, since) {
    let q = this.db.from("xp_events").select("*").eq("profile_id", userId);
    if (since) q = q.gte("game_date", since);
    const rows = await pageAll((a, b) => q.order("created_at", { ascending: true }).order("id", { ascending: true }).range(a, b), "xp_events.select");
    return rows.map((e) => ({
      id: e.id,
      instanceId: e.instance_id,
      ability: e.ability,
      amount: e.amount,
      reason: e.reason,
      custom: e.is_custom,
      createdAt: e.created_at,
      gameDate: e.game_date
    }));
  }
  // ───── Trophées, repos, journal
  async listUnlocked(userId) {
    const { data, error } = await this.db.from("unlocked_achievements").select("*").eq("profile_id", userId);
    fail5(error, "unlocked.select");
    return (data ?? []).map((u) => ({ achievementId: u.achievement_id, unlockedAt: u.unlocked_at }));
  }
  async unlockAchievement(userId, achievementId, at) {
    const { error } = await this.db.from("unlocked_achievements").upsert({ profile_id: userId, achievement_id: achievementId, unlocked_at: at }, { onConflict: "profile_id,achievement_id", ignoreDuplicates: true });
    fail5(error, "unlocked.insert");
  }
  async listRestDays(userId) {
    const { data, error } = await this.db.from("rest_days").select("day").eq("profile_id", userId);
    fail5(error, "rest_days.select");
    return (data ?? []).map((r) => r.day);
  }
  async addRestDay(userId, day) {
    const { error } = await this.db.from("rest_days").upsert({ profile_id: userId, day }, { onConflict: "profile_id,day", ignoreDuplicates: true });
    fail5(error, "rest_days.insert");
  }
  async saveJournal(userId, e) {
    const { error } = await this.db.from("journal_entries").insert({ id: e.id, profile_id: userId, instance_id: e.instanceId, text: e.text, created_at: e.createdAt });
    fail5(error, "journal.insert");
  }
  async countJournal(userId) {
    const { count, error } = await this.db.from("journal_entries").select("id", { count: "exact", head: true }).eq("profile_id", userId);
    fail5(error, "journal.count");
    return count ?? 0;
  }
  async listJournal(userId) {
    const rows = await pageAll((a, b) => this.db.from("journal_entries").select("*").eq("profile_id", userId).order("created_at", { ascending: false }).order("id").range(a, b), "journal.select");
    return rows.map((e) => ({ id: e.id, instanceId: e.instance_id, text: e.text, createdAt: e.created_at }));
  }
  // ───── Publications
  async createPost(userId, d) {
    const { data, error } = await this.db.from("posts").insert({
      author_id: userId,
      type: d.type,
      instance_id: d.instanceId ?? null,
      text: d.text ?? "",
      visibility: d.visibility,
      payload: d.payload ?? {}
    }).select("id").single();
    fail5(error, "posts.insert");
    if (d.mediaPaths?.length) {
      const { error: e2 } = await this.db.from("post_media").insert(d.mediaPaths.slice(0, 4).map((p, i) => ({ post_id: data.id, storage_path: p, position: i })));
      fail5(e2, "post_media.insert");
    }
    return data.id;
  }
  async detachPostsFromInstance(userId, instanceId) {
    const { data } = await this.db.from("posts").select("id,payload").eq("author_id", userId).eq("instance_id", instanceId);
    for (const p of data ?? []) {
      const payload = { ...p.payload ?? {}, questDetached: true };
      delete payload.xp;
      const { error } = await this.db.from("posts").update({ instance_id: null, payload }).eq("id", p.id);
      fail5(error, "posts.detach");
    }
  }
  async socialCounts(userId) {
    const [posts, friends, reactions] = await Promise.all([
      this.db.from("posts").select("id", { count: "exact", head: true }).eq("author_id", userId).in("type", ["quest", "photo"]).is("deleted_at", null),
      this.db.from("friendships").select("id", { count: "exact", head: true }).eq("status", "accepted").or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
      this.db.from("reactions").select("post_id", { count: "exact", head: true }).eq("profile_id", userId)
    ]);
    return { posts: posts.count ?? 0, friends: friends.count ?? 0, reactionsGiven: reactions.count ?? 0 };
  }
};
export {
  ABILITIES,
  ABILITY_COLOR,
  ABILITY_DND_NAME,
  ABILITY_LABEL,
  ABILITY_SHORT,
  ABILITY_TAGLINE,
  ACHIEVEMENTS,
  ANTI_REPEAT_DAYS,
  BALANCED_SCORES,
  BALANCE_CATCHUP_FACTOR,
  BALANCE_CATCHUP_GAP,
  BALANCE_HEAVY_SPECIALIZE_FACTOR,
  BALANCE_HEAVY_SPECIALIZE_GAP,
  BALANCE_SPECIALIZE_FACTOR,
  BALANCE_SPECIALIZE_GAP,
  BASE_XP,
  CHEST_OPENS_PER_DAY,
  CHEST_RARITIES,
  CHEST_TABLE,
  CLASSES3 as CLASSES,
  DAILY_FREE_CHEST,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  DIFFICULTY_SWORDS,
  DISMANTLE_FRAGMENTS,
  DUNGEONS,
  DUNGEON_BASE_START,
  DUNGEON_BOSS_MULT,
  DUNGEON_BOSS_REWARD_ROOMS,
  DUNGEON_BOSS_ROOM,
  DUNGEON_CON_DIV,
  DUNGEON_FOR_DIV,
  DUNGEON_ROOMS,
  DUNGEON_ROOM_FRAGMENTS,
  DUNGEON_ROOM_GOLD,
  DUNGEON_ROOM_GROWTH,
  DUNGEON_SILVER_TIER,
  DUNGEON_TIER_GROWTH,
  DUNGEON_UNLOCK_PER_TIER,
  EPIC_LEVEL,
  EQUIP_SLOTS,
  EXPEDITION_CAP_HOURS,
  EXPEDITION_DEX_DIV,
  EXPEDITION_FRAGMENT_PP_DIV,
  EXPEDITION_GOLD_PER_HOUR,
  EXPEDITION_GOLD_PP_DIV,
  EXPEDITION_INT_DIV,
  EXPEDITION_KEY_CHANCE,
  EXPEDITION_MIN_CLAIM_MS,
  EXPEDITION_STREAK_MAX,
  EXPEDITION_STREAK_STEP,
  FORGE_LEVEL,
  IMPROVEMENT_LEVELS,
  ITEMS,
  ITEM_ABILITY_BONUS_DIV,
  ITEM_AFFINITY_BONUS,
  ITEM_BASE_POWER,
  ITEM_LEVEL_STEP,
  ITEM_MAX_LEVEL,
  ITEM_RARITIES,
  JOURNAL_MIN_CHARS,
  LEVEL_XP,
  MAX_ACTIVE_TRACKS,
  MAX_FREE_QUESTS_PER_DAY,
  MAX_INSPIRATION,
  MAX_INTERESTS,
  MAX_KEYS,
  MAX_LEVEL,
  MAX_OPEN_EXTRAS,
  MAX_RUNS,
  MAX_SCORE,
  MERGE_COUNT,
  MIN_SCORE,
  MemoryStore,
  NO_SET_BONUS,
  OFFLINE_MAX_DELAY_MS,
  PATH_LEVEL,
  PERIODS,
  PERIOD_LABEL,
  PERIOD_MULTIPLIER,
  PERIOD_SHORT,
  PERIOD_TAB_LABEL,
  PITY_EPIC,
  PITY_EPIC_MIN_CHEST,
  PITY_LEGENDARY,
  PITY_LEGENDARY_MIN_CHEST,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  POINT_BUY_MAX,
  RAID_BASE_HP,
  RAID_BOSSES,
  RAID_CHA_CAP,
  RAID_CHA_STEP,
  RAID_ENCOURAGE_CAP,
  RAID_ENCOURAGE_STEP,
  RAID_FAST_CHEST,
  RAID_FAST_DAYS,
  RAID_FOR_DIV,
  RAID_HP_PER_MEMBER,
  RAID_MAX_MEMBERS,
  RAID_MIN_MEMBERS,
  RAID_RULES,
  RAID_WIN_CHEST,
  REACTION_EMOJI,
  REACTION_KINDS,
  REACTION_LABEL,
  REPEAT_FACTORS,
  SAG_SHIFT_PCT,
  SAG_SHIFT_STEP,
  SEASON_ANCHOR,
  SEASON_CHEST,
  SEASON_DAYS,
  SEASON_FRAMES,
  SEASON_FRAME_DEFS,
  SEASON_MIN_SPAN_DAYS,
  SEASON_WEEKS,
  SETS,
  SOFT_CAP_SCORE,
  STREAK_MILESTONE_CHESTS,
  SupabaseStore,
  TIER3_MIN_SCORE,
  TIER4_MIN_LEVEL,
  TRACK_DEMOTE_MISSES,
  TRACK_PROMOTE_HITS,
  TRACK_RUNGS,
  TUNE_FACTOR,
  UNDO_WINDOW_MS,
  UPGRADE_FRAGMENTS_STEP,
  UPGRADE_GOLD_EXPONENT,
  UPGRADE_GOLD_STEP,
  UPGRADE_XP_STEP,
  VALIDATION_LABEL,
  abandonQuest,
  abilityProgress,
  abilityProgressOf,
  abilityScores,
  abilityUpgradeCost,
  acceptQuest,
  achievementProgress,
  activityOf,
  addDays,
  adjustedOdds,
  advanceOnCompletion,
  adventureScores,
  applyBalance,
  applyMisses,
  applyXp,
  applyXpParts,
  autoRaidHit,
  availableAgainOn,
  balanceAmount,
  balanceDetails,
  balanceGap,
  baseTargetOf,
  buildRecap,
  buildRungTemplates,
  buildSnapshot,
  canDeclareRest,
  canForge,
  canUndo,
  chooseImprovement,
  choosePath,
  claimExpedition,
  completeQuest,
  completeQuestAction,
  computeBestStreak,
  computePlayerStats,
  computeStreak,
  conditionProgress,
  createCharacter,
  createRaidTeam,
  createRng,
  dailyChestRarity,
  daysLeft,
  declareRest,
  defaultSettings,
  diffDays,
  dismantleItem,
  dismantleValue,
  drawChest,
  drawQuests,
  dungeonBase,
  dungeonBossChest,
  dungeonBossPower,
  dungeonRoomPower,
  dungeonUnlockLevel,
  effectiveRung,
  emptyAbilityRecord,
  emptyAdventureFields,
  emptyRaidState,
  emptyStats,
  emptyUserData,
  encourageRaid,
  endOfIsoWeek,
  endOfMonth,
  endOfQuarter,
  ensureQuests,
  equipItem,
  equipTitle,
  equippedBySlot,
  evaluateAchievements,
  evaluateSeasons,
  expeditionRates,
  expeditionYield,
  expiredPartialXp,
  frameStyleOf,
  gameDate,
  getAdventureState,
  getRaidState,
  getSeasonState,
  grantQuestChests,
  hardcorePenalty,
  hasLegacyBaseScores,
  hashString,
  heroCombatStats,
  heroPower,
  heroPowerBreakdown,
  heroSnapshot,
  inspirationAfterStreak,
  interestKey,
  interestWeight,
  interpolate,
  inviteToRaid,
  isDateInRange,
  isReadyToComplete,
  isValidPointBuy,
  isoWeek,
  isoWeekday,
  itemAbilityBonus,
  itemPower,
  joinRaidTeam,
  lastAcceptDate,
  lastDrawnMap,
  leaveRaidTeam,
  levelFromXp,
  levelProgress,
  listDays,
  listDungeons,
  localDate,
  localMinutes,
  masteriesFor,
  masteriesOf,
  mergeChests,
  mergeItems,
  missedDays,
  msUntilReset,
  newlyUnlocked,
  nextChestRarity,
  nextItemRarity,
  nextSetTier,
  nextTune,
  offlineCompletionAllowed,
  openChest,
  parseDateStr,
  parseFrameStyle,
  partialXp,
  pathAbilityFor,
  pathAbilityOf,
  pendingImprovements,
  pendingPath,
  periodBounds,
  pickTavernMessage,
  pickTemplateForSlot,
  pointBuySpent,
  previewBalance,
  proficiencyBonus,
  progressRatio,
  questCountFor,
  questLock,
  questXp,
  raidBaseDamage,
  raidBossFor,
  raidChaBonus,
  raidDamage,
  raidDaysToKill,
  raidEncouragementBonus,
  raidMaxHp,
  raidOutcome,
  raidRewardChest,
  raidVictoryDay,
  raidWeekEnd,
  raidWeekKey,
  raidWeekOver,
  raidWeekStart,
  rankSeason,
  recomputeCharacter,
  recordPower,
  redoQuest,
  repeatMultiplier,
  rerollQuest,
  rescaleLegacyBaseScores,
  resolveDungeon,
  revertCompletion,
  revokeQuestChests,
  rollExpeditionKey,
  runDungeon,
  rungChestRarity,
  rungTemplateId,
  sanitizeInterests,
  scoresFromAssessment,
  seasonBounds,
  seasonIndex,
  seasonIndexOfKey,
  seasonInfo,
  seasonKeyOf,
  seasonQualifies,
  seasonReward,
  setBonusTotals,
  setTier,
  setTrackPaused,
  setsProgress,
  shuffle,
  slugify,
  splitXp,
  startOfIsoWeek,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  startQuest,
  startTrack,
  stopTrack,
  streakMilestoneChest,
  streakMultiplier,
  syncHeroPower,
  tierAt,
  tierUnlocked,
  toDateStr,
  totalAbilityScoreSum,
  trackRungDifficulty,
  trackRungMinScore,
  trackShapes,
  tunableTarget,
  tuneQuest,
  tuneXpScale,
  tunedSnapshot,
  tunedTarget,
  undoQuest,
  unequipSlot,
  unlocksAt,
  updateProgress,
  upgradeCost,
  upgradeItem,
  validationTarget,
  weekStartOf,
  weightedPick,
  withTarget,
  xpBalanceFactor,
  xpBonusForMastery,
  xpShares
};
