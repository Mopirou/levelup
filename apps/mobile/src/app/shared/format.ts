import { ABILITY_COLOR, ABILITY_LABEL, DIFFICULTY_LABEL, isReadyToComplete, type AbilityId, type Difficulty, type QuestInstance, type Period, type ValidationSpec } from '@levelup/engine';

export const ABILITY_ICON: Record<AbilityId, string> = {
  FOR: 'flame',
  DEX: 'palette',
  CON: 'footprints',
  INT: 'book-open',
  SAG: 'scale',
  CHA: 'heart',
};

export const nf = new Intl.NumberFormat('fr-FR');
export const fmt = (n: number): string => nf.format(Math.round(n));

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function relativeTime(iso: string, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - Date.parse(iso));
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'À l’instant';
  if (min < 60) return `Il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Hier';
  if (d < 7) return `Il y a ${d} jours`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export function dayLabel(iso: string, nowMs = Date.now()): string {
  const d = new Date(iso);
  const n = new Date(nowMs);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const y = new Date(nowMs - 86400000);
  if (same(d, n)) return 'Aujourd’hui';
  if (same(d, y)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function timeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: 'numeric', minute: '2-digit' }).replace(':', ':');
}

export function longDate(dateStr: string): string {
  const s = new Date(`${dateStr}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function countdown(ms: number): string {
  const totalMin = Math.max(Math.floor(ms / 60000), 0);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function questSubtitle(i: Pick<QuestInstance, 'snapshot'>): string {
  return `${ABILITY_LABEL[i.snapshot.ability]} · ${DIFFICULTY_LABEL[i.snapshot.difficulty]}`;
}

/** « 12 / 20 min » selon le type de validation. */
export function progressText(i: QuestInstance): string {
  const v = i.snapshot.validation;
  switch (v.type) {
    case 'simple':
      return i.status === 'completed' ? 'Accomplie' : 'À accomplir';
    case 'counter':
      return `${trim(i.progress)} / ${v.target} ${shortUnit(v.unit)}`;
    case 'timer':
      return `${trim(i.progress)} / ${v.minutes} min`;
    case 'steps':
      return `${(i.stepsDone ?? []).filter(Boolean).length} / ${v.steps.length} étapes`;
    case 'journal':
      return 'Journal';
  }
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const shortUnit = (u: string) => (u.length > 14 ? u.slice(0, 13) + '…' : u);

export function statusLabel(i: QuestInstance, ready: boolean): string {
  switch (i.status) {
    case 'completed':
      return 'Accomplie';
    case 'expired':
      return 'Expirée';
    case 'abandoned':
      return 'Abandonnée';
    case 'proposed':
      return 'À découvrir';
    case 'accepted':
      return ready ? 'Prête à valider' : i.progress > 0 || (i.stepsDone ?? []).some(Boolean) ? 'En cours' : 'À faire';
  }
}

export function validationTarget(v: ValidationSpec): number {
  switch (v.type) {
    case 'counter':
      return v.target;
    case 'timer':
      return v.minutes;
    case 'steps':
      return v.steps.length;
    default:
      return 1;
  }
}

export const PERIOD_NOUN: Record<Period, string> = { daily: 'du jour', weekly: 'de la semaine', monthly: 'du mois', epic: 'épique' };

export const abilityColor = (a: AbilityId): string => ABILITY_COLOR[a];

export function difficultyTone(d: Difficulty): string {
  return d === 'expert' ? 'gold' : d === 'high' ? 'mint' : '';
}

/** Quête de type compteur / chronomètre / étapes dont l'objectif est atteint (prête à valider). */
export function isQuestReady(i: QuestInstance): boolean {
  return i.status === 'accepted' && ['counter', 'timer', 'steps'].includes(i.snapshot.validation.type) && isReadyToComplete(i) === null;
}

/** Libellé du bouton principal d'une carte de quête (null = aucune action). */
export function questActionLabel(i: QuestInstance): string | null {
  switch (i.status) {
    case 'proposed':
      // Une quête de parcours « simple » se valide directement depuis sa proposition.
      return i.origin === 'track' && i.snapshot.validation.type === 'simple' ? 'Accomplir' : 'Accepter';
    case 'accepted': {
      const t = i.snapshot.validation.type;
      if (isQuestReady(i)) return 'Valider';
      if (t === 'simple') return 'Accomplir';
      if (t === 'journal') return 'Écrire';
      if (t === 'timer') return i.progress > 0 ? 'Continuer' : 'Démarrer';
      return i.progress > 0 || (i.stepsDone ?? []).some(Boolean) ? 'Continuer' : 'Commencer';
    }
    default:
      return null;
  }
}
