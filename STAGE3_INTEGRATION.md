# EATUP — Stage 3 (final) integration guide

Standalone deliverables E–J. Logic + structure only; **all styling is placeholder classNames**.
React 19 + TanStack Start (SSR, Cloudflare Workers), D1 + R2. Reuses Stage-2 conventions.

## Rewire points (in priority order)

### 1. `lib/_stage1.ts` — the client-safe Stage-1 call surface (NEW single chokepoint)
Components import the live Stage-1 server fns from here. Repoint these to your real modules:
| Import | Expected shape |
|---|---|
| `getBootstrap` | `({day}) => {signedIn:false} \| {signedIn:true, profile, meals, totals}` |
| `saveProfile` | `(OnboardingInput) => {ok:true, profile, explanation, etaWeeks} \| {ok:false, code}` |
| `setWater` | `({day, glasses}) => {ok, glasses}` |
| `deleteMeal` | `({id}) => {ok}` |
| `getChat` / `sendChat` | `getChat() => {messages}`, `sendChat({message, day}) => {ok:true, reply} \| {ok:false, code, message}` |
| `analyzeMeal` (helper) | wraps `POST /api/meals/analyze` multipart; parses to the typed union. No change needed unless the route path differs. |

Do **not** import `lib/_integration.ts` into components — it pulls server-only auth/db/gemini.
`.server.ts` files (settings) still use `_integration.ts` as in Stage 2.

### 2. Existing Stage-1 UI components (referenced only by `routes/index.example.tsx`)
`Onboarding`, `DashboardCard`, `MealTimeline` — repoint the three marked imports at the top of
the shell to your real components.

### 3. D1 column assumptions (grep `INTEGRATION NOTES`)
Same snake_case aliasing approach as Stage 2. Notable additions:
- `meals.photo_key` — the R2 object key, used by `deleteAccountData` (returns `photoKeys` for you
  to purge) and never sent to the client. Rename in the SELECTs if yours differs.
- `settings(...)` — created by `migrations/0003_final.sql`.

### 4. Migration
`migrations/0003_final.sql` — additive only (`settings` table). Run after 0001 + 0002.

## Deliverables → files
- **E. Capture** — `components/capture/LogMealFlow.tsx`, `lib/image.ts` (downscale, EXIF-aware),
  multipart via `analyzeMeal` in `lib/_stage1.ts`.
- **F. Chat** — `routes/chat.tsx`, `components/chat/*` (MessageBubble, Composer, TypingIndicator,
  StarterChips, useAutoScroll), `lib/useLocalDay.ts`.
- **G. Settings** — `lib/settings.server.ts` (getSettings, saveSettings, exportData,
  deleteAccountData), `lib/units.ts`, `components/settings/*`.
- **H. Nudges** — `lib/nudges.ts` (pure), `components/NudgeBanner.tsx`.
- **I. Landing** — `components/Landing.tsx`.
- **J. Shell** — `routes/index.example.tsx` (reference; merge into your real index route).

## Tests
`lib/units.test.ts`, `lib/nudges.test.ts` — Vitest style (`describe/it/expect`). Point your
runner at them; they exercise conversions (rounding, ft/in carry) and nudge priority/time gates.

## Behavior notes worth knowing
- **Client = source of `day`.** `useLocalDay()` returns null during SSR then the local day;
  it re-evaluates on refocus/visibility and at local midnight. Shell refetches bootstrap on day
  change + window refocus.
- **Capture** downscales to max-edge 1280 / JPEG q0.82 before upload, honors EXIF orientation,
  is abortable, keeps the photo on `no_food`, and shows distinct uploading→analyzing copy
  (the transition is timer-approximated since fetch has no upload-progress event).
- **Chat** is optimistic; `rate_limit` keeps the user's text with an inline Retry; auto-scroll
  won't yank if the user scrolled up (>120px from bottom).
- **Units** are display-only — everything persists metric; `lib/units.ts` converts at the edges.
- **Delete** runs as a D1 batch (transaction) across every table and returns `photoKeys`; the
  integrator purges R2 (server fns can't hold the R2 binding cleanly here — wire in your route).
- **Nudges**: one at a time, priority breakfast → protein → water → weigh-in, each setting-gated;
  dismissal suppressed per-period via localStorage. `lastWeightLoggedAt` must be supplied to the
  shell (not in the bootstrap contract) — until then the weigh-in nudge treats the user as
  never-weighed.
