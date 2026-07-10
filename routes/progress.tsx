/**
 * Stage-2 · A — /progress route.
 *
 * Data is fetched client-side anchored on the user's LOCAL day (SSR can't know the
 * client's timezone), so charts show a loading state first, then paint. The AI
 * insights card fetches independently so a slow/rate-limited model never blocks charts.
 *
 * INTEGRATION: file-based routing path is assumed to be `/progress`. If your router
 * uses a different createFileRoute id or a layout wrapper, adjust the id below.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getProgress } from "../lib/progress.server";
import type { ProgressDto } from "../lib/stage2.dto";
import { WeightChart } from "../components/progress/WeightChart";
import { CaloriesChart } from "../components/progress/CaloriesChart";
import { WeeklyProteinChart } from "../components/progress/WeeklyProteinChart";
import { InsightsCard } from "../components/progress/InsightsCard";

export const Route = createFileRoute("/progress")({
  component: ProgressPage,
});

/** Local 'YYYY-MM-DD' without pulling in a date lib; client-only (guarded by effect). */
function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ProgressPage() {
  const run = useServerFn(getProgress);
  const [today, setToday] = useState<string | null>(null);
  const [data, setData] = useState<ProgressDto | null>(null);
  const [failed, setFailed] = useState(false);

  // Resolve the local day only on the client to stay SSR-safe.
  useEffect(() => {
    setToday(localToday());
  }, []);

  useEffect(() => {
    if (!today) return;
    let alive = true;
    setFailed(false);
    setData(null);
    (async () => {
      try {
        const res = await run({ data: { today } });
        if (alive) setData(res);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [run, today]);

  const loading = !failed && data === null;

  return (
    <main className="progress-page">
      <header className="progress-page__header">
        <h1 className="progress-page__title">Progress</h1>
        {data && (
          <p className="progress-page__summary tabular-nums">
            {data.averages.weightChangeKg != null && (
              <span>
                {data.averages.weightChangeKg > 0 ? "+" : ""}
                {data.averages.weightChangeKg} kg overall ·{" "}
              </span>
            )}
            <span>avg {data.averages.avgCalories14} kcal</span> ·{" "}
            <span>avg {data.averages.avgProtein14} g protein</span>
          </p>
        )}
      </header>

      {failed && (
        <p className="progress-page__error">Couldn't load your progress. Pull to refresh.</p>
      )}

      <section className="progress-page__charts">
        <WeightChart
          weights={data?.weights ?? []}
          goalWeightKg={data?.goalWeightKg ?? null}
          loading={loading}
        />
        <CaloriesChart
          days={data?.days ?? []}
          calorieTarget={data?.calorieTarget ?? 0}
          loading={loading}
        />
        <WeeklyProteinChart
          weeks={data?.averages.weeklyProtein ?? []}
          proteinTarget={data?.proteinTarget ?? 0}
          loading={loading}
        />
      </section>

      {today && <InsightsCard today={today} />}
    </main>
  );
}
