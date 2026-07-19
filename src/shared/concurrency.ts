/**
 * Bounded-concurrency runner for async work, preserving input order in the results array.
 *
 * `fn(item, index)` should resolve rather than throw for expected failures (the generation helpers
 * here return a result object on failure); a genuine throw propagates out of `runBatch`.
 *
 * When `warmFirst` is true AND there is real fan-out to do (`limit > 1` and more than one item), the
 * FIRST item is awaited alone before the remaining items run concurrently. Callers use this so that a
 * cache prefix shared across the batch is WRITTEN by call #1 and merely READ by the parallel calls
 * that follow — otherwise every call races to write the same prefix and none of them benefit.
 */
export async function runBatch<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  warmFirst = false,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  if (items.length === 0) return results;

  let start = 0;
  if (warmFirst && limit > 1 && items.length > 1) {
    results[0] = await fn(items[0]!, 0);
    start = 1;
  }

  let next = start;
  const workers = Math.max(1, Math.min(limit, items.length - start));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]!, i);
      }
    }),
  );
  return results;
}
