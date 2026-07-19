import { describe, it, expect } from "vitest";
import { runBatch } from "../src/shared/concurrency";

/** A deferred promise + a manual resolver, for controlling completion order in tests. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("runBatch", () => {
  it("returns [] for an empty input", async () => {
    expect(await runBatch([], 4, async () => 1)).toEqual([]);
  });

  it("preserves input order in the results regardless of completion order", async () => {
    const out = await runBatch([10, 20, 30, 40], 2, async (n, i) => {
      // Later items finish sooner, to prove ordering is by index not by completion.
      await new Promise((r) => setTimeout(r, (4 - i) * 5));
      return n * 2;
    });
    expect(out).toEqual([20, 40, 60, 80]);
  });

  it("never runs more than `limit` tasks concurrently", async () => {
    let inFlight = 0;
    let peak = 0;
    await runBatch(Array.from({ length: 10 }, (_, i) => i), 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return n;
    });
    expect(peak).toBe(3);
  });

  it("warmFirst awaits item #0 alone before any other task starts", async () => {
    const started: number[] = [];
    const gate = deferred<void>();
    const results = runBatch(
      [0, 1, 2, 3],
      4,
      async (n) => {
        started.push(n);
        if (n === 0) await gate.promise; // hold call #0 open
        return n;
      },
      true,
    );
    // Give microtasks a chance: with warmFirst, only call #0 may have started.
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toEqual([0]);
    gate.resolve();
    expect(await results).toEqual([0, 1, 2, 3]);
    expect(started.slice(1).sort()).toEqual([1, 2, 3]);
  });

  it("without warmFirst, fan-out starts immediately (no serial warmup)", async () => {
    const started: number[] = [];
    await runBatch(
      [0, 1, 2],
      3,
      async (n) => { started.push(n); await new Promise((r) => setTimeout(r, 5)); return n; },
      false,
    );
    // All three were allowed to start under the limit.
    expect(started.sort()).toEqual([0, 1, 2]);
  });
});
