/**
 * Stage-3 · H — Renders the current nudge (if any) as a dismissible banner. Dismissal is
 * suppressed until the next period via localStorage (ephemeral UX state, not real data).
 * SSR-safe: localStorage is only touched in effects/handlers.
 */

import { useCallback, useEffect, useState } from "react";
import type { Nudge, NudgeAction } from "../lib/nudges";

type Props = {
  nudge: Nudge | null;
  onAction: (action: NudgeAction) => void;
};

const STORE_KEY = "eatup.nudge.dismissed";
const MAX_KEPT = 12;

export function NudgeBanner({ nudge, onAction }: Props) {
  const [suppressed, setSuppressed] = useState(true); // hidden until we've checked storage

  useEffect(() => {
    if (!nudge) return;
    setSuppressed(readDismissed().includes(nudge.key));
  }, [nudge?.key]);

  const dismiss = useCallback(() => {
    if (!nudge) return;
    const next = [nudge.key, ...readDismissed().filter((k) => k !== nudge.key)].slice(0, MAX_KEPT);
    writeDismissed(next);
    setSuppressed(true);
  }, [nudge]);

  if (!nudge || suppressed) return null;

  return (
    <aside className={`nudge nudge--${nudge.kind}`} role="status">
      <div className="nudge__text">
        <p className="nudge__title">{nudge.title}</p>
        <p className="nudge__body">{nudge.body}</p>
      </div>
      <div className="nudge__actions">
        {nudge.action && nudge.ctaLabel && (
          <button
            type="button"
            className="nudge__cta"
            onClick={() => onAction(nudge.action as NudgeAction)}
          >
            {nudge.ctaLabel}
          </button>
        )}
        <button type="button" className="nudge__dismiss" onClick={dismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </aside>
  );
}

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissed(keys: string[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(keys));
  } catch {
    // storage disabled (private mode) — nudge simply won't persist dismissal
  }
}
