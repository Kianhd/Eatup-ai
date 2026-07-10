/**
 * Stage-2 · D — "What should I eat now?" food suggestions.
 *
 *   getSuggestions({ day }) → SuggestionsDto
 *     Computes remaining macros for the day (targets − logged totals, clamped ≥ 0),
 *     asks Gemini for 3-5 concrete foods that fit what's left, returns them + the remaining.
 *
 * INTEGRATION NOTES — assumed D1 columns:
 *   profiles(user_id, calorie_target, protein_target, carbs_target, fat_target, water_target)
 *   meals(user_id, day, calories, protein, carbs, fat)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId, getDb, GeminiError } from "./_integration";
import { aiJSON, toErrorCode } from "./ai.server";
import { isValidDay } from "./day";
import type { FoodSuggestion, MacroTargets, SuggestionsDto } from "./stage2.dto";

const input = z.object({
  day: z.string().refine(isValidDay, "expected YYYY-MM-DD"),
});

const suggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        food: z.string().min(1).max(80),
        why: z.string().min(1).max(140),
        approxKcal: z.number().min(0).max(3000),
        approxProtein: z.number().min(0).max(300),
      }),
    )
    .min(3)
    .max(5),
});

export const getSuggestions = createServerFn({ method: "POST" })
  .inputValidator(input)
  .handler(async ({ data }): Promise<SuggestionsDto> => {
    const userId = await requireUserId();
    const db = getDb();
    const { day } = data;

    const [profile, totalsRow] = await Promise.all([
      db
        .prepare(
          `SELECT calorie_target AS calories, protein_target AS protein,
                  carbs_target AS carbs, fat_target AS fat, water_target AS water
             FROM profiles WHERE user_id = ? LIMIT 1`,
        )
        .bind(userId)
        .first<{
          calories: number | null;
          protein: number | null;
          carbs: number | null;
          fat: number | null;
          water: number | null;
        }>(),
      db
        .prepare(
          `SELECT CAST(COALESCE(SUM(calories),0) AS REAL) AS calories,
                  CAST(COALESCE(SUM(protein),0)  AS REAL) AS protein,
                  CAST(COALESCE(SUM(carbs),0)    AS REAL) AS carbs,
                  CAST(COALESCE(SUM(fat),0)      AS REAL) AS fat
             FROM meals WHERE user_id = ? AND day = ?`,
        )
        .bind(userId, day)
        .first<{ calories: number; protein: number; carbs: number; fat: number }>(),
    ]);

    const remaining: MacroTargets = {
      calories: clampRemaining(profile?.calories, totalsRow?.calories),
      protein: clampRemaining(profile?.protein, totalsRow?.protein),
      carbs: clampRemaining(profile?.carbs, totalsRow?.carbs),
      fat: clampRemaining(profile?.fat, totalsRow?.fat),
      water: 0, // not relevant to food suggestions
    };

    // Already at/over target — no suggestions needed; skip the model.
    if (remaining.calories <= 0) {
      return { remaining, suggestions: [] };
    }

    let suggestions: FoodSuggestion[];
    try {
      const res = await aiJSON<{ suggestions: FoodSuggestion[] }>({
        system:
          "You are Eatup, a practical nutrition coach. Given the macros the user has LEFT " +
          "for today, suggest 3-5 concrete, everyday foods or simple combos that fit what's " +
          "remaining (especially the protein gap). Keep each 'food' short and specific, 'why' " +
          "one clause, and approxKcal/approxProtein realistic for a normal portion. " +
          "Prefer whole foods. No emojis, no medical claims.",
        user: JSON.stringify({ remaining }),
        temperature: 0.7,
        responseSchema: {
          type: "OBJECT",
          properties: {
            suggestions: {
              type: "ARRAY",
              minItems: 3,
              maxItems: 5,
              items: {
                type: "OBJECT",
                properties: {
                  food: { type: "STRING" },
                  why: { type: "STRING" },
                  approxKcal: { type: "NUMBER" },
                  approxProtein: { type: "NUMBER" },
                },
                required: ["food", "why", "approxKcal", "approxProtein"],
              },
            },
          },
          required: ["suggestions"],
        },
        validate: suggestionsSchema,
      });
      suggestions = res.suggestions.map((s) => ({
        food: s.food,
        why: s.why,
        approxKcal: Math.round(s.approxKcal),
        approxProtein: Math.round(s.approxProtein),
      }));
    } catch (err) {
      throw new GeminiError(
        toErrorCode(err),
        err instanceof Error ? err.message : "suggestion generation failed",
      );
    }

    return { remaining, suggestions };
  });

/** target − consumed, clamped at 0; missing target ⇒ 0 remaining (can't recommend against unknown). */
function clampRemaining(target: number | null | undefined, consumed: number | null | undefined): number {
  const t = num(target);
  const c = num(consumed);
  return Math.max(0, Math.round(t - c));
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
