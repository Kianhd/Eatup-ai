/**
 * Unit tests for lib/units.ts — Vitest style (describe/it/expect). Point your runner here;
 * `import { describe, it, expect } from "vitest"` if your harness needs explicit imports.
 */

import { describe, it, expect } from "vitest";
import {
  kgToLb,
  lbToKg,
  cmToFeetInches,
  feetInchesToCm,
  formatWeight,
  formatHeight,
  weightInputValue,
  weightInputToKg,
} from "./units";

describe("weight conversions", () => {
  it("kg↔lb round-trips within rounding", () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2);
    expect(lbToKg(220.462)).toBeCloseTo(100, 3);
  });

  it("known values", () => {
    expect(kgToLb(0)).toBe(0);
    expect(Math.round(kgToLb(70))).toBe(154);
    expect(lbToKg(150)).toBeCloseTo(68.039, 2);
  });
});

describe("height conversions", () => {
  it("splits cm into feet + inches", () => {
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 11 });
    expect(cmToFeetInches(152.4)).toEqual({ feet: 5, inches: 0 });
  });

  it("carries 12 inches into a foot at the rounding boundary", () => {
    // 179.5cm ≈ 70.67in → rounds to 71in → 5'11", never 5'12"
    const r = cmToFeetInches(179.5);
    expect(r.inches).toBeLessThan(12);
    expect(r).toEqual({ feet: 5, inches: 11 });
  });

  it("feet+inches → cm", () => {
    expect(feetInchesToCm(5, 11)).toBeCloseTo(180.34, 2);
    expect(feetInchesToCm(6, 0)).toBeCloseTo(182.88, 2);
  });
});

describe("display formatters", () => {
  it("weight respects units", () => {
    expect(formatWeight(80, "metric")).toBe("80 kg");
    expect(formatWeight(80, "imperial")).toBe("176.4 lb");
  });

  it("height respects units", () => {
    expect(formatHeight(180, "metric")).toBe("180 cm");
    expect(formatHeight(180, "imperial")).toBe(`5'11"`);
  });
});

describe("form input helpers", () => {
  it("weightInputValue/weightInputToKg invert (metric passthrough)", () => {
    expect(weightInputValue(72.5, "metric")).toBe(72.5);
    expect(weightInputToKg(72.5, "metric")).toBe(72.5);
  });

  it("weightInputValue/weightInputToKg invert (imperial)", () => {
    const shown = weightInputValue(72.5, "imperial"); // ~159.8 lb
    expect(weightInputToKg(shown, "imperial")).toBeCloseTo(72.5, 1);
  });
});
