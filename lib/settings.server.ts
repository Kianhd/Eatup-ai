/**
 * Stage-3 · G — Settings server functions.
 *
 *   getSettings()          → SettingsDto            (defaults if no row yet)
 *   saveSettings(partial)  → SettingsDto            (upsert)
 *   exportData()           → ExportBundle           (full JSON dump of the user's data)
 *   deleteAccountData()    → { ok, photoKeys }      (deletes every row; integrator purges R2)
 *
 * Profile editing reuses the existing Stage-1 saveProfile (called from the client) — not here.
 *
 * INTEGRATION NOTES — assumed D1 tables/columns:
 *   settings(user_id, units, remind_meals, remind_water, remind_protein, remind_weighin, updated_at)
 *   profiles(user_id, …)   meals(user_id, …, photo_key)   water_logs(user_id, …)
 *   weight_logs(user_id, …)   daily_summaries(user_id, …)   memories(user_id, …)
 *   chat_messages(user_id, …)
 *   `meals.photo_key` is the R2 object key; if yours is named differently, adjust the SELECT.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUserId, getDb } from "./_integration";

export type Units = "metric" | "imperial";

export type SettingsDto = {
  units: Units;
  remindMeals: boolean;
  remindWater: boolean;
  remindProtein: boolean;
  remindWeighin: boolean;
};

type JsonRow = Record<string, string | number | boolean | null>;

export type ExportBundle = {
  exportedAt: string;
  profile: JsonRow | null;
  meals: JsonRow[];
  water: JsonRow[];
  weights: JsonRow[];
  summaries: JsonRow[];
  memories: JsonRow[];
  chat: JsonRow[];
  settings: SettingsDto;
};

const DEFAULTS: SettingsDto = {
  units: "metric",
  remindMeals: true,
  remindWater: true,
  remindProtein: true,
  remindWeighin: true,
};

/* ───────────────────────────── getSettings ───────────────────────────────── */

export const getSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<SettingsDto> => {
    const userId = await requireUserId();
    const db = getDb();
    const row = await db
      .prepare(
        `SELECT units, remind_meals AS m, remind_water AS w,
                remind_protein AS p, remind_weighin AS wi
           FROM settings WHERE user_id = ? LIMIT 1`,
      )
      .bind(userId)
      .first<{ units: string; m: number; w: number; p: number; wi: number }>();
    if (!row) return DEFAULTS;
    return {
      units: row.units === "imperial" ? "imperial" : "metric",
      remindMeals: !!row.m,
      remindWater: !!row.w,
      remindProtein: !!row.p,
      remindWeighin: !!row.wi,
    };
  },
);

/* ───────────────────────────── saveSettings ──────────────────────────────── */

const saveInput = z
  .object({
    units: z.enum(["metric", "imperial"]).optional(),
    remindMeals: z.boolean().optional(),
    remindWater: z.boolean().optional(),
    remindProtein: z.boolean().optional(),
    remindWeighin: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "no fields to update");

export const saveSettings = createServerFn({ method: "POST" })
  .inputValidator(saveInput)
  .handler(async ({ data }): Promise<SettingsDto> => {
    const userId = await requireUserId();
    const db = getDb();

    // Read-merge-write so a partial update preserves untouched fields (and seeds defaults).
    const current = await db
      .prepare(
        `SELECT units, remind_meals AS m, remind_water AS w,
                remind_protein AS p, remind_weighin AS wi
           FROM settings WHERE user_id = ? LIMIT 1`,
      )
      .bind(userId)
      .first<{ units: string; m: number; w: number; p: number; wi: number }>();

    const merged: SettingsDto = {
      units: data.units ?? (current?.units === "imperial" ? "imperial" : DEFAULTS.units),
      remindMeals: data.remindMeals ?? (current ? !!current.m : DEFAULTS.remindMeals),
      remindWater: data.remindWater ?? (current ? !!current.w : DEFAULTS.remindWater),
      remindProtein: data.remindProtein ?? (current ? !!current.p : DEFAULTS.remindProtein),
      remindWeighin: data.remindWeighin ?? (current ? !!current.wi : DEFAULTS.remindWeighin),
    };

    await db
      .prepare(
        `INSERT INTO settings
           (user_id, units, remind_meals, remind_water, remind_protein, remind_weighin, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           units = excluded.units,
           remind_meals = excluded.remind_meals,
           remind_water = excluded.remind_water,
           remind_protein = excluded.remind_protein,
           remind_weighin = excluded.remind_weighin,
           updated_at = excluded.updated_at`,
      )
      .bind(
        userId,
        merged.units,
        merged.remindMeals ? 1 : 0,
        merged.remindWater ? 1 : 0,
        merged.remindProtein ? 1 : 0,
        merged.remindWeighin ? 1 : 0,
        new Date().toISOString(),
      )
      .run();

    return merged;
  });

/* ───────────────────────────── exportData ────────────────────────────────── */

export const exportData = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExportBundle> => {
    const userId = await requireUserId();
    const db = getDb();

    const [profile, meals, water, weights, summaries, memories, chat] = await Promise.all([
      db.prepare(`SELECT * FROM profiles WHERE user_id = ? LIMIT 1`).bind(userId).first<JsonRow>(),
      rows(db, `SELECT * FROM meals WHERE user_id = ? ORDER BY logged_at ASC`, userId),
      rows(db, `SELECT * FROM water_logs WHERE user_id = ? ORDER BY day ASC`, userId),
      rows(db, `SELECT * FROM weight_logs WHERE user_id = ? ORDER BY day ASC`, userId),
      rows(db, `SELECT * FROM daily_summaries WHERE user_id = ? ORDER BY day ASC`, userId),
      rows(db, `SELECT * FROM memories WHERE user_id = ? ORDER BY created_at ASC`, userId),
      rows(db, `SELECT * FROM chat_messages WHERE user_id = ? ORDER BY created_at ASC`, userId),
    ]);

    const settings = await getSettings();

    return {
      exportedAt: new Date().toISOString(),
      profile: profile ?? null,
      meals,
      water,
      weights,
      summaries,
      memories,
      chat,
      settings,
    };
  },
);

/* ──────────────────────────── deleteAccountData ───────────────────────────── */

export const deleteAccountData = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ ok: boolean; photoKeys: string[] }> => {
    const userId = await requireUserId();
    const db = getDb();

    // Collect R2 keys BEFORE deleting so the integrator can purge object storage.
    const photoRows = await rows(
      db,
      `SELECT photo_key AS k FROM meals WHERE user_id = ? AND photo_key IS NOT NULL`,
      userId,
    );
    const photoKeys = photoRows
      .map((r) => r.k)
      .filter((k): k is string => typeof k === "string" && k.length > 0);

    // D1 batch runs as a single transaction.
    await db.batch([
      db.prepare(`DELETE FROM chat_messages WHERE user_id = ?`).bind(userId),
      db.prepare(`DELETE FROM daily_summaries WHERE user_id = ?`).bind(userId),
      db.prepare(`DELETE FROM memories WHERE user_id = ?`).bind(userId),
      db.prepare(`DELETE FROM water_logs WHERE user_id = ?`).bind(userId),
      db.prepare(`DELETE FROM weight_logs WHERE user_id = ?`).bind(userId),
      db.prepare(`DELETE FROM meals WHERE user_id = ?`).bind(userId),
      db.prepare(`DELETE FROM settings WHERE user_id = ?`).bind(userId),
      db.prepare(`DELETE FROM profiles WHERE user_id = ?`).bind(userId),
    ]);

    return { ok: true, photoKeys };
  },
);

async function rows(
  db: ReturnType<typeof getDb>,
  sql: string,
  userId: string,
): Promise<JsonRow[]> {
  const res = await db.prepare(sql).bind(userId).all<JsonRow>();
  return res.results ?? [];
}
