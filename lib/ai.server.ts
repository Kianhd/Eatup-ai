/**
 * Defensive Gemini wrapper shared by all Stage-2 server fns.
 * - Mirrors the Stage-1 call pattern (systemInstruction + contents + responseSchema).
 * - Validates the model's JSON against a zod schema (models lie / drift / truncate).
 * - Normalizes failures to a Stage2ErrorCode: 429 → 'rate_limit', schema miss → 'bad_output'.
 */

import { z } from "zod";
import {
  geminiJSON,
  GeminiError,
  type GeminiContent,
  type GeminiSchema,
} from "./_integration";

export type AiCall<T> = {
  system: string;
  /** Convenience: a single user turn. Ignored if `contents` is provided. */
  user?: string;
  contents?: GeminiContent[];
  responseSchema: GeminiSchema;
  /** zod schema the parsed model output MUST satisfy. */
  validate: z.ZodType<T>;
  temperature?: number;
  signal?: AbortSignal;
};

/**
 * Calls Gemini for structured JSON and returns a fully-validated `T`.
 * Throws a `GeminiError` with a stable `.code` on any failure so callers can
 * map to the DTO error envelope without leaking provider details.
 */
export async function aiJSON<T>(call: AiCall<T>): Promise<T> {
  const contents: GeminiContent[] =
    call.contents ??
    [{ role: "user", parts: [{ text: call.user ?? "" }] }];

  let raw: unknown;
  try {
    raw = await geminiJSON<unknown>({
      system: call.system,
      contents,
      responseSchema: call.responseSchema,
      temperature: call.temperature ?? 0.4,
      signal: call.signal,
    });
  } catch (err) {
    // The Stage-1 client is expected to throw GeminiError('rate_limit') on 429.
    if (err instanceof GeminiError) throw err;
    const code =
      err && typeof err === "object" && (err as { code?: unknown }).code === "rate_limit"
        ? "rate_limit"
        : "unknown";
    throw new GeminiError(code, `Gemini request failed: ${errMessage(err)}`);
  }

  // Some clients return a JSON string even with responseMimeType=application/json.
  const candidate = typeof raw === "string" ? safeJsonParse(raw) : raw;

  const parsed = call.validate.safeParse(candidate);
  if (!parsed.success) {
    throw new GeminiError(
      "bad_output",
      `Gemini output failed validation: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

/** Narrow any thrown value to a Stage2ErrorCode for the DTO error envelope. */
export function toErrorCode(err: unknown): "rate_limit" | "bad_output" | "unknown" {
  if (err instanceof GeminiError) return err.code;
  return "unknown";
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
