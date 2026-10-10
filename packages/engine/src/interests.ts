import type { QuestSnapshot, QuestTemplate, ValidationSpec } from './types';

// ───────────────────────── Centres d'intérêt ─────────────────────────
//
// Un centre d'intérêt est une discipline guidée (« cuisine », « programmation »…),
// éventuellement affinée sur une activité précise (« langues:espagnol »).
// Clés stockées dans les réglages : `theme` ou `theme:activite`.

export const slugify = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const interestKey = (theme: string, activityName?: string): string => (activityName ? `${theme}:${slugify(activityName)}` : theme);

export const MAX_INTERESTS = 80;

/** Garde uniquement des clés bien formées, sans doublon. */
export function sanitizeInterests(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out = new Set<string>();
  for (const v of list) {
    if (typeof v === 'string' && /^[a-z0-9-]{1,40}(:[a-z0-9-]{1,60})?$/.test(v)) out.add(v);
    if (out.size >= MAX_INTERESTS) break;
  }
  return [...out];
}

/** Activité d'une quête guidée (identifiant g-{discipline}-{activité}-t{palier}), null pour une quête générale. */
export function activityOf(t: Pick<QuestTemplate, 'id' | 'theme'>): string | null {
  if (!t.theme) return null;
  const prefix = `g-${t.theme}-`;
  if (!t.id.startsWith(prefix)) return null;
  return t.id.slice(prefix.length).replace(/-t\d$/, '') || null;
}

/**
 * Poids d'une quête au tirage selon les centres d'intérêt.
 * Sans préférence, les disciplines guidées sont plutôt rares ; avec des préférences,
 * celles qui plaisent passent devant et les autres s'effacent presque.
 * @deprecated n'oriente plus le tirage (les parcours de discipline remplacent les centres d'intérêt) ; conservé pour compatibilité.
 */
export function interestWeight(t: Pick<QuestTemplate, 'id' | 'theme'>, interests: readonly string[] | undefined): number {
  if (!t.theme) return 1;
  if (!interests?.length) return 0.35;
  const activity = activityOf(t);
  if (activity && interests.includes(`${t.theme}:${activity}`)) return 6;
  if (interests.includes(t.theme)) {
    // La discipline est suivie ; si des activités précises sont cochées, les autres comptent moins.
    const precise = interests.some((k) => k.startsWith(`${t.theme}:`));
    return precise ? 1.2 : 3;
  }
  return 0.08;
}

// ───────────────────────── Trop dur / trop facile ─────────────────────────

export type TuneLevel = -1 | 0 | 1;
export type TuneDirection = 'easier' | 'harder';

export const TUNE_FACTOR: Record<TuneLevel, number> = { [-1]: 0.5, 0: 1, 1: 1.5 };

/** Arrondit une cible à une valeur « naturelle » : 12,5 → 13 ; 37,5 → 40 ; 120 → 120. */
function niceTarget(n: number): number {
  if (n >= 500) return Math.round(n / 50) * 50;
  if (n >= 100) return Math.round(n / 10) * 10;
  if (n >= 30) return Math.round(n / 5) * 5;
  return Math.max(1, Math.round(n));
}

/** Cible numérique d'une validation ajustable (compteur ou minuteur), sinon null. */
export function tunableTarget(v: ValidationSpec): number | null {
  if (v.type === 'counter') return v.target;
  if (v.type === 'timer') return v.minutes;
  return null;
}

export function tunedTarget(base: number, tune: TuneLevel): number {
  return tune === 0 ? base : niceTarget(base * TUNE_FACTOR[tune]);
}

export function withTarget(v: ValidationSpec, target: number): ValidationSpec {
  if (v.type === 'counter') return { ...v, target };
  if (v.type === 'timer') return { ...v, minutes: target };
  return v;
}

/** Cible d'origine de la quête, avant tout ajustement. */
export function baseTargetOf(s: Pick<QuestSnapshot, 'validation' | 'tune' | 'baseTarget'>): number | null {
  return s.baseTarget ?? tunableTarget(s.validation);
}

/** Quête telle qu'elle est tirée pour ce niveau d'ajustement mémorisé. */
export function tunedSnapshot<S extends Pick<QuestSnapshot, 'validation'>>(snap: S, base: ValidationSpec, tune: TuneLevel): S & Pick<QuestSnapshot, 'tune' | 'baseTarget'> {
  const baseTarget = tunableTarget(base);
  if (baseTarget === null || tune === 0) return { ...snap, validation: base };
  const target = tunedTarget(baseTarget, tune);
  if (target === baseTarget) return { ...snap, validation: base };
  return { ...snap, validation: withTarget(base, target), tune, baseTarget };
}

/** Niveau suivant après un appui sur « trop facile » / « trop dur » (null si impossible). */
export function nextTune(current: number | undefined, base: ValidationSpec, dir: TuneDirection): TuneLevel | null {
  const baseTarget = tunableTarget(base);
  if (baseTarget === null) return null;
  const cur = (current ?? 0) as TuneLevel;
  const next = Math.max(-1, Math.min(1, cur + (dir === 'easier' ? -1 : 1))) as TuneLevel;
  if (next === cur) return null;
  if (next !== 0 && tunedTarget(baseTarget, next) === baseTarget) return null;
  return next;
}

/** Multiplicateur d'XP d'une quête ajustée : proportionnel à l'effort demandé (la moitié de l'effort donne la moitié de l'XP). */
export function tuneXpScale(s: Pick<QuestSnapshot, 'validation' | 'baseTarget'>): number {
  const base = s.baseTarget;
  const now = tunableTarget(s.validation);
  if (!base || !now) return 1;
  return Math.min(Math.max(now / base, 0.4), 1.6);
}
