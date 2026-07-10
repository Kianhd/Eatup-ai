/**
 * Client hook: the user's LOCAL day as 'YYYY-MM-DD'. The client is the source of truth
 * for "today" (server has no timezone). Returns null during SSR/first paint to avoid a
 * hydration mismatch, then resolves on the client. Re-evaluates on tab refocus,
 * visibility change, and at the next local midnight.
 */

import { useEffect, useState } from "react";

export function localDayString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function useLocalDay(): string | null {
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setDay(localDayString());
    update();

    const onFocus = () => update();
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);

    // Fire once shortly after the next local midnight to roll the day over.
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      5,
    );
    const timer = setTimeout(update, nextMidnight.getTime() - now.getTime());

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer);
    };
  }, []);

  return day;
}
