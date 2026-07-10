# Eatup AI

AI nutrition coach — photograph meals, get AI macro estimates + coaching. React 19 +
TanStack Start (SSR on Cloudflare Workers), Cloudflare D1 (SQLite) + R2.

> ⚠️ **Current repo state:** this repository contains the **Stage-2 and Stage-3 deliverable
> files** — logic + structure written against the Stage-1 DTOs. It is **not yet a standalone
> runnable app**: the Stage-1 project (`package.json`, build/wrangler config, `~/server/*`
> modules, `lib/nutrition.server.ts`, and the existing UI it references) still needs to be
> added. See `STAGE2_INTEGRATION.md` and `STAGE3_INTEGRATION.md` for how everything wires in.

## Layout
**Stage 2** — Progress, Daily summary, Monthly check-in, Food suggestions
- `migrations/0002_stage2.sql`, `lib/progress.server.ts`, `lib/dailySummary.server.ts`,
  `lib/checkin.server.ts`, `lib/suggestions.server.ts`, `routes/progress.tsx`, `components/progress/**`
- `lib/_integration.ts` — single rewiring point for **server-only** Stage-1 deps

**Stage 3** — Meal capture, Coach chat, Settings, Nudges, Landing, App shell
- `migrations/0003_final.sql` (settings table)
- `lib/_stage1.ts` — client-safe Stage-1 call surface (bootstrap/chat/profile/water/analyze)
- `components/capture/**` (E), `routes/chat.tsx` + `components/chat/**` (F),
  `lib/settings.server.ts` + `lib/units.ts` + `components/settings/**` (G),
  `lib/nudges.ts` + `components/NudgeBanner.tsx` (H), `components/Landing.tsx` (I),
  `routes/index.example.tsx` (J — shell reference)
- `lib/*.test.ts` — Vitest-style tests for the pure logic
- `STAGE2_INTEGRATION.md`, `STAGE3_INTEGRATION.md` — integration guides

## Deploy
Auto-deploy (CI/CD → Cloudflare Workers) is set up once the full app lives here. For now
the repo is kept in sync with GitHub on every change.
