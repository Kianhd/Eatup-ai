/**
 * Pure SVG geometry helpers for the hand-rolled charts. No DOM, no chart lib.
 * SSR-safe (no window/document). All functions are deterministic and total.
 */

export type ViewBox = { width: number; height: number };
export type Insets = { top: number; right: number; bottom: number; left: number };

export const DEFAULT_INSETS: Insets = { top: 12, right: 12, bottom: 28, left: 40 };

/** Linear interpolation domain→pixel. Degenerate domains map to the range midpoint. */
export function makeScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
) {
  const span = domainMax - domainMin;
  return (value: number): number => {
    if (span === 0) return (rangeMin + rangeMax) / 2;
    const t = (value - domainMin) / span;
    return rangeMin + t * (rangeMax - rangeMin);
  };
}

/** min/max of a numeric list with a safe fallback for empty input. */
export function extent(values: number[], fallback: [number, number] = [0, 1]): [number, number] {
  if (values.length === 0) return fallback;
  let lo = values[0];
  let hi = values[0];
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/** Pad a [min,max] domain by a fraction so marks don't touch the frame. */
export function padDomain(
  [lo, hi]: [number, number],
  frac = 0.08,
): [number, number] {
  if (lo === hi) {
    const bump = Math.abs(lo) * frac || 1;
    return [lo - bump, hi + bump];
  }
  const pad = (hi - lo) * frac;
  return [lo - pad, hi + pad];
}

/** Build an SVG polyline `points` attribute from (x,y) pixel pairs. */
export function toPolyline(points: Array<[number, number]>): string {
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(" ");
}

/** Build a smooth-ish path (straight segments; kept dependency-free & predictable). */
export function toPath(points: Array<[number, number]>): string {
  if (points.length === 0) return "";
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${round(x)} ${round(y)}`)
    .join(" ");
}

/** ~`count` "nice" tick values across a domain (rounded to 1/2/5·10^n steps). */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) return [min];
  const rawStep = (max - min) / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep) || 1)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) {
    ticks.push(round(v));
  }
  return ticks;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
