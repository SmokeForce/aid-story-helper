import { describe, it, expect } from "vitest";
import {
  HEIGHT_NORMALS, HANDEDNESS_LEFT_RATE, MALE_BUILD_BY_HEIGHT, FEMALE_BUILD_BY_HEIGHT,
  bandForHeight, SCALE_TIER_WEIGHTS, CUP_DISTRIBUTION_WORN,
} from "../src/inference/phenotype/tables";

describe("phenotype tables", () => {
  it("height normals match the spec", () => {
    expect(HEIGHT_NORMALS.western.male).toEqual({ mean: 69.1, sd: 2.9 });
    expect(HEIGHT_NORMALS.western.female).toEqual({ mean: 63.5, sd: 2.7 });
    expect(HEIGHT_NORMALS.global.male.mean).toBe(67.5);
  });

  it("handedness left-rate is gendered and ~10%", () => {
    expect(HANDEDNESS_LEFT_RATE.male).toBeCloseTo(0.116, 3);
    expect(HANDEDNESS_LEFT_RATE.female).toBeCloseTo(0.095, 3);
  });

  it("build tables are ordered and non-overlapping in height", () => {
    for (const bands of [MALE_BUILD_BY_HEIGHT, FEMALE_BUILD_BY_HEIGHT]) {
      for (let i = 1; i < bands.length; i++) expect(bands[i]!.loIn).toBeGreaterThan(bands[i - 1]!.hiIn);
    }
  });

  it("bandForHeight selects the containing band and clamps outside", () => {
    const b = bandForHeight(MALE_BUILD_BY_HEIGHT, 70); // 5'10"
    expect(70).toBeGreaterThanOrEqual(b.loIn);
    expect(70).toBeLessThanOrEqual(b.hiIn);
    // clamps below/above the table
    expect(bandForHeight(MALE_BUILD_BY_HEIGHT, 40)).toBe(MALE_BUILD_BY_HEIGHT[0]!);
    expect(bandForHeight(MALE_BUILD_BY_HEIGHT, 99)).toBe(MALE_BUILD_BY_HEIGHT[MALE_BUILD_BY_HEIGHT.length - 1]!);
  });

  it("scale tier weights sum to 1 and match the 5/25/40/25/5 split", () => {
    expect(SCALE_TIER_WEIGHTS).toEqual([0.05, 0.25, 0.40, 0.25, 0.05]);
    expect(SCALE_TIER_WEIGHTS.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("worn cup distribution sums to 1 and is modal-B", () => {
    const total = CUP_DISTRIBUTION_WORN.reduce((a, t) => a + t.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    const modal = CUP_DISTRIBUTION_WORN.slice().sort((x, y) => y.weight - x.weight)[0]!;
    expect(modal.letter).toBe("B");
  });
});
