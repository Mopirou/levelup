import { diffDays, gameDate } from '../dates';
import {
  SEASON_CHEST,
  SEASON_FRAME_DEFS,
  frameStyleOf,
  parseFrameStyle,
  rankSeason,
  seasonIndexOfKey,
  seasonInfo,
  seasonQualifies,
  seasonReward,
  type SeasonFrame,
  type SeasonInfo,
  type SeasonReward,
} from '../seasons';
import { Chest } from '../types';
import type { GameError, Result } from './game';
import { heroSnapshot } from './hero-stats';
import type { CharacterRecord, ServerContext, SeasonResultRecord, SettingsRecord } from './types';

// ───────────────────────── Saisons (V3) : actions ─────────────────────────
//
// Une saison dure 8 semaines. Chaque lecture de l'aventure publie la puissance du joueur pour la saison en cours
// (`recordPower`) ; la première lecture après la clôture d'une saison verse la récompense (cadre de portrait + coffre d'or)
// de façon idempotente (`evaluateSeasons`) : le coffre est inséré avec une clé fixe, puis le résultat est écrit une seule
// fois, et seul l'appel qui l'écrit applique le cadre et envoie la notification. Voir docs/DONJONS.md §9.

const fail = (error: GameError, message?: string) => ({ ok: false as const, error, message });

/** Publie la puissance (PP) du joueur : sur son personnage (carte de compagnon) et pour la saison en cours (classement). */
export async function recordPower(ctx: ServerContext, userId: string, character: CharacterRecord, power: number, today: string): Promise<CharacterRecord> {
  const next = character.power === power ? character : { ...character, power };
  if (next !== character) await ctx.store.saveCharacter(userId, next);
  await ctx.store.upsertSeasonScore(userId, seasonInfo(today).key, power, today);
  return next;
}

/** Recalcule et publie la puissance d'un joueur (après un niveau gagné, par exemple). */
export async function syncHeroPower(ctx: ServerContext, userId: string): Promise<void> {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return;
  const snap = await heroSnapshot(ctx.store, userId, character);
  await recordPower(ctx, userId, character, snap.power.total, gameDate(ctx.now(), settings.timezone, settings.resetHour));
}

/** Résultat d'une saison clôturée, tel que l'app l'affiche. */
export interface SeasonResultView {
  seasonKey: string;
  name: string;
  rank: number | null;
  participants: number;
  power: number;
  frame: SeasonFrame | null;
  /** Coffre d'or reçu avec la récompense */
  chest: boolean;
}

function viewOfResult(r: SeasonResultRecord): SeasonResultView {
  const idx = seasonIndexOfKey(r.seasonKey) ?? 0;
  return {
    seasonKey: r.seasonKey,
    name: `Saison ${idx}`,
    rank: r.rank,
    participants: r.participants,
    power: r.power,
    frame: (r.frame as SeasonFrame | null) ?? null,
    chest: r.frame !== null,
  };
}

/**
 * Évalue les saisons terminées dont le joueur n'a pas encore de résultat : cadre de portrait et coffre d'or pour qui a joué
 * au moins une semaine, silencieusement rien sinon. Idempotent et sans cron : peut être appelé à chaque lecture.
 */
export async function evaluateSeasons(
  ctx: ServerContext,
  userId: string,
  character: CharacterRecord,
  today: string,
  settings: Pick<SettingsRecord, 'leaderboardOptIn'>,
): Promise<{ character: CharacterRecord; evaluated: SeasonResultView[] }> {
  const current = seasonInfo(today);
  const [scores, results] = await Promise.all([ctx.store.listSeasonScores(userId), ctx.store.listSeasonResults(userId)]);
  const done = new Set(results.map((r) => r.seasonKey));
  const due = scores
    .filter((s) => !done.has(s.seasonKey) && (seasonIndexOfKey(s.seasonKey) ?? Infinity) < current.index)
    .sort((a, b) => (seasonIndexOfKey(a.seasonKey) ?? 0) - (seasonIndexOfKey(b.seasonKey) ?? 0));
  const evaluated: SeasonResultView[] = [];
  const nowIso = new Date(ctx.now()).toISOString();
  let hero = character;
  for (const score of due) {
    const qualifies = seasonQualifies(score.firstDay, score.lastDay);
    let rank: number | null = null;
    let participants = 0;
    let reward: SeasonReward | null = null;
    if (qualifies) {
      const board = settings.leaderboardOptIn ? rankSeason(await ctx.store.seasonRanking(userId, score.seasonKey)) : [];
      participants = board.length;
      rank = board.find((r) => r.profileId === userId)?.rank ?? null;
      reward = seasonReward(rank, participants);
      // Coffre d'abord, avec une clé fixe : rejoué, il n'est jamais donné deux fois.
      const chest: Chest = { id: ctx.uuid(), rarity: SEASON_CHEST, source: 'season', sourceKey: score.seasonKey, instanceId: null, createdAt: nowIso, openedAt: null };
      await ctx.store.insertChest(userId, chest);
    }
    const record: SeasonResultRecord = { seasonKey: score.seasonKey, rank, participants, power: score.power, frame: reward?.frame ?? null, createdAt: nowIso };
    if (!(await ctx.store.insertSeasonResult(userId, record))) continue;
    const view = viewOfResult(record);
    evaluated.push(view);
    if (reward) {
      hero = { ...hero, frameStyle: frameStyleOf(score.seasonKey, reward.frame) };
      await ctx.store.saveCharacter(userId, hero);
      try {
        await ctx.store.notify(userId, 'season_end', { season: score.seasonKey, name: view.name, rank, participants, frame: reward.frame });
      } catch (e) {
        // Une notification manquée ne doit jamais bloquer la lecture de l'aventure.
        console.error('season notify', e);
      }
    }
  }
  return { character: hero, evaluated };
}

// ───────────────────────── État de la saison ─────────────────────────

export interface SeasonState {
  season: SeasonInfo;
  /** Ma puissance publiée pour la saison */
  power: number;
  /** J'accepte d'apparaître dans le classement entre amis (réglage « classement ») */
  optedIn: boolean;
  /** Mon rang provisoire parmi les amis classés et leur nombre (null / 0 si je ne suis pas classé) */
  rank: number | null;
  participants: number;
  /** Jours de jeu entre ma première et ma dernière publication cette saison */
  daysPlayed: number;
  /** J'ai joué assez pour toucher la récompense (une semaine) */
  qualifies: boolean;
  /** Récompense si la saison s'arrêtait maintenant */
  reward: SeasonReward & { frameLabel: string; frameGlyph: string; frameColor: string };
  /** Mon cadre de portrait actuel (gagné en fin de saison) */
  frame: { season: string; frame: SeasonFrame; label: string; glyph: string; color: string } | null;
  /** Saisons passées, de la plus récente à la plus ancienne */
  results: SeasonResultView[];
  /** Résultats évalués par cet appel (à annoncer une fois) */
  evaluated: SeasonResultView[];
}

/** État de la saison : jours restants, mon rang, la récompense en jeu, les saisons passées. Évalue les saisons terminées. */
export async function getSeasonState(ctx: ServerContext, userId: string): Promise<Result<{ state: SeasonState; character: CharacterRecord }>> {
  const [character, settings] = await Promise.all([ctx.store.getCharacter(userId), ctx.store.getSettings(userId)]);
  if (!character) return fail('no-character');
  const today = gameDate(ctx.now(), settings.timezone, settings.resetHour);
  const season = seasonInfo(today);
  const evaluation = await evaluateSeasons(ctx, userId, character, today, settings);
  const snap = await heroSnapshot(ctx.store, userId, evaluation.character);
  const hero = await recordPower(ctx, userId, evaluation.character, snap.power.total, today);
  const [scores, board, results] = await Promise.all([
    ctx.store.listSeasonScores(userId),
    ctx.store.seasonRanking(userId, season.key),
    ctx.store.listSeasonResults(userId),
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
      results: results
        .map(viewOfResult)
        .sort((a, b) => (seasonIndexOfKey(b.seasonKey) ?? 0) - (seasonIndexOfKey(a.seasonKey) ?? 0)),
      evaluated: evaluation.evaluated,
    },
  };
}
