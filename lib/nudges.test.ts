/**
 * Unit tests for lib/nudges.ts — Vitest style. Dates are built with explicit local
 * components (new Date(y, m, d, h)) so getHours() is timezone-stable across CI runners.
 */

import { describe, it, expect } from "vitest";
import { computeNudge, pickProteinFoods, daysSince, type NudgeInput } from "./nudges";
import type { DayTotals } from "./dto";

const allOn = { remindMeals: true, remindWater: true, remindProtein: true, remindWeighin: true };
const profile = { proteinTarget: 150, waterTarget: 8 };
const RECENT = "2026-07-08"; // ~2 days before the test "now", keeps weigh-in quiet

function totals(p: Partial<DayTotals> = {}): DayTotals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0, ...p };
}
function at(hour: number): Date {
  return new Date(2026, 6, 10, hour, 0, 0); // 2026-07-10 local
}
function input(over: Partial<NudgeInput>): NudgeInput {
  return {
    now: at(12),
    profile,
    totals: totals(),
    meals: [],
    settings: allOn,
    lastWeightLoggedAt: RECENT,
    ...over,
  };
}

describe("breakfast nudge", () => {
  it("fires when no meals by 11:00", () => {
    const n = computeNudge(input({ now: at(11), meals: [] }));
    expect(n?.kind).toBe("breakfast");
    expect(n?.key).toBe("breakfast:2026-07-10");
    expect(n?.action).toBe("open-capture");
  });

  it("stays quiet before 11:00", () => {
    expect(computeNudge(input({ now: at(9), meals: [] }))).toBeNull();
  });

  it("respects the remindMeals setting", () => {
    const n = computeNudge(
      input({ now: at(11), meals: [], settings: { ...allOn, remindMeals: false } }),
    );
    expect(n).toBeNull();
  });
});

describe("protein nudge", () => {
  it("fires after 15:00 when protein < 40% of target", () => {
    const n = computeNudge(
      input({ now: at(16), meals: [{ id: "m1" }], totals: totals({ protein: 30, water: 8 }) }),
    );
    expect(n?.kind).toBe("protein");
    expect(n?.body).toContain("20%");
    expect(n?.body).toContain("chicken"); // largest fitting food for a 120g gap
  });

  it("does not fire when protein is on track", () => {
    const n = computeNudge(
      input({ now: at(16), meals: [{ id: "m1" }], totals: totals({ protein: 120, water: 8 }) }),
    );
    expect(n).toBeNull();
  });
});

describe("water nudge", () => {
  it("fires after 16:00 under half water, when protein is fine", () => {
    const n = computeNudge(
      input({ now: at(17), meals: [{ id: "m1" }], totals: totals({ protein: 150, water: 2 }) }),
    );
    expect(n?.kind).toBe("water");
    expect(n?.body).toContain("2 of 8");
  });
});

describe("priority", () => {
  it("breakfast outranks protein when there are no meals", () => {
    const n = computeNudge(input({ now: at(16), meals: [], totals: totals({ protein: 0 }) }));
    expect(n?.kind).toBe("breakfast");
  });
});

describe("weigh-in nudge", () => {
  it("fires when the last weigh-in is >30 days old", () => {
    const n = computeNudge(
      input({
        now: at(20),
        meals: [{ id: "m1" }],
        totals: totals({ protein: 150, water: 8 }),
        lastWeightLoggedAt: "2026-05-20",
      }),
    );
    expect(n?.kind).toBe("weighin");
    expect(n?.action).toBe("open-checkin");
  });

  it("fires with 'start tracking' copy when never logged", () => {
    const n = computeNudge(
      input({
        now: at(20),
        meals: [{ id: "m1" }],
        totals: totals({ protein: 150, water: 8 }),
        lastWeightLoggedAt: null,
      }),
    );
    expect(n?.kind).toBe("weighin");
    expect(n?.body).toContain("start tracking");
  });
});

describe("helpers", () => {
  it("daysSince handles YYYY-MM-DD, ISO, and missing", () => {
    const now = at(12);
    expect(daysSince("2026-07-08", now)).toBeGreaterThanOrEqual(1);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("not-a-date", now)).toBeNull();
  });

  it("pickProteinFoods returns two labelled foods", () => {
    expect(pickProteinFoods(120)).toEqual(["a chicken breast (~43g)", "a tin of tuna (~25g)"]);
    // tiny gap → smallest two as a fallback
    expect(pickProteinFoods(10)).toEqual(["2 eggs (~12g)", "cottage cheese (~14g)"]);
  });
});
