/**
 * ⚠️ INTEGRATION SHIM — single rewiring point for every Stage-2 file.
 * -------------------------------------------------------------------
 * All Stage-2 server files import their cross-cutting Stage-1 dependencies from HERE,
 * so the integrating engineer only edits this one file. Repoint the four imports below
 * to the real Stage-1 modules (names are best-guess conventional paths), confirm the
 * expected signatures match, then everything downstream type-checks unchanged.
 *
 * Nothing in this file is "new" logic — it is a typed re-export surface.
 */

// ── 1. Auth guard ─────────────────────────────────────────────────────────────
// Expected: resolves to the authenticated user's id, throws (401) if unauthenticated.
// Stage-1 already ships an auth guard; bind it here.
//   e.g. export { requireUserId } from "~/server/auth";
export { requireUserId } from "~/server/auth";
// Contract, for reference:
//   export function requireUserId(): Promise<string>;

// ── 2. D1 binding ─────────────────────────────────────────────────────────────
// Expected: returns the Cloudflare D1 Database bound to this request (Workers runtime).
// If your codebase reads the binding off request context instead, replace call sites
// with your accessor — signature below is what the Stage-2 files assume.
//   e.g. export { getDb } from "~/server/db";
export { getDb } from "~/server/db";
// Contract:
//   export function getDb(): D1Database;

// ── 3. Gemini client ──────────────────────────────────────────────────────────
// Stage-1 already ships the Gemini client (structured JSON via responseSchema).
// Stage-2 calls it through this thin generic. If the real export has a different
// name/shape, adapt here (a 3-line wrapper is fine) — do NOT reimplement the client.
//   e.g. export { geminiJSON } from "~/server/gemini";
export { geminiJSON } from "~/server/gemini";
// Contract the Stage-2 files rely on:
//   export function geminiJSON<T>(args: {
//     system: string;
//     contents: GeminiContent[];
//     responseSchema: GeminiSchema;        // Google responseSchema (OpenAPI subset, UPPERCASE types)
//     temperature?: number;
//     signal?: AbortSignal;
//   }): Promise<T>;
//   // On HTTP 429 it must throw an Error whose `.code === "rate_limit"` (see GeminiError below).

// ── 4. Target calculator (Stage-1, signature provided by product owner) ───────
// // lib/nutrition.server.ts — existing, do not reimplement
export { computeTargets } from "~/lib/nutrition.server";
export type {
  Targets,
  OnboardingInput,
  Goal,
  Speed,
  ActivityLevel,
} from "~/lib/nutrition.server";

/* ─────────────────────────── Shared ambient types ─────────────────────────── */

/** Minimal Cloudflare D1 surface used by Stage-2 (avoids a hard dep on @cloudflare/workers-types). */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

/** Google Gemini content + responseSchema shapes (mirrors the Stage-1 call pattern). */
export type GeminiContent = {
  role: "user" | "model";
  parts: Array<{ text: string }>;
};
export type GeminiSchema = {
  type: "OBJECT" | "ARRAY" | "STRING" | "NUMBER" | "INTEGER" | "BOOLEAN";
  description?: string;
  nullable?: boolean;
  enum?: string[];
  format?: string;
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  minItems?: number;
  maxItems?: number;
};

/** The error shape Stage-2 catches to surface a 'rate_limit' code to the UI. */
export class GeminiError extends Error {
  code: "rate_limit" | "bad_output" | "unknown";
  constructor(code: GeminiError["code"], message: string) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
  }
}
