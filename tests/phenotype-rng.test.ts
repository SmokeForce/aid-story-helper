import { describe, it, expect } from "vitest";
import { clamp, hashSeed, mulberry32, gaussian, truncatedNormal } from "../src/inference/phenotype/rng";

describe("phenotype rng", () => {
  it("clamp bounds a value", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it("hashSeed is deterministic and non-negative", () => {
    expect(hashSeed("veya vallois")).toBe(hashSeed("veya vallois"));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
    expect(hashSeed("x")).toBeGreaterThanOrEqual(0);
  });

  it("mulberry32 is deterministic per seed and in [0,1)", () => {
    const a = mulberry32(123), b = mulberry32(123);
    const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    for (const x of seqA) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
    expect(mulberry32(999)()).not.toBe(mulberry32(123)());
  });

  it("truncatedNormal always returns within [lo,hi]", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 500; i++) {
      const x = truncatedNormal(64, 3, 60, 68, rng);
      expect(x).toBeGreaterThanOrEqual(60);
      expect(x).toBeLessThanOrEqual(68);
    }
  });

  it("gaussian mean/sd are approximately recovered over 20k draws", () => {
    const rng = mulberry32(7);
    let sum = 0, sum2 = 0, n = 20000;
    for (let i = 0; i < n; i++) { const x = gaussian(rng, 10, 2); sum += x; sum2 += x * x; }
    const mean = sum / n, sd = Math.sqrt(sum2 / n - mean * mean);
    expect(mean).toBeGreaterThan(9.85); expect(mean).toBeLessThan(10.15);
    expect(sd).toBeGreaterThan(1.9); expect(sd).toBeLessThan(2.1);
  });
});
