/**
 * Stage-2 · C — Monthly check-in.
 *
 *   saveCheckin({ weightKg, day }) → CheckinDto
 *     1. Records the weigh-in in weight_logs (upsert per user+day, no schema change needed).
 *     2. Recomputes targets with Stage-1 computeTargets(OnboardingInput) using the new weight.
 *     3. Persists the new weight + targets on the profile.
 *     4. Returns AI trend commentary (previous vs current, pace vs plan, updated ETA) + diff.
 *
 * INTEGRATION NOTES — assumed D1 columns:
 *   profiles(user_id, name, age, gender, height_cm, weight_kg, goal_weight_kg,
 *            activity_level, workout_days, goal, speed,
 *            calorie_target, protein_target, carbs_target, fat_target, water_target)
 *   weight_logs(user_id, day, weight_kg)
 *   computeTargets: signature provided by product owner (OnboardingInput → Targets).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  requireUserId,
  getDb,
  computeTargets,
  GeminiError,
  type OnboardingInput,
  type Targets,
} from "./_integration";
import { aiJSON, toErrorCode } from "./ai.server";
import { isValidDay } from "./day";
import type { CheckinDto, MacroTargets } from "./stage2.dto";

const input = z.object({
  weightKg: z.number().positive().max(500),
  day: z.string().refine(isValidDay, "expected YYYY-MM-DD"),
});

const commentarySchema = z.object({
  commentary: z.string().min(1).max(600),
});

type ProfileRow = {
  name: string;
  age: number;
  gender: "male" | "female";
  height_cm: number;
  weight_kg: number;
  goal_weight_kg: number;
  activity_level: OnboardingInput["activityLevel"];
  workout_days: number;
  goal: OnboardingInput["goal"];
  speed: OnboardingInput["speed"];
  calorie_target: number;
  protein_target: number;
  carbs_target: number;
  fat_target: number;
  water_target: number;
};

export const saveCheckin = createServerFn({ method: "POST" })
  .inputValidator(input)
  .handler(async ({ data }): Promise<CheckinDto> => {
    const userId = await requireUserId();
    const db = getDb();
    const { weightKg, day } = data;

    const profile = await db
      .prepare(
        `SELECT name, age, gender, height_cm, weight_kg, goal_weight_kg,
                activity_level, workout_days, goal, speed,
                calorie_target, protein_target, carbs_target, fat_target, water_target
           FROM profiles WHERE user_id = ? LIMIT 1`,
      )
      .bind(userId)
      .first<ProfileRow>();

    if (!profile) {
      // Auth guard passed but no profile row — treat as a client/setup error, not a 500.
      throw new Error("no_profile");
    }

    // Most recent prior weigh-in (before persisting this one), for trend commentary.
    const prior = await db
      .prepare(
        `SELECT weight_kg AS kg FROM weight_logs
           WHERE user_id = ? AND day < ? ORDER BY day DESC LIMIT 1`,
      )
      .bind(userId, day)
      .first<{ kg: number }>();
    const previousWeightKg = prior ? num(prior.kg) : null;

    // 1. Upsert the weigh-in without relying on a unique constraint we can't add.
    const existingSameDay = await db
      .prepare(`SELECT 1 AS hit FROM weight_logs WHERE user_id = ? AND day = ? LIMIT 1`)
      .bind(userId, day)
      .first<{ hit: number }>();
    if (existingSameDay) {
      await db
        .prepare(`UPDATE weight_logs SET weight_kg = ? WHERE user_id = ? AND day = ?`)
        .bind(weightKg, userId, day)
        .run();
    } else {
      await db
        .prepare(`INSERT INTO weight_logs (user_id, day, weight_kg) VALUES (?, ?, ?)`)
        .bind(userId, day, weightKg)
        .run();
    }

    // 2. Recompute targets from the profile + new weight.
    const onboarding: OnboardingInput = {
      name: profile.name,
      age: profile.age,
      gender: profile.gender,
      heightCm: profile.height_cm,
      weightKg, // the new weigh-in
      goalWeightKg: profile.goal_weight_kg,
      activityLevel: profile.activity_level,
      workoutDays: profile.workout_days,
      goal: profile.goal,
      speed: profile.speed,
    };
    const next: Targets = computeTargets(onboarding);

    const previousTargets: MacroTargets = {
      calories: Math.round(num(profile.calorie_target)),
      protein: Math.round(num(profile.protein_target)),
      carbs: Math.round(num(profile.carbs_target)),
      fat: Math.round(num(profile.fat_target)),
      water: Math.round(num(profile.water_target)),
    };
    const newTargets: MacroTargets = {
      calories: Math.round(next.calories),
      protein: Math.round(next.protein),
      carbs: Math.round(next.carbs),
      fat: Math.round(next.fat),
      water: Math.round(next.water),
    };

    // 3. Persist new weight + targets on the profile.
    await db
      .prepare(
        `UPDATE profiles SET
           weight_kg = ?, calorie_target = ?, protein_target = ?,
           carbs_target = ?, fat_target = ?, water_target = ?
         WHERE user_id = ?`,
      )
      .bind(
        weightKg,
        newTargets.calories,
        newTargets.protein,
        newTargets.carbs,
        newTargets.fat,
        newTargets.water,
        userId,
      )
      .run();

    const diff: MacroTargets = {
      calories: newTargets.calories - previousTargets.calories,
      protein: newTargets.protein - previousTargets.protein,
      carbs: newTargets.carbs - previousTargets.carbs,
      fat: newTargets.fat - previousTargets.fat,
      water: newTargets.water - previousTargets.water,
    };

    const changeKg =
      previousWeightKg == null ? null : round1(weightKg - previousWeightKg);

    // 4. AI commentary. Non-fatal: fall back to a deterministic line so the check-in
    //    still succeeds (weight + targets are already persisted) if the model is down.
    const commentary = await generateCommentary({
      previousWeightKg,
      currentWeightKg: weightKg,
      changeKg,
      goalWeightKg: profile.goal_weight_kg,
      plannedWeeklyChangeKg: next.weeklyChangeKg,
      etaWeeks: next.etaWeeks,
      goal: profile.goal,
      explanation: next.explanation,
      calorieDiff: diff.calories,
    });

    return {
      day,
      weightKg,
      previousWeightKg,
      trend: {
        changeKg,
        weeklyChangeKg: round1(next.weeklyChangeKg),
        etaWeeks: next.etaWeeks,
      },
      previousTargets,
      newTargets,
      diff,
      commentary,
    };
  });

type CommentaryInputs = {
  previousWeightKg: number | null;
  currentWeightKg: number;
  changeKg: number | null;
  goalWeightKg: number;
  plannedWeeklyChangeKg: number;
  etaWeeks: number | null;
  goal: OnboardingInput["goal"];
  explanation: string;
  calorieDiff: number;
};

async function generateCommentary(inputs: CommentaryInputs): Promise<string> {
  try {
    const res = await aiJSON<{ commentary: string }>({
      system:
        "You are Eatup, a precise, motivating nutrition coach doing a monthly check-in. " +
        "Given the previous vs current weight, planned weekly pace, updated ETA to goal, and " +
        "the change in calorie target, write 2-3 sentences: acknowledge the trend, say whether " +
        "pace matches the plan, and state the updated ETA plainly. Reference real numbers. " +
        "No emojis, no medical claims.",
      user: JSON.stringify(inputs),
      temperature: 0.5,
      responseSchema: {
        type: "OBJECT",
        properties: { commentary: { type: "STRING" } },
        required: ["commentary"],
      },
      validate: commentarySchema,
    });
    return res.commentary;
  } catch (err) {
    if (toErrorCode(err) === "rate_limit") {
      // Let the client decide whether to retry the whole flow; the write already happened.
      throw new GeminiError("rate_limit", "commentary rate-limited");
    }
    return deterministicCommentary(inputs);
  }
}

/** Numeric fallback so a check-in never fails just because the model misbehaved. */
function deterministicCommentary(i: CommentaryInputs): string {
  const dir =
    i.changeKg == null
      ? "This is your first logged weigh-in."
      : i.changeKg === 0
        ? "Your weight held steady since last time."
        : `You're ${Math.abs(i.changeKg)} kg ${i.changeKg < 0 ? "down" : "up"} since last check-in.`;
  const toGoal = round1(i.currentWeightKg - i.goalWeightKg);
  const eta =
    i.etaWeeks != null
      ? ` At your planned pace, about ${i.etaWeeks} weeks to your goal.`
      : "";
  return `${dir} You're ${Math.abs(toGoal)} kg from your goal weight.${eta} Targets updated.`;
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
