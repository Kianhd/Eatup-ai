/**
 * ⚠️ CLIENT-SAFE STAGE-1 CALL SURFACE — single rewiring point for Stage-3 components.
 * -----------------------------------------------------------------------------------
 * Re-exports the already-live Stage-1 server functions so components import them from
 * one place. These are `createServerFn` instances (isomorphic — safe to import on the
 * client). Do NOT import `lib/_integration.ts` into components: that shim pulls in
 * server-only auth/db/gemini modules.
 *
 * Repoint the paths below to your real Stage-1 modules; names are conventional guesses.
 * The `analyzeMeal` helper wraps the multipart POST route (binary never goes through a
 * server fn / JSON).
 */

import type { AnalyzeMealResult, MealDto } from "./dto";

type AnalyzeErrorCode = Extract<AnalyzeMealResult, { ok: false }>["code"];

// Server functions (call via useServerFn in components). Repoint paths as needed.
export { getBootstrap } from "~/server/bootstrap";
export { saveProfile } from "~/server/profile";
export { setWater } from "~/server/water";
export { deleteMeal } from "~/server/meals";
export { getChat, sendChat } from "~/server/chat";

/**
 * POST a downscaled photo (+ note/day/loggedAt) to the Stage-1 analyze route.
 * Binary goes as multipart FormData — never JSON. Parsed defensively into a typed union.
 *
 * @param photo   downscaled JPEG blob (see lib/image.ts)
 * @param fields  note (≤500 chars), day (YYYY-MM-DD), loggedAt (ISO)
 * @param signal  AbortSignal so the caller can cancel a slow analysis
 */
export async function analyzeMeal(
  photo: Blob,
  fields: { note: string; day: string; loggedAt: string },
  signal?: AbortSignal,
): Promise<AnalyzeMealResult> {
  const form = new FormData();
  form.append("photo", photo, "meal.jpg");
  form.append("note", fields.note);
  form.append("day", fields.day);
  form.append("loggedAt", fields.loggedAt);

  let res: Response;
  try {
    res = await fetch("/api/meals/analyze", {
      method: "POST",
      body: form,
      signal,
    });
  } catch (err) {
    if (isAbort(err)) throw err; // let the caller distinguish cancellation
    return { ok: false, code: "error", message: "Network error. Check your connection." };
  }

  const data = await safeJson(res);
  return normalizeAnalyze(data, res.status);
}

function normalizeAnalyze(data: unknown, status: number): AnalyzeMealResult {
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if (d.ok === true && d.meal && typeof d.meal === "object") {
      return { ok: true, meal: d.meal as MealDto };
    }
    if (d.ok === false && typeof d.code === "string") {
      return {
        ok: false,
        code: coerceCode(d.code),
        message: typeof d.message === "string" ? d.message : undefined,
      };
    }
  }
  // Unparseable / unexpected body — map by status where we can.
  if (status === 429) return { ok: false, code: "rate_limit" };
  if (status === 413) return { ok: false, code: "photo_too_large" };
  return { ok: false, code: "error", message: "Unexpected response from the server." };
}

const ANALYZE_CODES: AnalyzeErrorCode[] = [
  "no_food",
  "rate_limit",
  "missing_key",
  "no_profile",
  "photo_too_large",
  "error",
];

function coerceCode(code: string): AnalyzeErrorCode {
  return (ANALYZE_CODES as string[]).includes(code) ? (code as AnalyzeErrorCode) : "error";
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function isAbort(err: unknown): boolean {
  return (
    err instanceof DOMException
      ? err.name === "AbortError"
      : Boolean(err && typeof err === "object" && (err as { name?: string }).name === "AbortError")
  );
}
