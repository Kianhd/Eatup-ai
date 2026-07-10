/**
 * Stage-2 · A — AI insights card. Fetches getProgressInsights on mount (client-only,
 * after the charts have painted) and renders loading / error / empty / ready states.
 * Error state distinguishes 'rate_limit' from generic failure and offers retry.
 */

import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getProgressInsights } from "../../lib/progress.server";
import type { Stage2ErrorCode } from "../../lib/stage2.dto";

type Props = { today: string };

type State =
  | { status: "loading" }
  | { status: "ready"; insights: string[] }
  | { status: "error"; code: Stage2ErrorCode };

export function InsightsCard({ today }: Props) {
  const run = useServerFn(getProgressInsights);
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await run({ data: { today } });
      setState({ status: "ready", insights: res.insights });
    } catch (err) {
      setState({ status: "error", code: readCode(err) });
    }
  }, [run, today]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await run({ data: { today } });
        if (alive) setState({ status: "ready", insights: res.insights });
      } catch (err) {
        if (alive) setState({ status: "error", code: readCode(err) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [run, today]);

  return (
    <section className="insights-card" aria-live="polite">
      <h3 className="insights-card__title">Your coach noticed</h3>

      {state.status === "loading" && (
        <ul className="insights-card__list insights-card__list--loading" aria-busy="true">
          <li className="insights-card__skeleton" />
          <li className="insights-card__skeleton" />
          <li className="insights-card__skeleton" />
        </ul>
      )}

      {state.status === "error" && (
        <div className="insights-card__error">
          <p>
            {state.code === "rate_limit"
              ? "Coach is catching its breath — insights are rate-limited right now."
              : "Couldn't generate insights just now."}
          </p>
          <button type="button" className="insights-card__retry" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {state.status === "ready" && (
        <ul className="insights-card__list">
          {state.insights.map((line, i) => (
            <li key={i} className="insights-card__item">
              {line}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Server fns serialize thrown errors; recover the Stage-2 code defensively. */
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
