/**
 * Stage-2 · D — "What should I eat now?" horizontal chip/card strip for the dashboard.
 * Sits under the macro bars. Fetches getSuggestions on demand; horizontally scrollable.
 * Loading / error / empty (goals-met) / ready states. Placeholder classNames only.
 *
 * INTEGRATION: mount under the macro bars, passing the user-local `day`. Refetch by
 * bumping the `refreshKey` prop (e.g. after a new meal is logged).
 */

import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSuggestions } from "../lib/suggestions.server";
import type { FoodSuggestion, Stage2ErrorCode } from "../lib/stage2.dto";

type Props = {
  day: string; // user-local YYYY-MM-DD
  /** Change this value to force a refetch (e.g. after logging a meal). */
  refreshKey?: string | number;
};

type State =
  | { status: "loading" }
  | { status: "ready"; suggestions: FoodSuggestion[]; goalsMet: boolean }
  | { status: "error"; code: Stage2ErrorCode };

export function SuggestionsStrip({ day, refreshKey }: Props) {
  const run = useServerFn(getSuggestions);
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await run({ data: { day } });
      setState({
        status: "ready",
        suggestions: res.suggestions,
        goalsMet: res.remaining.calories <= 0,
      });
    } catch (err) {
      setState({ status: "error", code: readCode(err) });
    }
  }, [run, day]);

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    (async () => {
      try {
        const res = await run({ data: { day } });
        if (!alive) return;
        setState({
          status: "ready",
          suggestions: res.suggestions,
          goalsMet: res.remaining.calories <= 0,
        });
      } catch (err) {
        if (alive) setState({ status: "error", code: readCode(err) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [run, day, refreshKey]);

  return (
    <section className="suggest-strip" aria-label="What should I eat now?">
      <header className="suggest-strip__header">
        <h3 className="suggest-strip__title">What should I eat now?</h3>
        {state.status === "ready" && !state.goalsMet && (
          <button type="button" className="suggest-strip__refresh" onClick={load}>
            Refresh
          </button>
        )}
      </header>

      {state.status === "loading" && (
        <ul className="suggest-strip__scroller" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="suggest-chip suggest-chip--skeleton" />
          ))}
        </ul>
      )}

      {state.status === "error" && (
        <div className="suggest-strip__error">
          <p>
            {state.code === "rate_limit"
              ? "Coach is busy — try again shortly."
              : "Couldn't load suggestions."}
          </p>
          <button type="button" className="suggest-strip__retry" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {state.status === "ready" && state.goalsMet && (
        <p className="suggest-strip__empty">You've hit today's calories — nice work.</p>
      )}

      {state.status === "ready" && !state.goalsMet && state.suggestions.length === 0 && (
        <p className="suggest-strip__empty">No suggestions right now.</p>
      )}

      {state.status === "ready" && state.suggestions.length > 0 && (
        <ul className="suggest-strip__scroller">
          {state.suggestions.map((s, i) => (
            <li key={i} className="suggest-chip">
              <span className="suggest-chip__food">{s.food}</span>
              <span className="suggest-chip__why">{s.why}</span>
              <span className="suggest-chip__macros tabular-nums">
                {s.approxKcal} kcal · {s.approxProtein}g P
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
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
