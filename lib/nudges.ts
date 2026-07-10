/**
 * Stage-3 · H — Smart in-app nudges. Pure & unit-testable (no DOM, no I/O).
 *
 * computeNudge(input) returns the single highest-priority nudge, or null. Priority order
 * (first match wins): breakfast → protein → water → weigh-in. Each has a time-of-day gate
 * and respects the matching reminder setting. The banner handles dismissal/suppression.
 *
 * NOTE: ">30 days since last weight_log" needs a timestamp the base inputs don't carry, so
 * `lastWeightLoggedAt` is an explicit optional input — the shell supplies it (null = never
 * logged → nudge). Everything else derives from profile/totals/meals.
 */

import type { DayTotals, MealDto, ProfileDto } from "./dto";

export type NudgeKind = "breakfast" | "protein" | "water" | "weighin";
export type NudgeAction = "open-capture" | "open-checkin";

export type Nudge = {
  kind: NudgeKind;
  key: string; // stable per period, e.g. "protein:2026-07-10" — used for dismissal suppression
  title: string;
  body: string;
  action?: NudgeAction;
  ctaLabel?: string;
};

export type NudgeSettings = {
  remindMeals: boolean;
  remindWater: boolean;
  remindProtein: boolean;
  remindWeighin: boolean;
};

export type NudgeInput = {
  now: Date;
  profile: Pick<ProfileDto, "proteinTarget" | "waterTarget">;
  totals: DayTotals;
  meals: Pick<MealDto, "id">[];
  settings: NudgeSettings;
  /** ISO or 'YYYY-MM-DD' of the most recent weight log; null/undefined = never logged. */
  lastWeightLoggedAt?: string | null;
};

const BREAKFAST_HOUR = 11;
const PROTEIN_HOUR = 15;
const WATER_HOUR = 16;
const PROTEIN_FLOOR = 0.4; // <40% of target
const WATER_FLOOR = 0.5; // <50% of target
const WEIGHIN_DAYS = 30;

export function computeNudge(input: NudgeInput): Nudge | null {
  const { now, profile, totals, meals, settings } = input;
  const hour = now.getHours();
  const day = dayKey(now);

  // 1. No meals logged by late morning.
  if (settings.remindMeals && meals.length === 0 && hour >= BREAKFAST_HOUR) {
    return {
      kind: "breakfast",
      key: `breakfast:${day}`,
      title: "Time to fuel up",
      body: "You haven't logged anything yet today. Snap your first meal to stay on track.",
      action: "open-capture",
      ctaLabel: "Log a meal",
    };
  }

  // 2. Protein well behind target in the afternoon.
  if (
    settings.remindProtein &&
    hour >= PROTEIN_HOUR &&
    profile.proteinTarget > 0 &&
    totals.protein < PROTEIN_FLOOR * profile.proteinTarget
  ) {
    const pct = Math.round((totals.protein / profile.proteinTarget) * 100);
    const remaining = Math.max(0, Math.round(profile.proteinTarget - totals.protein));
    const [f1, f2] = pickProteinFoods(remaining);
    return {
      kind: "protein",
      key: `protein:${day}`,
      title: "Protein's running low",
      body: `You're at ${pct}% of your protein goal. Try ${f1} or ${f2} to catch up.`,
      action: "open-capture",
      ctaLabel: "Log a meal",
    };
  }

  // 3. Under half your water by late afternoon.
  if (
    settings.remindWater &&
    hour >= WATER_HOUR &&
    profile.waterTarget > 0 &&
    totals.water < WATER_FLOOR * profile.waterTarget
  ) {
    return {
      kind: "water",
      key: `water:${day}`,
      title: "Hydration check",
      body: `You're at ${totals.water} of ${profile.waterTarget} glasses. A couple more before evening helps.`,
    };
  }

  // 4. Overdue for a weigh-in.
  if (settings.remindWeighin) {
    const days = daysSince(input.lastWeightLoggedAt, now);
    if (days === null || days > WEIGHIN_DAYS) {
      return {
        kind: "weighin",
        key: `weighin:${day}`,
        title: "Time for a weigh-in",
        body:
          days === null
            ? "Log your weight to start tracking progress and keep your targets accurate."
            : "It's been over a month since your last weigh-in. A quick check-in keeps your targets accurate.",
        action: "open-checkin",
        ctaLabel: "Check in",
      };
    }
  }

  return null;
}

/** Two concrete high-protein foods (with ~grams) that help close the remaining gap. */
export function pickProteinFoods(remainingG: number): [string, string] {
  const foods: Array<{ name: string; g: number }> = [
    { name: "Greek yogurt", g: 17 },
    { name: "2 eggs", g: 12 },
    { name: "cottage cheese", g: 14 },
    { name: "a scoop of whey", g: 24 },
    { name: "a chicken breast", g: 43 },
    { name: "a tin of tuna", g: 25 },
  ];
  // Prefer the two largest options that individually don't overshoot the gap; if the gap is
  // tiny, fall back to the two smallest. Deterministic (no randomness).
  const fitting = foods.filter((f) => f.g <= remainingG).sort((a, b) => b.g - a.g);
  const chosen = (fitting.length >= 2 ? fitting : [...foods].sort((a, b) => a.g - b.g)).slice(0, 2);
  return [label(chosen[0]), label(chosen[1])];
}

function label(f: { name: string; g: number }): string {
  return `${f.name} (~${f.g}g)`;
}

/** Whole days between a past date and now; null if the timestamp is missing/unparseable. */
export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00Z` : iso;
  const then = Date.parse(normalized);
  if (!Number.isFinite(then)) return null;
  const ms = now.getTime() - then;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
