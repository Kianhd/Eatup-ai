/**
 * Stage-2 · A — Weekly average protein (g/day) as compact bars vs the protein target.
 * Complements the daily calories chart. Hand-rolled SVG, tabular-nums.
 */

import type { WeeklyProteinPoint } from "../../lib/stage2.dto";
import { DEFAULT_INSETS, makeScale, niceTicks } from "../../lib/svg";

type Props = {
  weeks: WeeklyProteinPoint[]; // oldest → newest
  proteinTarget: number;
  loading?: boolean;
};

const W = 320;
const H = 160;

export function WeeklyProteinChart({ weeks, proteinTarget, loading = false }: Props) {
  if (loading) {
    return (
      <figure className="chart chart--protein chart--loading" aria-busy="true">
        <figcaption className="chart__title">Protein · weekly avg</figcaption>
        <div className="chart__skeleton" style={{ aspectRatio: `${W} / ${H}` }} />
      </figure>
    );
  }

  if (weeks.length === 0) {
    return (
      <figure className="chart chart--protein chart--empty">
        <figcaption className="chart__title">Protein · weekly avg</figcaption>
        <p className="chart__empty">Log meals to see your weekly protein average.</p>
      </figure>
    );
  }

  const { top, right, bottom, left } = DEFAULT_INSETS;
  const innerW = W - left - right;
  const innerH = H - top - bottom;

  const maxVal = Math.max(proteinTarget, ...weeks.map((w) => w.protein), 1);
  const yMax = maxVal * 1.1;
  const y = makeScale(0, yMax, top + innerH, top);
  const baseline = top + innerH;

  const slot = innerW / weeks.length;
  const barW = Math.max(6, Math.min(40, slot * 0.5));
  const targetY = y(proteinTarget);
  const yTicks = niceTicks(0, yMax, 4);

  return (
    <figure className="chart chart--protein">
      <figcaption className="chart__title">
        Protein · weekly avg{" "}
        <span className="chart__value tabular-nums">target {proteinTarget}g</span>
      </figcaption>
      <svg
        className="chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Weekly average protein versus a target of ${proteinTarget} grams`}
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

        {weeks.map((wk, i) => {
          const cx = left + slot * i + (slot - barW) / 2;
          const topY = y(wk.protein);
          const hit = proteinTarget > 0 && wk.protein >= proteinTarget;
          return (
            <g key={wk.weekStart}>
              <rect
                className={`chart__bar${hit ? " chart__bar--hit" : ""}`}
                x={cx}
                y={topY}
                width={barW}
                height={Math.max(0, baseline - topY)}
                rx={1.5}
              >
                <title>{`week of ${wk.weekStart}: ${wk.protein} g/day`}</title>
              </rect>
              <text
                className="chart__axis tabular-nums"
                x={cx + barW / 2}
                y={baseline + 12}
                textAnchor="middle"
              >
                {wk.weekStart.slice(5)}
              </text>
            </g>
          );
        })}

        {proteinTarget > 0 && (
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
