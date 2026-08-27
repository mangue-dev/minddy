/**
 * Groups items by their numeric category rank while preserving stable order.
 *
 * The number of distinct ranks is tiny, while an account can expose thousands
 * of palette rows. Sorting the ranks instead of every row keeps an empty-query
 * palette open linear in its item count.
 */
export function orderByCategoryRank<T extends { filterCategory: string }>(
  items: readonly T[],
  categoryOrder: Readonly<Record<string, number>>,
): T[] {
  const buckets = new Map<number, T[]>();

  for (const item of items) {
    const rank = categoryOrder[item.filterCategory] ?? 999;
    const bucket = buckets.get(rank);
    if (bucket) bucket.push(item);
    else buckets.set(rank, [item]);
  }

  const ranks = Array.from(buckets.keys()).sort((a, b) => a - b);
  return ranks.flatMap((rank) => buckets.get(rank) ?? []);
}
