# Eatup AI

AI nutrition coach — photograph meals, get AI macro estimates + coaching. React 19 +
TanStack Start (SSR on Cloudflare Workers), Cloudflare D1 (SQLite) + R2.

> ⚠️ **Current repo state:** this repository currently contains the **Stage-2 deliverable
> files** (Progress page, Daily summary, Monthly check-in, Food suggestions) — logic +
> structure written against the Stage-1 DTOs. It is **not yet a standalone runnable app**:
> the Stage-1 project (`package.json`, build/wrangler config, `~/server/*` modules,
> `lib/nutrition.server.ts`) still needs to be added. See `STAGE2_INTEGRATION.md` for how
> the Stage-2 files wire into the full app.

## Layout (Stage 2)
- `migrations/0002_stage2.sql` — additive-only migration (adds `daily_summaries` + indexes)
- `lib/*.server.ts` — server functions (progress, daily summary, check-in, suggestions)
- `lib/_integration.ts` — single rewiring point for Stage-1 deps
- `routes/progress.tsx`, `components/**` — UI (placeholder classNames; design mapped by integrator)
- `STAGE2_INTEGRATION.md` — integration guide

## Deploy
Auto-deploy (CI/CD → Cloudflare Workers) is set up once the full app lives here. For now
the repo is kept in sync with GitHub on every change.
