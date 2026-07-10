# EATUP — Stage 2 integration guide

Standalone deliverables for A–D. Logic + structure only; **all styling is placeholder
classNames** for you to map to the design system. Written for React 19 + TanStack Start on
Cloudflare Workers (D1 + R2), SSR-safe, no Node APIs, no `process.env`.

## Rewire in ONE place: `lib/_integration.ts`
Every server file pulls its cross-cutting Stage-1 deps from this shim. Repoint the four
imports to your real modules and confirm the signatures:

| Export | Expected signature | Bind to your… |
|---|---|---|
| `requireUserId` | `() => Promise<string>` (throws 401) | auth guard |
| `getDb` | `() => D1Database` | D1 binding accessor |
| `geminiJSON` | `<T>({system, contents, responseSchema, temperature?, signal?}) => Promise<T>` | existing Gemini client |
| `computeTargets` | `(OnboardingInput) => Targets` | `lib/nutrition.server.ts` (unchanged) |

`geminiJSON` must **throw `GeminiError('rate_limit')` on HTTP 429** (or an error with
`.code === 'rate_limit'`). `lib/ai.server.ts` wraps it with zod validation and maps
everything to a stable `Stage2ErrorCode` (`rate_limit | bad_output | unknown`).

## Package import paths to confirm
- `createServerFn`, `useServerFn` ← `@tanstack/react-start`
- `createFileRoute` ← `@tanstack/react-router`
- `z` ← `zod`

Adjust if your project pins different package names/versions.

## D1 column-name assumptions
Queries use best-guess snake_case. Each server file lists its assumptions at the top;
grep for `INTEGRATION NOTES`. If your columns differ, edit the `SELECT ... AS ...` aliases
(the code only depends on the aliases, not the raw names):
- `profiles(user_id, name, age, gender, height_cm, weight_kg, goal_weight_kg,
  activity_level, workout_days, goal, speed, calorie_target, protein_target,
  carbs_target, fat_target, water_target)`
- `meals(user_id, day, logged_at, title, calories, protein, carbs, fat)`
- `weight_logs(user_id, day, weight_kg)`
- `water_logs(user_id, day, glasses)` — **if you store one row per glass**, change
  `SUM(glasses)` → `COUNT(*)` in `dailySummary.server.ts`.
- `memories(user_id, content, created_at)`

## Migration
`migrations/0002_stage2.sql` — additive only (`CREATE TABLE/INDEX IF NOT EXISTS`), no
ALTER/DROP, safe on live prod. Adds `daily_summaries` + three read-path indexes. Run after 0001.

## Deliverables → files
**A. Progress** (`/progress`)
- `lib/progress.server.ts` — `getProgress({today})`, `getProgressInsights({today})`
- `routes/progress.tsx`, `components/progress/{WeightChart,CaloriesChart,WeeklyProteinChart,InsightsCard}.tsx`
- Charts are hand-rolled SVG (`lib/svg.ts`), responsive, empty/loading states, tabular-nums.

**B. Daily summary**
- `lib/dailySummary.server.ts` — `getDailySummary({day})` (cache-or-generate → persist)
- `components/DailyRecapCard.tsx` — mount on dashboard; **renders nothing before 18:00 local**.

**C. Monthly check-in**
- `lib/checkin.server.ts` — `saveCheckin({weightKg, day})` (log → recompute → persist → AI commentary + diff)
- `components/CheckinModal.tsx` — weight → commentary → target diff.

**D. Food suggestions**
- `lib/suggestions.server.ts` — `getSuggestions({day})` (remaining macros → 3–5 foods)
- `components/SuggestionsStrip.tsx` — horizontal strip under the macro bars.

## Time handling
Clients pass their **local** `day`/`today` as `YYYY-MM-DD`. No server clock is used for
"today". Date math is in `lib/day.ts` (UTC-noon anchor, timezone-independent). The 6pm
recap gate and `/progress` today are resolved client-side inside effects (SSR-safe).

## Behavior notes worth knowing
- **Insights / recap / suggestions** are fetched independently from their host page so a
  slow or rate-limited model never blocks the charts/dashboard.
- **`saveCheckin`** persists weight + targets *before* the AI call; if commentary fails
  (non-rate-limit) it falls back to a deterministic sentence rather than losing the write.
- **Empty-data paths** short-circuit the model (progress insights with <2 days, suggestions
  when calories are already met) to save tokens and avoid nonsense output.
