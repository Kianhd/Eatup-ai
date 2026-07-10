/**
 * Stage-2 · A — Daily calories (last 14 days) as bars vs a target reference line.
 * Bars over target are flagged with a placeholder modifier class for the design system.
 * Hand-rolled SVG, responsive, dark-friendly, tabular-nums labels.
 */

import type { DayMacroPoint } from "../../lib/stage2.dto";
import { DEFAULT_INSETS, makeScale, niceTicks } from "../../lib/svg";

type Props = {
  days: DayMacroPoint[]; // ascending, zero-filled, length ~14
  calorieTarget: number;
  loading?: boolean;
};

const W = 320;
const H = 180;

export function CaloriesChart({ days, calorieTarget, loading = false }: Props) {
  if (loading) {
    return (
      <figure className="chart chart--calories chart--loading" aria-busy="true">
        <figcaption className="chart__title">Calories · 14 days</figcaption>
        <div className="chart__skeleton" style={{ aspectRatio: `${W} / ${H}` }} />
      </figure>
    );
  }

  const hasData = days.some((d) => d.kcal > 0);
  if (!hasData) {
    return (
      <figure className="chart chart--calories chart--empty">
        <figcaption className="chart__title">Calories · 14 days</figcaption>
        <p className="chart__empty">No meals logged in the last 14 days.</p>
      </figure>
    );
  }

  const { top, right, bottom, left } = DEFAULT_INSETS;
  const innerW = W - left - right;
  const innerH = H - top - bottom;

  const maxVal = Math.max(calorieTarget, ...days.map((d) => d.kcal), 1);
  const yMax = maxVal * 1.1;
  const y = makeScale(0, yMax, top + innerH, top);
  const baseline = top + innerH;

  const slot = innerW / days.length;
  const barW = Math.max(2, slot * 0.62);
  const targetY = y(calorieTarget);
  const yTicks = niceTicks(0, yMax, 4);

  return (
    <figure className="chart chart--calories">
      <figcaption className="chart__title">
        Calories · 14 days{" "}
        <span className="chart__value tabular-nums">target {calorieTarget}</span>
      </figcaption>
      <svg
        className="chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Daily calories over the last 14 days versus a target of ${calorieTarget}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line className="chart__grid" x1={left} x2={left + innerW} y1={y(t)} y2={y(t)} />
            <text className="chart__axis tabular-nums" x={left - 6} y={y(t)} dy="0.32em" textAnchor="end">
              {t.toFixed(0)}
            </text>
          </g>
        ))}

        {days.map((d, i) => {
          const cx = left + slot * i + (slot - barW) / 2;
          const topY = d.kcal > 0 ? y(d.kcal) : baseline;
          const over = calorieTarget > 0 && d.kcal > calorieTarget;
          return (
            <rect
              key={d.day}
              className={`chart__bar${over ? " chart__bar--over" : ""}`}
              x={cx}
              y={topY}
              width={barW}
              height={Math.max(0, baseline - topY)}
              rx={1.5}
            >
              <title>{`${d.day}: ${d.kcal} kcal`}</title>
            </rect>
          );
        })}

        {/* target reference line */}
        {calorieTarget > 0 && (
          <line
            className="chart__target-line"
            x1={left}
            x2={left + innerW}
            y1={targetY}
            y2={targetY}
            strokeDasharray="4 4"
          />
        )}
      </svg>
    </figure>
  );
}
