/**
 * 'YYYY-MM-DD' calendar arithmetic that is independent of server timezone.
 * The client always sends its local `day`; we do date math on that string using a
 * UTC anchor at noon (avoids DST/offset edge cases). SSR-safe, pure.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const t = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(t);
}

/** Parse 'YYYY-MM-DD' to a UTC-noon timestamp (ms). Throws on malformed input. */
function toNoonUTC(day: string): number {
  if (!isValidDay(day)) throw new Error(`Invalid day: ${day}`);
  return Date.parse(`${day}T12:00:00Z`);
}

/** Format a UTC-noon timestamp back to 'YYYY-MM-DD'. */
function fromNoonUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(day: string, delta: number): string {
  return fromNoonUTC(toNoonUTC(day) + delta * DAY_MS);
}

/** Inclusive ascending list of days ending at `endDay`, `count` long. */
export function trailingDays(endDay: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(addDays(endDay, -i));
  return out;
}

/** Whole days from `a` to `b` (b − a). Negative if b precedes a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toNoonUTC(b) - toNoonUTC(a)) / DAY_MS);
}

/** Monday-anchored week start ('YYYY-MM-DD') for the week containing `day`. */
export function weekStart(day: string): string {
  const dow = new Date(toNoonUTC(day)).getUTCDay(); // 0=Sun..6=Sat
  const backToMonday = (dow + 6) % 7;
  return addDays(day, -backToMonday);
}
