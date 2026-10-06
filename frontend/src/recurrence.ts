import type { Occurrence } from './types';

export type Repeat = 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly';
export const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
];
export const MAX_SESSIONS = 26;

/**
 * Builds the sessions of a booking from the first slot. Dates are stepped with calendar
 * arithmetic in the user's timezone, so a 10:00 session stays at 10:00 across DST changes.
 * `startLocal` / `endLocal` are datetime-local strings ("2026-10-14T10:00").
 */
export function buildOccurrences(
  startLocal: string,
  endLocal: string,
  repeat: Repeat,
  count: number,
): Occurrence[] {
  const start = new Date(startLocal);
  const end = new Date(endLocal);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];
  if (repeat === 'none') return [{ startTime: start.toISOString(), endTime: end.toISOString() }];

  const dayShift = Math.round(
    (new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime() -
      new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) /
      86400000,
  );
  const step = { daily: 1, weekdays: 1, weekly: 7, biweekly: 14 }[repeat];
  const out: Occurrence[] = [];
  const cursor = new Date(start);
  const n = Math.min(Math.max(count, 2), MAX_SESSIONS);
  while (out.length < n) {
    if (repeat === 'weekdays') while ([0, 6].includes(cursor.getDay())) cursor.setDate(cursor.getDate() + 1);
    const s = new Date(cursor);
    const e = new Date(cursor);
    e.setDate(e.getDate() + dayShift);
    e.setHours(end.getHours(), end.getMinutes(), 0, 0);
    out.push({ startTime: s.toISOString(), endTime: e.toISOString() });
    cursor.setDate(cursor.getDate() + step);
  }
  return out;
}

export const sessionLabel = (iso: string) =>
  new Date(iso).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
