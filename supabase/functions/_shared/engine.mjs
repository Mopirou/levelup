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
var MIN_SCORE = 8;
var POINT_BUY_BUDGET = 27;
var POINT_BUY_MAX = 15;
var POINT_BUY_COST = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9
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
function abilityModifier(score) {
  return Math.floor((score - 10) / 2);
}
function abilityUpgradeCost(score) {
  if (score < 20) return 100 * (score - 7);
  return 2e3;
}
var MAX_SCORE = 30;
var SOFT_CAP_SCORE = 20;
var costAt = (k, bonus) => k + bonus >= SOFT_CAP_SCORE ? 2e3 : 100 * (k - 7);
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
  FOR: 13,
  DEX: 13,
  CON: 13,
  INT: 12,
  SAG: 12,
  CHA: 12
};
function xpBonusForMastery(proficiency) {
  return proficiency * 5;
}
function questXp(i) {
  const base = BASE_XP[i.difficulty];
  const multiplier = PERIOD_MULTIPLIER[i.period];
  const mastery = i.masteries.includes(i.ability) ? xpBonusForMastery(proficiencyBonus(i.level)) : 0;
  const affinity = i.pathAbility && i.pathAbility === i.ability ? 2 : 0;
  const sub = base * multiplier + mastery + affinity;
  return { base, multiplier, mastery, affinity, doubled: !!i.doubled, total: i.doubled ? sub * 2 : sub };
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
      return dailySetting ? Math.min(Math.max(dailySetting, 1), u.dailyQuests) : u.dailyQuests;
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
var TIER3_MIN_SCORE = 14;
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
function drawQuests(input) {
  const rng = createRng(`${input.characterId}|${input.period}|${input.periodStart}|${input.seedSuffix ?? ""}`);
  const relaxed = /* @__PURE__ */ new Set();
  const picks = [];
  const picked = new Set(input.exclude ?? []);
  const prefs = input.preferences;
  const eligible = input.templates.filter((t) => t.isActive !== false && t.periods.includes(input.period) && !prefs[t.id]?.isExcluded);
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
        const needMastery = slot === 0 && picks.length === 0 && input.masteries.length > 0;
        const hasMastery = picks.some((p) => input.masteries.includes(p.ability));
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
          if (needMastery || !hasMastery && slot === slots - 1 && input.masteries.length > 0) {
            const mastered = cands.filter((t) => input.masteries.includes(t.ability));
            if (mastered.length) cands = mastered;
          }
          if (!cands.length) continue;
          found = weightedPick(
            cands,
            (t) => {
              let w = 1;
              if (useBalance && maxScore > minScore) {
                if (input.scores[t.ability] === minScore) w *= 2;
                else if (input.scores[t.ability] === maxScore) w *= 0.5;
              }
              if (prefs[t.id]?.isFavorite) w *= 3;
              return w;
            },
            rng
          );
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
    doubled: input.useInspiration
  });
  const base = input.useInspiration ? { ...character, inspiration: character.inspiration - 1 } : character;
  const applied = applyXpParts(base, splitXp(breakdown.total, instance.snapshot.ability, instance.snapshot.secondary));
  return {
    ok: true,
    result: { ...applied, xpAwarded: breakdown.total, breakdown, inspirationSpent: input.useInspiration }
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
    pathAbility
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
    scores: { FOR: 8, DEX: 8, CON: 8, INT: 8, SAG: 8, CHA: 8 },
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
  dailyQuestCount: 6,
  hardcore: false,
  autoShare: { level: true, achievement: true, streak: true },
  defaultVisibility: "friends",
  leaderboardOptIn: true,
  notifPrefs: { daily: true, dailyTime: "09:00", weekEnd: true, friendRequests: true, reactions: true, comments: true },
  friendRequestsFrom: "everyone",
  theme: "auto",
  sounds: true,
  reducedMotion: false,
  lastRecapWeek: null,
  lastRecapMonth: null
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
    favoredQuests: ["Marche rapide, 30 minutes", "Cardio, 150 minutes dans la semaine", "Haut du corps, 20 minutes"],
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
    favoredQuests: ["S\xE9ance de force compl\xE8te, 30 minutes", "Activit\xE9 de coordination, 45 minutes", "Parcours d\u2019agilit\xE9, 20 minutes"],
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
    favoredQuests: ["Geste pr\xE9cis, 90 minutes dans la semaine", "Tutoriel d\u2019une comp\xE9tence, 15 minutes", "Programmation, 30 minutes"],
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
    favoredQuests: ["Habilet\xE9 manuelle, 120 minutes", "Prise de parole, 15 minutes", "Jonglage progressif, 15 minutes"],
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
    favoredQuests: ["Repas partag\xE9, 45 minutes", "Temps social, 180 minutes dans la semaine", "Marche et discussion, 30 minutes"],
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
    favoredQuests: ["Lecture, 30 minutes", "Langue \xE9trang\xE8re, 20 minutes", "M\xE9ditation, 15 minutes"],
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
    favoredQuests: ["M\xE9ditation, 15 minutes", "\xC9coute active, 20 minutes", "Gratitude, 5 minutes"],
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
    favoredQuests: ["Nature sans \xE9cran, 30 minutes", "Sortie en ext\xE9rieur, 45 minutes", "Marche, 150 minutes dans la semaine"],
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

// packages/engine/src/server/game.ts
var CLASSES = classes_fr_default;
var ACHIEVEMENTS = achievements_fr_default;
var STREAK_POSTS = [7, 14, 30, 60, 100, 200, 365];
var FREE_QUESTS_PER_DAY = 2;
var fail = (error, message) => ({ ok: false, error, message });
async function loadEnv(ctx, userId) {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return null;
  const nowMs = ctx.now();
  return { ctx, userId, character, settings, nowMs, today: gameDate(nowMs, settings.timezone, settings.resetHour) };
}
function masteriesFor(c) {
  return masteriesOf(CLASSES, c.classId);
}
function pathAbilityFor(c) {
  return pathAbilityOf(CLASSES, c.classId, c.pathId);
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
function newInstance(id, t, period, start, end, status, nowIso, free = false) {
  return {
    id,
    templateId: t.id,
    snapshot: snapshotOf(t),
    period,
    periodStart: start,
    periodEnd: end,
    status,
    progress: 0,
    stepsDone: t.validation.type === "steps" ? t.validation.steps.map(() => false) : void 0,
    xpAwarded: 0,
    inspirationUsed: false,
    free,
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
async function computePlayerStats(store, userId, character, settings) {
  const [completed, templates, rest, journal, social] = await Promise.all([
    store.listInstances(userId, { status: "completed" }),
    store.listTemplates(userId),
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
  return evaluateAchievements(ACHIEVEMENTS, await computePlayerStats(ctx.store, userId, env.character, env.settings));
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
  const [daily, rest] = await Promise.all([
    store.listInstances(userId, { period: "daily", status: "completed", from: addDays(today, -800) }),
    store.listRestDays(userId)
  ]);
  const days = daily.filter((q) => q.completedAt).map((q) => gameDate(Date.parse(q.completedAt), settings.timezone, settings.resetHour));
  const s = computeStreak(days, rest, today);
  return { current: s.current, doneToday: s.doneToday, best: computeBestStreak(days, rest), days };
}
async function createCharacter(ctx, userId, input) {
  if (await ctx.store.getCharacter(userId)) return fail("already-has-character");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 30) return fail("invalid", "Le nom doit faire entre 2 et 30 caract\xE8res.");
  if (!CLASSES.some((c) => c.id === input.classId)) return fail("invalid", "Classe inconnue.");
  if (!isValidPointBuy(input.scores)) return fail("invalid", "R\xE9partition de points invalide.");
  if ((input.motto ?? "").length > 80) return fail("invalid", "Devise trop longue.");
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
    createdAt: nowIso
  };
  await ctx.store.saveSettings(userId, defaultSettings(input.timezone));
  await ctx.store.saveCharacter(userId, character);
  await ensureQuests(ctx, userId);
  return { ok: true, character };
}
async function ensureQuests(ctx, userId) {
  const env = await loadEnv(ctx, userId);
  const result = { created: [], expired: [], levelUps: [] };
  if (!env) return result;
  const { store } = ctx;
  let { character } = env;
  const { settings, today } = env;
  const nowIso = new Date(env.nowMs).toISOString();
  const open = await store.listInstances(userId, { status: ["proposed", "accepted"] });
  const allTemplates = await store.listTemplates(userId);
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
      } else if (settings.hardcore) {
        const penalty = hardcorePenalty(inst);
        events.push(eventFor(ctx, { instanceId: inst.id, ability: inst.snapshot.ability, amount: -penalty, reason: "hardcore" }, inst.periodEnd));
        character = mergeChar(character, applyXp(character, inst.snapshot.ability, -penalty).character);
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
  const u = unlocksAt(character.level);
  const periods = ["daily", "weekly", "monthly"];
  if (u.epic) periods.push("epic");
  const toInsert = [];
  for (const period of periods) {
    const b = periodBounds(period, today);
    if (history.some((i) => i.period === period && i.periodStart === b.start)) continue;
    const count = questCountFor(period, character.level, period === "daily" ? settings.dailyQuestCount : void 0);
    if (count <= 0) continue;
    const base = {
      characterId: character.id,
      period,
      periodStart: b.start,
      level: character.level,
      scores,
      masteries,
      templates,
      preferences: prefs,
      lastDrawn: lastDrawnMap(history, period)
    };
    const main = drawQuests({ ...base, count });
    for (const t of main.picks) {
      const pinned = !!prefs[t.id]?.isPinned;
      const status = period === "daily" || pinned ? "accepted" : "proposed";
      toInsert.push(newInstance(ctx.uuid(), t, period, b.start, b.end, status, nowIso));
    }
    if (period === "daily") {
      const free = drawQuests({
        ...base,
        count: FREE_QUESTS_PER_DAY,
        difficultyPlan: ["medium", "high"],
        exclude: main.picks.map((t) => t.id),
        seedSuffix: "free",
        skipPinned: true
      });
      for (const t of free.picks) toInsert.push(newInstance(ctx.uuid(), t, period, b.start, b.end, "proposed", nowIso, true));
    }
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
  if (!env) return fail("no-character");
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail("not-found");
  if (inst.status !== "proposed") return fail("not-accepted");
  if (env.today > lastAcceptDate(inst.period, inst.periodStart, inst.periodEnd) || env.today > inst.periodEnd) {
    return fail("too-late-to-accept", "Il est trop tard pour accepter cette qu\xEAte.");
  }
  const patch = { status: "accepted", acceptedAt: new Date(env.nowMs).toISOString() };
  await ctx.store.updateInstance(userId, instanceId, patch);
  return { ok: true, instance: { ...inst, ...patch } };
}
async function abandonQuest(ctx, userId, instanceId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail("no-character");
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail("not-found");
  if (inst.status !== "proposed" && inst.status !== "accepted") return fail("not-accepted");
  if (env.settings.hardcore && inst.status === "accepted") {
    const penalty = hardcorePenalty(inst);
    await ctx.store.insertXpEvents(userId, [eventFor(ctx, { instanceId, ability: inst.snapshot.ability, amount: -penalty, reason: "hardcore" }, env.today)]);
    await ctx.store.saveCharacter(userId, mergeChar(env.character, applyXp(env.character, inst.snapshot.ability, -penalty).character));
  }
  await ctx.store.updateInstance(userId, instanceId, { status: "abandoned" });
  return { ok: true, instance: { ...inst, status: "abandoned" } };
}
async function updateProgress(ctx, userId, instanceId, patch) {
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail("not-found");
  if (inst.status !== "accepted") return fail("not-accepted");
  const next = {};
  if (patch.progress !== void 0) next.progress = Math.max(0, patch.progress);
  if (patch.stepsDone) next.stepsDone = patch.stepsDone;
  await ctx.store.updateInstance(userId, instanceId, next);
  return { ok: true, instance: { ...inst, ...next } };
}
async function rerollQuest(ctx, userId, instanceId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail("no-character");
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail("not-found");
  if (inst.status === "completed" || inst.status === "expired" || inst.status === "abandoned") return fail("not-accepted");
  if (inst.progress > 0) return fail("invalid", "Une qu\xEAte d\xE9j\xE0 entam\xE9e ne peut pas \xEAtre relanc\xE9e.");
  const character = { ...env.character };
  if (character.rerollsDate !== env.today) {
    character.rerollsDate = env.today;
    character.rerollsUsed = 0;
  }
  let usedInspiration = false;
  if (character.rerollsUsed >= 1) {
    if (character.inspiration < 1) return fail("no-reroll", "Plus de relance gratuite aujourd\u2019hui et aucune Inspiration.");
    character.inspiration -= 1;
    usedInspiration = true;
  }
  character.rerollsUsed += 1;
  const [templates, prefs, history, same] = await Promise.all([
    ctx.store.listTemplates(userId),
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
    masteries: masteriesFor(character),
    templates,
    preferences: prefs,
    lastDrawn: lastDrawnMap(history, inst.period),
    exclude: same.map((i) => i.templateId),
    difficultyPlan: [inst.snapshot.difficulty],
    seedSuffix: `reroll-${character.rerollsUsed}-${ctx.uuid()}`,
    skipPinned: true
  });
  const t = draw.picks[0];
  if (!t) return fail("invalid", "Aucune autre qu\xEAte disponible.");
  const fresh = newInstance(ctx.uuid(), t, inst.period, inst.periodStart, inst.periodEnd, inst.status, new Date(env.nowMs).toISOString(), inst.free);
  await ctx.store.deleteInstance(userId, instanceId);
  await ctx.store.insertInstances(userId, [fresh]);
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, instance: fresh, usedInspiration };
}
async function completeQuestAction(ctx, userId, req) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail("no-character");
  const { store } = ctx;
  const inst = await store.getInstance(userId, req.instanceId);
  if (!inst) return fail("not-found");
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
    if (Number.isNaN(clientMs)) return fail("invalid");
    if (env.nowMs - clientMs > OFFLINE_MAX_DELAY_MS) return fail("too-late", "Cette validation hors ligne date de plus de 72 h et ne peut plus \xEAtre enregistr\xE9e.");
    completedMs = Math.min(clientMs, env.nowMs);
  }
  const completedDay = gameDate(completedMs, env.settings.timezone, env.settings.resetHour);
  if (!isDateInRange(completedDay, inst.periodStart, inst.periodEnd)) {
    return fail("out-of-period", "Cette qu\xEAte n\u2019est plus valable \xE0 cette date.");
  }
  const statusOk = inst.status === "accepted" || offline && inst.status === "expired";
  if (!statusOk) return fail("not-accepted");
  const masteries = masteriesFor(env.character);
  const check = completeQuest({
    character: env.character,
    masteries,
    pathAbility: pathAbilityFor(env.character),
    instance: { ...inst, status: "accepted" },
    useInspiration: req.useInspiration,
    progress: req.progress,
    stepsDone: req.stepsDone,
    journalText: req.journalText
  });
  if (!check.ok) return fail(check.error);
  const res = check.result;
  const completedAtIso = new Date(completedMs).toISOString();
  const levelUps = [...res.levelsGained];
  const abilityUps = [...res.abilityUps];
  let character = mergeChar(env.character, res.character);
  const custom = (await store.listTemplates(userId)).some((t) => t.id === inst.templateId && t.source === "custom");
  const events = splitXp(res.xpAwarded, inst.snapshot.ability, inst.snapshot.secondary).map(
    (p) => eventFor(ctx, { instanceId: inst.id, ability: p.ability, amount: p.amount, reason: "quest", custom }, completedDay)
  );
  await store.updateInstance(userId, inst.id, {
    status: "completed",
    progress: req.progress ?? inst.progress,
    stepsDone: req.stepsDone ?? inst.stepsDone,
    xpAwarded: res.xpAwarded,
    inspirationUsed: res.inspirationSpent,
    completedAt: completedAtIso
  });
  if (req.journalText?.trim()) {
    await store.saveJournal(userId, { id: ctx.uuid(), instanceId: inst.id, text: req.journalText.trim(), createdAt: completedAtIso });
  }
  await store.insertXpEvents(userId, events);
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
  await store.saveCharacter(userId, character);
  const unlockedNow = [];
  const already = new Set((await store.listUnlocked(userId)).map((u) => u.achievementId));
  for (let pass = 0; pass < 3; pass++) {
    const stats = await computePlayerStats(store, userId, character, env.settings);
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
      postId
    }
  };
}
async function undoQuest(ctx, userId, instanceId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail("no-character");
  const inst = await ctx.store.getInstance(userId, instanceId);
  if (!inst) return fail("not-found");
  if (inst.status !== "completed" || !canUndo(inst.completedAt, env.nowMs)) return fail("cannot-undo", "Cette qu\xEAte ne peut plus \xEAtre annul\xE9e (24 h maximum).");
  await ctx.store.insertXpEvents(
    userId,
    splitXp(inst.xpAwarded, inst.snapshot.ability, inst.snapshot.secondary).map(
      (p) => eventFor(ctx, { instanceId, ability: p.ability, amount: -p.amount, reason: "undo" }, env.today)
    )
  );
  const patch = { status: "accepted", xpAwarded: 0, inspirationUsed: false, completedAt: null };
  await ctx.store.updateInstance(userId, instanceId, patch);
  await ctx.store.detachPostsFromInstance(userId, instanceId);
  let character = env.character;
  if (inst.inspirationUsed) {
    character = { ...character, inspiration: Math.min(character.inspiration + 1, MAX_INSPIRATION) };
    await ctx.store.saveCharacter(userId, character);
  }
  const recomputed = await recomputeCharacter(ctx, userId) ?? character;
  return { ok: true, character: recomputed, instance: { ...inst, ...patch } };
}
async function choosePath(ctx, userId, pathId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail("no-character");
  if (env.character.level < PATH_LEVEL) return fail("level-too-low");
  if (env.character.pathId) return fail("nothing-pending");
  const cls = CLASSES.find((c) => c.id === env.character.classId);
  if (!cls?.paths.some((p) => p.id === pathId)) return fail("invalid");
  const character = { ...env.character, pathId };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, character };
}
async function chooseImprovement(ctx, userId, choice) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail("no-character");
  const c = env.character;
  if (pendingImprovements(c.level, c.improvementsChosen) < 1) return fail("nothing-pending");
  const add = emptyAbilityRecord(0);
  if ("plus2" in choice) add[choice.plus2] += 2;
  else {
    const [a, b] = choice.plus1;
    if (a === b) return fail("invalid", "Choisis deux caract\xE9ristiques diff\xE9rentes.");
    add[a] += 1;
    add[b] += 1;
  }
  const scores = abilityScores(c);
  for (const a of ABILITIES) {
    if (add[a] && scores[a] + add[a] > SOFT_CAP_SCORE) return fail("invalid", "Une caract\xE9ristique ne peut pas d\xE9passer 20 par am\xE9lioration.");
  }
  const improvements = { ...c.improvements };
  for (const a of ABILITIES) improvements[a] += add[a];
  const character = { ...c, improvements, improvementsChosen: c.improvementsChosen + 1 };
  await ctx.store.saveCharacter(userId, character);
  return { ok: true, character };
}
async function declareRest(ctx, userId) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail("no-character");
  const rest = await ctx.store.listRestDays(userId);
  if (rest.includes(env.today) || !canDeclareRest(rest, env.today)) return fail("rest-unavailable", "Tu as d\xE9j\xE0 utilis\xE9 ton jour de repos cette semaine.");
  await ctx.store.addRestDay(userId, env.today);
  const streak = await streakInfo(ctx.store, userId, env.settings, env.today);
  await ctx.store.saveCharacter(userId, { ...env.character, streakCurrent: streak.current });
  return { ok: true, day: env.today };
}
async function equipTitle(ctx, userId, title) {
  const env = await loadEnv(ctx, userId);
  if (!env) return fail("no-character");
  if (title) {
    const unlocked = new Set((await ctx.store.listUnlocked(userId)).map((u) => u.achievementId));
    const owned = ACHIEVEMENTS.some((a) => unlocked.has(a.id) && a.titleUnlocked === title);
    if (!owned) return fail("forbidden", "Ce titre n\u2019est pas encore d\xE9bloqu\xE9.");
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
  journal: []
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
  socialCountsFn;
  data(userId) {
    let d = this.users.get(userId);
    if (!d) {
      d = emptyUserData();
      this.users.set(userId, d);
    }
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
    return this.data(userId).character ? { ...this.data(userId).character } : null;
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
  async listTemplates(userId) {
    return [...this.catalog, ...this.data(userId).customTemplates];
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
var fail2 = (error, ctx) => {
  if (error) throw new Error(`${ctx}: ${error.message ?? error}`);
};
var PAGE = 1e3;
async function pageAll(build, ctx) {
  const out = [];
  for (let from = 0; from < 2e5; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    fail2(error, ctx);
    out.push(...data ?? []);
    if ((data?.length ?? 0) < PAGE) break;
  }
  return out;
}
var SupabaseStore = class {
  constructor(db) {
    this.db = db;
  }
  // ───── Personnage et réglages
  async getCharacter(userId) {
    const { data, error } = await this.db.from("characters").select("*").eq("profile_id", userId).maybeSingle();
    fail2(error, "characters.select");
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
      createdAt: data.created_at
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
        rerolls_used: c.rerollsUsed
      },
      { onConflict: "profile_id" }
    );
    fail2(error, "characters.upsert");
    if (typeof c.oath === "string") {
      const { error: e2 } = await this.db.from("settings").update({ oath: c.oath }).eq("profile_id", userId);
      fail2(e2, "settings.oath");
    }
  }
  async getSettings(userId) {
    const { data, error } = await this.db.from("settings").select("*").eq("profile_id", userId).maybeSingle();
    fail2(error, "settings.select");
    if (!data) {
      return {
        resetHour: 4,
        timezone: "Europe/Paris",
        dailyQuestCount: 6,
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
        lastRecapMonth: null
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
      lastRecapMonth: data.last_recap_month
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
        last_recap_month: s.lastRecapMonth ?? null
      },
      { onConflict: "profile_id" }
    );
    fail2(error, "settings.upsert");
  }
  // ───── Catalogue et préférences
  async listTemplates(userId) {
    const { data, error } = await this.db.from("quest_templates").select("*").eq("is_active", true).or(`source.eq.catalog,owner_id.eq.${userId}`);
    fail2(error, "templates.select");
    return (data ?? []).map((t) => ({
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
      ...t.secondary?.length ? { secondary: t.secondary } : {}
    }));
  }
  async getPreferences(userId) {
    const { data, error } = await this.db.from("quest_preferences").select("*").eq("profile_id", userId);
    fail2(error, "prefs.select");
    const out = {};
    for (const p of data ?? []) out[p.template_id] = { templateId: p.template_id, isFavorite: p.is_favorite, isExcluded: p.is_excluded, isPinned: p.is_pinned };
    return out;
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
      acceptedAt: r.accepted_at,
      completedAt: r.completed_at
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
      accepted_at: i.acceptedAt ?? null,
      completed_at: i.completedAt ?? null
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
    fail2(error, "instances.get");
    return data ? this.toInstance(data) : null;
  }
  async insertInstances(userId, instances) {
    if (!instances.length) return;
    const { error } = await this.db.from("quest_instances").upsert(instances.map((i) => this.fromInstance(userId, i)), { onConflict: "profile_id,template_id,period,period_start", ignoreDuplicates: true });
    fail2(error, "instances.insert");
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
    fail2(error, "instances.update");
  }
  async deleteInstance(userId, id) {
    const { error } = await this.db.from("quest_instances").delete().eq("profile_id", userId).eq("id", id);
    fail2(error, "instances.delete");
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
    fail2(error, "xp_events.insert");
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
    fail2(error, "unlocked.select");
    return (data ?? []).map((u) => ({ achievementId: u.achievement_id, unlockedAt: u.unlocked_at }));
  }
  async unlockAchievement(userId, achievementId, at) {
    const { error } = await this.db.from("unlocked_achievements").upsert({ profile_id: userId, achievement_id: achievementId, unlocked_at: at }, { onConflict: "profile_id,achievement_id", ignoreDuplicates: true });
    fail2(error, "unlocked.insert");
  }
  async listRestDays(userId) {
    const { data, error } = await this.db.from("rest_days").select("day").eq("profile_id", userId);
    fail2(error, "rest_days.select");
    return (data ?? []).map((r) => r.day);
  }
  async addRestDay(userId, day) {
    const { error } = await this.db.from("rest_days").upsert({ profile_id: userId, day }, { onConflict: "profile_id,day", ignoreDuplicates: true });
    fail2(error, "rest_days.insert");
  }
  async saveJournal(userId, e) {
    const { error } = await this.db.from("journal_entries").insert({ id: e.id, profile_id: userId, instance_id: e.instanceId, text: e.text, created_at: e.createdAt });
    fail2(error, "journal.insert");
  }
  async countJournal(userId) {
    const { count, error } = await this.db.from("journal_entries").select("id", { count: "exact", head: true }).eq("profile_id", userId);
    fail2(error, "journal.count");
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
    fail2(error, "posts.insert");
    if (d.mediaPaths?.length) {
      const { error: e2 } = await this.db.from("post_media").insert(d.mediaPaths.slice(0, 4).map((p, i) => ({ post_id: data.id, storage_path: p, position: i })));
      fail2(e2, "post_media.insert");
    }
    return data.id;
  }
  async detachPostsFromInstance(userId, instanceId) {
    const { data } = await this.db.from("posts").select("id,payload").eq("author_id", userId).eq("instance_id", instanceId);
    for (const p of data ?? []) {
      const payload = { ...p.payload ?? {}, questDetached: true };
      delete payload.xp;
      const { error } = await this.db.from("posts").update({ instance_id: null, payload }).eq("id", p.id);
      fail2(error, "posts.detach");
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
  BASE_XP,
  CLASSES,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  DIFFICULTY_SWORDS,
  EPIC_LEVEL,
  FORGE_LEVEL,
  IMPROVEMENT_LEVELS,
  JOURNAL_MIN_CHARS,
  LEVEL_XP,
  MAX_INSPIRATION,
  MAX_LEVEL,
  MAX_SCORE,
  MIN_SCORE,
  MemoryStore,
  OFFLINE_MAX_DELAY_MS,
  PATH_LEVEL,
  PERIODS,
  PERIOD_LABEL,
  PERIOD_MULTIPLIER,
  PERIOD_SHORT,
  PERIOD_TAB_LABEL,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  POINT_BUY_MAX,
  REACTION_EMOJI,
  REACTION_KINDS,
  REACTION_LABEL,
  SOFT_CAP_SCORE,
  SupabaseStore,
  TIER3_MIN_SCORE,
  TIER4_MIN_LEVEL,
  UNDO_WINDOW_MS,
  VALIDATION_LABEL,
  abandonQuest,
  abilityModifier,
  abilityProgress,
  abilityProgressOf,
  abilityScores,
  abilityUpgradeCost,
  acceptQuest,
  achievementProgress,
  addDays,
  applyXp,
  applyXpParts,
  availableAgainOn,
  buildRecap,
  canDeclareRest,
  canForge,
  canUndo,
  chooseImprovement,
  choosePath,
  completeQuest,
  completeQuestAction,
  computeBestStreak,
  computePlayerStats,
  computeStreak,
  conditionProgress,
  createCharacter,
  createRng,
  daysLeft,
  declareRest,
  defaultSettings,
  diffDays,
  drawQuests,
  emptyAbilityRecord,
  emptyStats,
  emptyUserData,
  endOfIsoWeek,
  endOfMonth,
  endOfQuarter,
  ensureQuests,
  equipTitle,
  evaluateAchievements,
  expiredPartialXp,
  gameDate,
  hardcorePenalty,
  hashString,
  inspirationAfterStreak,
  interpolate,
  isDateInRange,
  isReadyToComplete,
  isValidPointBuy,
  isoWeek,
  isoWeekday,
  lastAcceptDate,
  lastDrawnMap,
  levelFromXp,
  levelProgress,
  listDays,
  localDate,
  localMinutes,
  masteriesFor,
  masteriesOf,
  msUntilReset,
  newlyUnlocked,
  offlineCompletionAllowed,
  parseDateStr,
  partialXp,
  pathAbilityFor,
  pathAbilityOf,
  pendingImprovements,
  pendingPath,
  periodBounds,
  pickTavernMessage,
  pointBuySpent,
  proficiencyBonus,
  progressRatio,
  questCountFor,
  questLock,
  questXp,
  recomputeCharacter,
  rerollQuest,
  scoresFromAssessment,
  shuffle,
  splitXp,
  startOfIsoWeek,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  tierAt,
  tierUnlocked,
  toDateStr,
  totalAbilityScoreSum,
  undoQuest,
  unlocksAt,
  updateProgress,
  validationTarget,
  weekStartOf,
  weightedPick,
  xpBonusForMastery,
  xpShares
};
