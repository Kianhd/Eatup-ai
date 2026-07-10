/**
 * Stage-2 · B — Daily summary (evening recap).
 *
 *   getDailySummary({ day }) → DailySummaryDto
 *     Returns the persisted summary for `day` if one exists, else generates it via Gemini
 *     (inputs: targets, meals, totals, water, memories), persists it, and returns it.
 *
 * Persisted to daily_summaries (see migrations/0002_stage2.sql). content_json shape:
 *   { wentWell, improve, tomorrow[], motivation, goalPct }
 *
 * INTEGRATION NOTES — assumed D1 columns:
 *   profiles(user_id, calorie_target, protein_target, carbs_target, fat_target, water_target)
 *   meals(user_id, day, title, calories, protein, carbs, fat)
 *   water_logs(user_id, day, glasses)   ← if you store one row per glass, use COUNT(*) instead of SUM
 *   memories(user_id, content, created_at)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId, getDb, GeminiError } from "./_integration";
import { aiJSON, toErrorCode } from "./ai.server";
import { isValidDay } from "./day";
import type { DailySummaryContent, DailySummaryDto } from "./stage2.dto";

const input = z.object({
  day: z.string().refine(isValidDay, "expected YYYY-MM-DD"),
});

const contentSchema = z.object({
  wentWell: z.string().min(1).max(280),
  improve: z.string().min(1).max(280),
  tomorrow: z.array(z.string().min(1).max(120)).min(1).max(3),
  motivation: z.string().min(1).max(280),
  goalPct: z.number().min(0).max(100),
});

export const getDailySummary = createServerFn({ method: "POST" })
  .inputValidator(input)
  .handler(async ({ data }): Promise<DailySummaryDto> => {
    const userId = await requireUserId();
    const db = getDb();
    const { day } = data;

    // 1. Cache hit — return the persisted summary as-is.
    const existing = await db
      .prepare(
        `SELECT content_json AS content, created_at AS createdAt
           FROM daily_summaries WHERE user_id = ? AND day = ? LIMIT 1`,
      )
      .bind(userId, day)
      .first<{ content: string; createdAt: string }>();

    if (existing) {
      const cached = parseContent(existing.content);
      if (cached) {
        return { day, content: cached, createdAt: existing.createdAt, generated: false };
      }
      // Corrupt row — fall through and regenerate (upsert below overwrites it).
    }

    // 2. Gather inputs.
    const [profile, meals, water, memories] = await Promise.all([
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
          `SELECT title, calories, protein, carbs, fat
             FROM meals WHERE user_id = ? AND day = ? ORDER BY logged_at ASC`,
        )
        .bind(userId, day)
        .all<{ title: string; calories: number; protein: number; carbs: number; fat: number }>(),
      db
        .prepare(
          `SELECT CAST(COALESCE(SUM(glasses), 0) AS INTEGER) AS glasses
             FROM water_logs WHERE user_id = ? AND day = ?`,
        )
        .bind(userId, day)
        .first<{ glasses: number }>(),
      db
        .prepare(
          `SELECT content FROM memories WHERE user_id = ?
             ORDER BY created_at DESC LIMIT 12`,
        )
        .bind(userId)
        .all<{ content: string }>(),
    ]);

    const mealRows = meals.results ?? [];
    const totals = mealRows.reduce(
      (acc, m) => ({
        calories: acc.calories + num(m.calories),
        protein: acc.protein + num(m.protein),
        carbs: acc.carbs + num(m.carbs),
        fat: acc.fat + num(m.fat),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    const targets = {
      calories: Math.round(num(profile?.calories)),
      protein: Math.round(num(profile?.protein)),
      carbs: Math.round(num(profile?.carbs)),
      fat: Math.round(num(profile?.fat)),
      water: Math.round(num(profile?.water)),
    };

    const promptPayload = {
      day,
      targets,
      totals: {
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat),
      },
      water: { glasses: num(water?.glasses), target: targets.water },
      meals: mealRows.map((m) => ({
        title: m.title,
        calories: Math.round(num(m.calories)),
        protein: Math.round(num(m.protein)),
      })),
      memories: (memories.results ?? []).map((r) => r.content).filter(Boolean),
    };

    // 3. Generate. Fall back to a deterministic recap on any AI failure so the UI never breaks.
    let content: DailySummaryContent;
    try {
      content = await aiJSON<DailySummaryContent>({
        system:
          "You are Eatup, a warm, concrete evening nutrition coach. Given the user's targets, " +
          "what they ate today, water, and long-term memory facts, write a short recap. " +
          "goalPct = how on-track today was vs targets (0-100). 'tomorrow' = 1-3 specific actions. " +
          "Be encouraging, reference real numbers, no medical claims, no emojis.",
        user: JSON.stringify(promptPayload),
        temperature: 0.6,
        responseSchema: {
          type: "OBJECT",
          properties: {
            wentWell: { type: "STRING" },
            improve: { type: "STRING" },
            tomorrow: { type: "ARRAY", minItems: 1, maxItems: 3, items: { type: "STRING" } },
            motivation: { type: "STRING" },
            goalPct: { type: "NUMBER" },
          },
          required: ["wentWell", "improve", "tomorrow", "motivation", "goalPct"],
        },
        validate: contentSchema,
      });
    } catch (err) {
      // Rate limits are transient — surface them so the client can retry rather than
      // caching a fallback. Other failures also bubble as typed codes.
      throw new GeminiError(
        toErrorCode(err),
        err instanceof Error ? err.message : "summary generation failed",
      );
    }

    // 4. Persist (idempotent upsert on the (user_id, day) PK) and return.
    const createdAt = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO daily_summaries (user_id, day, content_json, created_at)
           VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, day) DO UPDATE SET
           content_json = excluded.content_json,
           created_at   = excluded.created_at`,
      )
      .bind(userId, day, JSON.stringify(content), createdAt)
      .run();

    return { day, content, createdAt, generated: true };
  });

function parseContent(raw: string): DailySummaryContent | null {
  try {
    const parsed = contentSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function num(v: number | null | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
