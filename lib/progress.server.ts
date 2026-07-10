/**
 * Stage-2 · A — Progress page server functions.
 *
 *   getProgress({ today })          → ProgressDto   (weights, trailing-14d macros, averages)
 *   getProgressInsights({ today })  → ProgressInsightsDto  (3 short AI insight strings)
 *
 * getProgressInsights is split from getProgress so the page renders charts immediately
 * and streams the (slower, rate-limitable) AI card in separately.
 *
 * INTEGRATION NOTES — assumed D1 column names (snake_case). Adjust the SELECTs if yours differ:
 *   weight_logs(user_id, day, weight_kg)
 *   meals(user_id, day, calories, protein)
 *   profiles(user_id, goal_weight_kg, calorie_target, protein_target)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId, getDb, GeminiError } from "./_integration";
import { aiJSON, toErrorCode } from "./ai.server";
import { isValidDay, trailingDays, weekStart } from "./day";
import type {
  ProgressDto,
  ProgressInsightsDto,
  WeightPoint,
  DayMacroPoint,
  WeeklyProteinPoint,
} from "./stage2.dto";

const dayInput = z.object({
  today: z.string().refine(isValidDay, "expected YYYY-MM-DD"),
});

const WINDOW_DAYS = 14;

/* ─────────────────────────────── getProgress ─────────────────────────────── */

export const getProgress = createServerFn({ method: "GET" })
  .inputValidator(dayInput)
  .handler(async ({ data }): Promise<ProgressDto> => {
    const userId = await requireUserId();
    const db = getDb();
    const { today } = data;

    const windowStart = trailingDays(today, WINDOW_DAYS)[0];

    const [weightRows, mealRows, profileRow] = await Promise.all([
      db
        .prepare(
          `SELECT day, weight_kg AS kg FROM weight_logs
             WHERE user_id = ? ORDER BY day ASC`,
        )
        .bind(userId)
        .all<{ day: string; kg: number }>(),
      db
        .prepare(
          `SELECT day,
                  CAST(COALESCE(SUM(calories), 0) AS REAL) AS kcal,
                  CAST(COALESCE(SUM(protein), 0)  AS REAL) AS protein
             FROM meals
             WHERE user_id = ? AND day >= ? AND day <= ?
             GROUP BY day`,
        )
        .bind(userId, windowStart, today)
        .all<{ day: string; kcal: number; protein: number }>(),
      db
        .prepare(
          `SELECT goal_weight_kg AS goalWeightKg,
                  calorie_target AS calorieTarget,
                  protein_target AS proteinTarget
             FROM profiles WHERE user_id = ? LIMIT 1`,
        )
        .bind(userId)
        .first<{
          goalWeightKg: number | null;
          calorieTarget: number | null;
          proteinTarget: number | null;
        }>(),
    ]);

    const weights: WeightPoint[] = (weightRows.results ?? []).map((r) => ({
      day: r.day,
      kg: num(r.kg),
    }));

    // Zero-fill the trailing window so the bar chart has one bar per calendar day.
    const mealByDay = new Map(
      (mealRows.results ?? []).map((r) => [r.day, r]),
    );
    const days: DayMacroPoint[] = trailingDays(today, WINDOW_DAYS).map((day) => {
      const hit = mealByDay.get(day);
      return {
        day,
        kcal: hit ? Math.round(num(hit.kcal)) : 0,
        protein: hit ? Math.round(num(hit.protein)) : 0,
      };
    });

    const calorieTarget = Math.max(0, Math.round(num(profileRow?.calorieTarget)));
    const proteinTarget = Math.max(0, Math.round(num(profileRow?.proteinTarget)));
    const goalWeightKg =
      profileRow?.goalWeightKg == null ? null : num(profileRow.goalWeightKg);

    return {
      weights,
      goalWeightKg,
      days,
      calorieTarget,
      proteinTarget,
      averages: computeAverages(days, weights),
    };
  });

/** Averages over days that actually have logged meals (empty days shouldn't drag the mean). */
function computeAverages(
  days: DayMacroPoint[],
  weights: WeightPoint[],
): ProgressDto["averages"] {
  const logged = days.filter((d) => d.kcal > 0 || d.protein > 0);
  const avgCalories14 = mean(logged.map((d) => d.kcal));
  const avgProtein14 = mean(logged.map((d) => d.protein));

  const weightChangeKg =
    weights.length >= 2
      ? round1(weights[weights.length - 1].kg - weights[0].kg)
      : null;

  // Weekly protein averages (Monday-anchored) over the logged days.
  const byWeek = new Map<string, number[]>();
  for (const d of logged) {
    const wk = weekStart(d.day);
    const bucket = byWeek.get(wk);
    if (bucket) bucket.push(d.protein);
    else byWeek.set(wk, [d.protein]);
  }
  const weeklyProtein: WeeklyProteinPoint[] = [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([week, arr]) => ({ weekStart: week, protein: Math.round(mean(arr)) }));

  return {
    avgCalories14: Math.round(avgCalories14),
    avgProtein14: Math.round(avgProtein14),
    weightChangeKg,
    weeklyProtein,
  };
}

/* ────────────────────────── getProgressInsights ──────────────────────────── */

const insightsSchema = z.object({
  insights: z.array(z.string().min(1).max(160)).length(3),
});

export const getProgressInsights = createServerFn({ method: "GET" })
  .inputValidator(dayInput)
  .handler(async ({ data }): Promise<ProgressInsightsDto> => {
    // Reuse the aggregates the chart endpoint already computes.
    const progress = await getProgress({ data });

    // Nothing meaningful to analyze yet — return deterministic guidance, skip the model.
    const loggedDays = progress.days.filter((d) => d.kcal > 0).length;
    if (loggedDays < 2 && progress.weights.length < 2) {
      return {
        insights: [
          "Not enough data yet — log a few days of meals and a weight or two.",
          "Aim to hit your protein target daily; it's the anchor of your plan.",
          "Consistency beats perfection — a logged day is a win.",
        ],
      };
    }

    const aggregates = {
      calorieTarget: progress.calorieTarget,
      proteinTarget: progress.proteinTarget,
      avgCalories14: progress.averages.avgCalories14,
      avgProtein14: progress.averages.avgProtein14,
      weightChangeKg: progress.averages.weightChangeKg,
      goalWeightKg: progress.goalWeightKg,
      latestWeightKg:
        progress.weights.length > 0
          ? progress.weights[progress.weights.length - 1].kg
          : null,
      daysLoggedOf14: loggedDays,
      weeklyProtein: progress.averages.weeklyProtein,
    };

    try {
      return await aiJSON<ProgressInsightsDto>({
        system:
          "You are Eatup, a sharp, encouraging nutrition coach. Given a user's 14-day " +
          "aggregates, return exactly 3 short, specific, non-repeating insights (max ~18 words " +
          "each). Reference the real numbers. Be direct and kind. No emojis, no medical claims.",
        user: JSON.stringify(aggregates),
        temperature: 0.5,
        responseSchema: {
          type: "OBJECT",
          properties: {
            insights: {
              type: "ARRAY",
              minItems: 3,
              maxItems: 3,
              items: { type: "STRING" },
            },
          },
          required: ["insights"],
        },
        validate: insightsSchema,
      });
    } catch (err) {
      // Surface a typed code the UI can render; never throw raw provider errors to the client.
      throw new GeminiError(
        toErrorCode(err),
        err instanceof Error ? err.message : "insight generation failed",
      );
    }
  });

/* ─────────────────────────────── helpers ─────────────────────────────────── */

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
