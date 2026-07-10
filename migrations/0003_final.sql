-- 0003_final.sql — EATUP Stage 3 (final)
-- STRICTLY ADDITIVE. Runs against LIVE PRODUCTION D1 after 0001 (core) and 0002 (daily_summaries).
-- CREATE TABLE / CREATE INDEX IF NOT EXISTS only. No ALTER, no DROP.
-- SQLite / Cloudflare D1 syntax.

-- Per-user display + reminder preferences. Persistence everywhere else stays METRIC;
-- `units` only affects how values are shown. Reminder flags gate the in-app nudges (H).
CREATE TABLE IF NOT EXISTS settings (
  user_id         TEXT PRIMARY KEY,
  units           TEXT    NOT NULL DEFAULT 'metric',   -- 'metric' | 'imperial'
  remind_meals    INTEGER NOT NULL DEFAULT 1,          -- 0/1
  remind_water    INTEGER NOT NULL DEFAULT 1,
  remind_protein  INTEGER NOT NULL DEFAULT 1,
  remind_weighin  INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) WITHOUT ROWID;
