/**
 * Stage-2 · B — "Today's recap" card for the dashboard.
 * Appears only after 18:00 user-local (checked client-side, SSR-safe), collapsible,
 * fetches getDailySummary on first expand. Loading / error / ready states.
 *
 * INTEGRATION: mount on the dashboard, passing the user's local `day` (YYYY-MM-DD).
 * Renders nothing before 6pm local, so it's safe to always include.
 */

import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getDailySummary } from "../lib/dailySummary.server";
import type { DailySummaryContent, Stage2ErrorCode } from "../lib/stage2.dto";

type Props = {
  day: string; // user-local YYYY-MM-DD
  /** Reveal hour (24h, user-local). Defaults to 18:00 per spec. */
  revealHour?: number;
  /** Start expanded. Defaults to collapsed. */
  defaultOpen?: boolean;
};

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; content: DailySummaryContent }
  | { status: "error"; code: Stage2ErrorCode };

export function DailyRecapCard({ day, revealHour = 18, defaultOpen = false }: Props) {
  const run = useServerFn(getDailySummary);
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const [state, setState] = useState<State>({ status: "idle" });

  // Client-only local-time gate; never touches Date during SSR render.
  useEffect(() => {
    setVisible(new Date().getHours() >= revealHour);
  }, [revealHour]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await run({ data: { day } });
      setState({ status: "ready", content: res.content });
    } catch (err) {
      setState({ status: "error", code: readCode(err) });
    }
  }, [run, day]);

  // Lazy-load the summary the first time the card is opened while visible.
  useEffect(() => {
    if (visible && open && state.status === "idle") void load();
  }, [visible, open, state.status, load]);

  if (!visible) return null;

  return (
    <section className="recap-card" data-open={open}>
      <button
        type="button"
        className="recap-card__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="recap-card__title">Today's recap</span>
        <span className="recap-card__chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {open && (
        <div className="recap-card__body">
          {state.status === "loading" && (
            <div className="recap-card__loading" aria-busy="true">
              <span className="recap-card__skeleton" />
              <span className="recap-card__skeleton" />
            </div>
          )}

          {state.status === "error" && (
            <div className="recap-card__error">
              <p>
                {state.code === "rate_limit"
                  ? "Coach is busy — try the recap again in a moment."
                  : "Couldn't build today's recap."}
              </p>
              <button type="button" className="recap-card__retry" onClick={load}>
                Try again
              </button>
            </div>
          )}

          {state.status === "ready" && <RecapBody content={state.content} />}
        </div>
      )}
    </section>
  );
}

function RecapBody({ content }: { content: DailySummaryContent }) {
  const pct = Math.round(content.goalPct);
  return (
    <>
      <div
        className="recap-card__goal"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="On-track vs targets"
      >
        <div className="recap-card__goal-fill" style={{ width: `${pct}%` }} />
        <span className="recap-card__goal-label tabular-nums">{pct}%</span>
      </div>

      <dl className="recap-card__sections">
        <div className="recap-card__section">
          <dt>Went well</dt>
          <dd>{content.wentWell}</dd>
        </div>
        <div className="recap-card__section">
          <dt>To improve</dt>
          <dd>{content.improve}</dd>
        </div>
        <div className="recap-card__section">
          <dt>Tomorrow</dt>
          <dd>
            <ul className="recap-card__todo">
              {content.tomorrow.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </dd>
        </div>
      </dl>

      <p className="recap-card__motivation">{content.motivation}</p>
    </>
  );
}

function readCode(err: unknown): Stage2ErrorCode {
  const raw =
    err && typeof err === "object"
      ? ((err as { code?: unknown; message?: unknown }).code ??
        (err as { message?: unknown }).message)
      : undefined;
  if (raw === "rate_limit" || (typeof raw === "string" && raw.includes("rate_limit"))) {
    return "rate_limit";
  }
  if (raw === "bad_output") return "bad_output";
  return "unknown";
}
