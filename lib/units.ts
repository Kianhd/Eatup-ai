/**
 * Pure unit conversion + display helpers. Used app-wide so the UI can *show* imperial
 * while ALL persistence stays metric. No DOM, no side effects — unit-testable.
 */

export type Units = "metric" | "imperial";

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const IN_PER_FT = 12;

/* ── Weight ─────────────────────────────────────────────────────────────────── */

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/* ── Height ─────────────────────────────────────────────────────────────────── */

export function cmToInches(cm: number): number {
  return cm / CM_PER_IN;
}

/** Round to whole inches, then split to feet+inches, carrying 12" → +1'. */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  let totalInches = Math.round(cmToInches(cm));
  let feet = Math.floor(totalInches / IN_PER_FT);
  let inches = totalInches - feet * IN_PER_FT;
  if (inches === IN_PER_FT) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return (feet * IN_PER_FT + inches) * CM_PER_IN;
}

/* ── Display formatters ─────────────────────────────────────────────────────── */

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Weight for display in the user's units. Always pass metric kg in. */
export function formatWeight(kg: number, units: Units): string {
  return units === "imperial" ? `${round1(kgToLb(kg))} lb` : `${round1(kg)} kg`;
}

/** Height for display in the user's units. Always pass metric cm in. */
export function formatHeight(cm: number, units: Units): string {
  if (units === "imperial") {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}

/** Convenience for form inputs: the numeric value to show for a metric weight. */
export function weightInputValue(kg: number, units: Units): number {
  return units === "imperial" ? round1(kgToLb(kg)) : round1(kg);
}

/** Inverse of weightInputValue: parse a units-native input back to metric kg. */
export function weightInputToKg(value: number, units: Units): number {
  return units === "imperial" ? lbToKg(value) : value;
}
