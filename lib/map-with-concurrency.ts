/**
 * Maps `items` through `fn` with at most `limit` calls in flight, and returns
 * the results in input order.
 *
 * Bulk tools (MCP and Numo) use it so a 50-issue edit does not wait for each
 * issue's round trips before starting the next one, without opening 50 database
 * requests at once either.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workers = Math.max(1, Math.min(Math.floor(limit), items.length));
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    }),
  );
  return results;
}

/** Parallel writes per bulk tool call: fast enough, gentle on the database. */
export const BULK_WRITE_CONCURRENCY = 8;
