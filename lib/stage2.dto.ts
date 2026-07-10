/**
 * Stage-2 DTOs — flat, JSON-serializable shapes shared by server fns and client components.
 * No class instances, no `unknown`. Reuses the Stage-1 DTO vocabulary where possible.
 */

/* ── A. Progress ─────────────────────────────────────────────────────────────── */

export type WeightPoint = { day: string; kg: number };
export type DayMacroPoint = { day: string; kcal: number; protein: number };
export type WeeklyProteinPoint = { weekStart: string; protein: number }; // avg g/day that week

export type ProgressAverages = {
  avgCalories14: number; // mean daily kcal over the trailing 14d that have meals
  avgProtein14: number; // mean daily protein (g) over the same window
  weightChangeKg: number | null; // last weight − first weight in range (null if <2 points)
  weeklyProtein: WeeklyProteinPoint[]; // weekly protein averages (oldest → newest)
};

export type ProgressDto = {
  weights: WeightPoint[]; // ascending by day
  goalWeightKg: number | null; // reference line
  days: DayMacroPoint[]; // trailing 14 calendar days, ascending, zero-filled
  calorieTarget: number; // reference line for the calories bar chart
  proteinTarget: number;
  averages: ProgressAverages;
};

export type ProgressInsightsDto = {
  insights: string[]; // exactly 3 short strings
};

/* ── B. Daily summary ────────────────────────────────────────────────────────── */

export type DailySummaryContent = {
  wentWell: string;
  improve: string;
  tomorrow: string[]; // 1–3 concrete actions
  motivation: string;
  goalPct: number; // 0..100, how on-track the day was vs targets
};

export type DailySummaryDto = {
  day: string;
  content: DailySummaryContent;
  createdAt: string; // ISO
  generated: boolean; // true if freshly generated this request, false if served from cache
};

/* ── C. Monthly check-in ─────────────────────────────────────────────────────── */

export type MacroTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  water: number;
};

export type CheckinDto = {
  day: string;
  weightKg: number;
  previousWeightKg: number | null; // most recent prior weight log
  trend: {
    changeKg: number | null; // current − previous (null if no prior)
    weeklyChangeKg: number; // planned pace from computeTargets
    etaWeeks: number | null; // updated ETA to goal weight
  };
  previousTargets: MacroTargets; // from the stored profile before recompute
  newTargets: MacroTargets; // recomputed
  diff: MacroTargets; // newTargets − previousTargets (signed)
  commentary: string; // AI trend commentary
};

/* ── D. Food suggestions ─────────────────────────────────────────────────────── */

export type FoodSuggestion = {
  food: string;
  why: string;
  approxKcal: number;
  approxProtein: number;
};

export type SuggestionsDto = {
  remaining: MacroTargets; // remaining macros for the day (clamped at 0)
  suggestions: FoodSuggestion[]; // 3–5 items
};

/* ── Shared error envelope for AI-backed calls ──────────────────────────────── */

export type Stage2ErrorCode = "rate_limit" | "bad_output" | "unknown";
