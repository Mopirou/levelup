import { Period } from './types';

// Les périodes sont calculées sur des dates locales YYYY-MM-DD (RG-04), jamais sur des horodatages.

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDateStr(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function utc(s: string): number {
  const { y, m, d } = parseDateStr(s);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const dt = new Date(ms);
  return toDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(s: string, n: number): string {
  return fromUtc(utc(s) + n * 86400000);
}

export function diffDays(a: string, b: string): number {
  return Math.round((utc(a) - utc(b)) / 86400000);
}

/** 1 = lundi … 7 = dimanche */
export function isoWeekday(s: string): number {
  const dow = new Date(utc(s)).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function startOfIsoWeek(s: string): string {
  return addDays(s, -(isoWeekday(s) - 1));
}

export function endOfIsoWeek(s: string): string {
  return addDays(startOfIsoWeek(s), 6);
}

export function startOfMonth(s: string): string {
  const { y, m } = parseDateStr(s);
  return toDateStr(y, m, 1);
}

export function endOfMonth(s: string): string {
  const { y, m } = parseDateStr(s);
  return fromUtc(Date.UTC(y, m, 0));
}

export function startOfQuarter(s: string): string {
  const { y, m } = parseDateStr(s);
  return toDateStr(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
}

export function endOfQuarter(s: string): string {
  const { y, m } = parseDateStr(s);
  const qEndMonth = Math.floor((m - 1) / 3) * 3 + 3;
  return fromUtc(Date.UTC(y, qEndMonth, 0));
}

/** Numéro de semaine ISO et année ISO. */
export function isoWeek(s: string): { year: number; week: number } {
  const d = new Date(utc(s));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export interface PeriodBounds {
  start: string;
  end: string;
}

export function periodBounds(period: Period, gameDate: string): PeriodBounds {
  switch (period) {
    case 'daily':
      return { start: gameDate, end: gameDate };
    case 'weekly':
      return { start: startOfIsoWeek(gameDate), end: endOfIsoWeek(gameDate) };
    case 'monthly':
      return { start: startOfMonth(gameDate), end: endOfMonth(gameDate) };
    case 'epic':
      return { start: startOfQuarter(gameDate), end: endOfQuarter(gameDate) };
  }
}

function localParts(ms: number, tz: string): { date: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
  return { date: `${p['year']}-${p['month']}-${p['day']}`, hour: Number(p['hour']), minute: Number(p['minute']) };
}

/** Date de jeu : une action avant l'heure de reset compte pour la veille (RG défaut 4 h). */
export function gameDate(nowMs: number, tz: string, resetHour: number): string {
  const { date, hour } = localParts(nowMs, tz);
  return hour < resetHour ? addDays(date, -1) : date;
}

/** Heure locale courante en minutes depuis minuit (dans le fuseau). */
export function localMinutes(nowMs: number, tz: string): number {
  const { hour, minute } = localParts(nowMs, tz);
  return hour * 60 + minute;
}

/** Date locale civile (sans décalage de reset). */
export function localDate(nowMs: number, tz: string): string {
  return localParts(nowMs, tz).date;
}

/** Millisecondes avant le prochain reset (prochain `resetHour` local). */
export function msUntilReset(nowMs: number, tz: string, resetHour: number): number {
  const minutes = localMinutes(nowMs, tz);
  const target = resetHour * 60;
  let diff = target - minutes;
  if (diff <= 0) diff += 24 * 60;
  return diff * 60000;
}

/** Jours restants (inclus aujourd'hui) avant la fin de la période. */
export function daysLeft(periodEnd: string, today: string): number {
  return Math.max(diffDays(periodEnd, today) + 1, 0);
}

export function isDateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function listDays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Dernier jour pour accepter une quête (RG-08) : vendredi pour la semaine, J-7 pour le mois. */
export function lastAcceptDate(period: Period, periodStart: string, periodEnd: string): string {
  switch (period) {
    case 'daily':
      return periodEnd;
    case 'weekly':
      return addDays(periodStart, 4);
    case 'monthly':
      return addDays(periodEnd, -7);
    case 'epic':
      return addDays(periodEnd, -14);
  }
}
