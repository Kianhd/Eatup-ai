/**
 * Stage-2 · A — Weight-over-time line chart with a goal-weight reference line.
 * Hand-rolled SVG, no chart lib. Responsive (viewBox + width:100%), dark-friendly.
 * Styling is placeholder classNames only — integrator maps to the design system.
 */

import type { WeightPoint } from "../../lib/stage2.dto";
import {
  DEFAULT_INSETS,
  extent,
  makeScale,
  niceTicks,
  padDomain,
  toPath,
} from "../../lib/svg";

type Props = {
  weights: WeightPoint[];
  goalWeightKg: number | null;
  /** Optional loading flag so the parent can render this component during fetch. */
  loading?: boolean;
};

const W = 320;
const H = 180;

export function WeightChart({ weights, goalWeightKg, loading = false }: Props) {
  if (loading) {
    return (
      <figure className="chart chart--weight chart--loading" aria-busy="true">
        <figcaption className="chart__title">Weight</figcaption>
        <div className="chart__skeleton" style={{ aspectRatio: `${W} / ${H}` }} />
      </figure>
    );
  }

  if (weights.length === 0) {
    return (
      <figure className="chart chart--weight chart--empty">
        <figcaption className="chart__title">Weight</figcaption>
        <p className="chart__empty">No weigh-ins yet. Log your weight to see the trend.</p>
      </figure>
    );
  }

  const { top, right, bottom, left } = DEFAULT_INSETS;
  const innerW = W - left - right;
  const innerH = H - top - bottom;

  const kgs = weights.map((w) => w.kg);
  if (goalWeightKg != null) kgs.push(goalWeightKg);
  const [yMin, yMax] = padDomain(extent(kgs));

  const x = makeScale(0, Math.max(1, weights.length - 1), left, left + innerW);
  const y = makeScale(yMin, yMax, top + innerH, top); // inverted: higher kg = higher up

  const points: Array<[number, number]> = weights.map((w, i) => [x(i), y(w.kg)]);
  const path = toPath(points);
  const yTicks = niceTicks(yMin, yMax, 4);

  const latest = weights[weights.length - 1];
  const goalY = goalWeightKg != null ? y(goalWeightKg) : null;

  return (
    <figure className="chart chart--weight">
      <figcaption className="chart__title">
        Weight{" "}
        <span className="chart__value tabular-nums">{latest.kg.toFixed(1)} kg</span>
      </figcaption>
      <svg
        className="chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Weight trend, latest ${latest.kg.toFixed(1)} kilograms`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* gridlines + y labels */}
        {yTicks.map((t) => (
          <g key={t}>
            <line
              className="chart__grid"
              x1={left}
              x2={left + innerW}
              y1={y(t)}
              y2={y(t)}
            />
            <text className="chart__axis tabular-nums" x={left - 6} y={y(t)} dy="0.32em" textAnchor="end">
              {t.toFixed(0)}
            </text>
          </g>
        ))}

        {/* goal reference line */}
        {goalY != null && (
          <g>
            <line
              className="chart__goal-line"
              x1={left}
              x2={left + innerW}
              y1={goalY}
              y2={goalY}
              strokeDasharray="4 4"
            />
            <text className="chart__goal-label tabular-nums" x={left + innerW} y={goalY - 4} textAnchor="end">
              goal {goalWeightKg!.toFixed(1)}
            </text>
          </g>
        )}

        {/* series */}
        <path className="chart__line" d={path} fill="none" />
        {points.map(([px, py], i) => (
          <circle
            key={weights[i].day}
            className="chart__dot"
            cx={px}
            cy={py}
            r={i === points.length - 1 ? 3.5 : 2}
          />
        ))}
      </svg>
    </figure>
  );
}
