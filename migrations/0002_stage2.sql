-- 0002_stage2.sql — EATUP Stage 2
-- STRICTLY ADDITIVE. Runs against LIVE PRODUCTION D1 after 0001.
-- Rules enforced here: CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS only.
-- No ALTER, no DROP, no recreation of existing tables
-- (profiles, meals, water_logs, chat_messages, memories, weight_logs).
-- SQLite / Cloudflare D1 syntax.

-- Evening recap, one row per user per local day. content_json holds the shape:
--   { wentWell:string, improve:string, tomorrow:string[], motivation:string, goalPct:number }
CREATE TABLE IF NOT EXISTS daily_summaries (
  user_id     TEXT NOT NULL,
  day         TEXT NOT NULL,               -- 'YYYY-MM-DD', user-local
  content_json TEXT NOT NULL,              -- JSON string of DailySummaryContent
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, day)
) WITHOUT ROWID;

-- Supporting indexes for the Stage-2 read paths. All additive.
-- Progress page: per-day meal aggregates over a trailing window.
CREATE INDEX IF NOT EXISTS idx_meals_user_day        ON meals (user_id, day);
-- Progress page: weight series + monthly check-in "previous vs current".
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_day  ON weight_logs (user_id, day);
-- Daily summary: same-day water total.
CREATE INDEX IF NOT EXISTS idx_water_logs_user_day   ON water_logs (user_id, day);
