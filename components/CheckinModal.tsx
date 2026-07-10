/**
 * Stage-2 · C — Monthly check-in modal flow.
 *   step "input"   → weight entry
 *   step "result"  → AI trend commentary + target diff
 * Calls saveCheckin on submit. SSR-safe (no top-level DOM). Placeholder classNames only.
 *
 * INTEGRATION: render conditionally when `open` is true; pass the user-local `day`.
 * `onClose` fires after the user dismisses; `onSaved` receives the CheckinDto so the
 * dashboard can refresh its targets.
 */

import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { saveCheckin } from "../lib/checkin.server";
import type { CheckinDto, MacroTargets, Stage2ErrorCode } from "../lib/stage2.dto";

type Props = {
  open: boolean;
  day: string; // user-local YYYY-MM-DD
  /** Prefill from the current profile weight, if available. */
  initialWeightKg?: number;
  onClose: () => void;
  onSaved?: (result: CheckinDto) => void;
};

type Phase =
  | { step: "input" }
  | { step: "saving" }
  | { step: "result"; result: CheckinDto }
  | { step: "error"; code: Stage2ErrorCode };

export function CheckinModal({
  open,
  day,
  initialWeightKg,
  onClose,
  onSaved,
}: Props) {
  const run = useServerFn(saveCheckin);
  const [weight, setWeight] = useState(
    initialWeightKg != null ? String(initialWeightKg) : "",
  );
  const [phase, setPhase] = useState<Phase>({ step: "input" });

  if (!open) return null;

  const weightNum = Number(weight);
  const valid = Number.isFinite(weightNum) && weightNum > 0 && weightNum <= 500;

  async function submit() {
    if (!valid) return;
    setPhase({ step: "saving" });
    try {
      const result = await run({ data: { weightKg: weightNum, day } });
      setPhase({ step: "result", result });
      onSaved?.(result);
    } catch (err) {
      setPhase({ step: "error", code: readCode(err) });
    }
  }

  return (
    <div className="checkin" role="dialog" aria-modal="true" aria-label="Monthly check-in">
      <div className="checkin__backdrop" onClick={onClose} />
      <div className="checkin__panel">
        {(phase.step === "input" ||
          phase.step === "saving" ||
          phase.step === "error") && (
          <form
            className="checkin__form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h2 className="checkin__title">Monthly check-in</h2>
            <p className="checkin__subtitle">Log today's weight to refresh your targets.</p>

            <label className="checkin__label" htmlFor="checkin-weight">
              Weight (kg)
            </label>
            <input
              id="checkin-weight"
              className="checkin__input tabular-nums"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="1"
              max="500"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              autoFocus
              disabled={phase.step === "saving"}
            />

            {phase.step === "error" && (
              <p className="checkin__error">
                {phase.code === "rate_limit"
                  ? "Coach is busy. Your weight was saved if you already submitted — try again."
                  : "Something went wrong. Please try again."}
              </p>
            )}

            <div className="checkin__actions">
              <button
                type="button"
                className="checkin__btn checkin__btn--ghost"
                onClick={onClose}
                disabled={phase.step === "saving"}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="checkin__btn checkin__btn--primary"
                disabled={!valid || phase.step === "saving"}
              >
                {phase.step === "saving" ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}

        {phase.step === "result" && (
          <CheckinResult result={phase.result} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

function CheckinResult({
  result,
  onDone,
}: {
  result: CheckinDto;
  onDone: () => void;
}) {
  return (
    <div className="checkin__result">
      <h2 className="checkin__title">You're checked in</h2>

      <p className="checkin__commentary">{result.commentary}</p>

      {result.trend.changeKg != null && (
        <p className="checkin__trend tabular-nums">
          {result.trend.changeKg > 0 ? "+" : ""}
          {result.trend.changeKg} kg since last check-in
          {result.trend.etaWeeks != null && <> · ~{result.trend.etaWeeks} wks to goal</>}
        </p>
      )}

      <h3 className="checkin__diff-title">Updated targets</h3>
      <ul className="checkin__diff">
        <DiffRow label="Calories" unit="kcal" prev={result.previousTargets} next={result.newTargets} diff={result.diff} field="calories" />
        <DiffRow label="Protein" unit="g" prev={result.previousTargets} next={result.newTargets} diff={result.diff} field="protein" />
        <DiffRow label="Carbs" unit="g" prev={result.previousTargets} next={result.newTargets} diff={result.diff} field="carbs" />
        <DiffRow label="Fat" unit="g" prev={result.previousTargets} next={result.newTargets} diff={result.diff} field="fat" />
      </ul>

      <div className="checkin__actions">
        <button type="button" className="checkin__btn checkin__btn--primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

function DiffRow({
  label,
  unit,
  prev,
  next,
  diff,
  field,
}: {
  label: string;
  unit: string;
  prev: MacroTargets;
  next: MacroTargets;
  diff: MacroTargets;
  field: keyof MacroTargets;
}) {
  const d = diff[field];
  const sign = d > 0 ? "up" : d < 0 ? "down" : "same";
  return (
    <li className="checkin__diff-row">
      <span className="checkin__diff-label">{label}</span>
      <span className="checkin__diff-values tabular-nums">
        <span className="checkin__diff-prev">{prev[field]}</span>
        <span className="checkin__diff-arrow" aria-hidden="true">→</span>
        <span className="checkin__diff-next">
          {next[field]} {unit}
        </span>
        {d !== 0 && (
          <span className={`checkin__diff-delta checkin__diff-delta--${sign}`}>
            {d > 0 ? "+" : ""}
            {d}
          </span>
        )}
      </span>
    </li>
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
