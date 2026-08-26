/** Reconciles optimistic user bubbles with durable server echoes. */

/**
 * Returns pending messages that do not yet have a matching server echo.
 *
 * Input elements are preserved because pending objects also carry mentions.
 *
 * Messages with durable IDs are matched only by ID. Legacy string messages use
 * multiset text subtraction so identical sends are consumed one echo at a time.
 */
type EchoedMessage = string | { text: string; id?: string; ids?: string[] };

export function unechoedMessages<
  T extends string | { text: string; id?: string },
>(pending: readonly T[], echoed: readonly EchoedMessage[]): T[] {
  const echoedIds = new Set(
    echoed.flatMap((message) =>
      typeof message !== "string"
        ? [...(message.id ? [message.id] : []), ...(message.ids ?? [])]
        : [],
    ),
  );
  const counts = new Map<string, number>();
  for (const message of echoed) {
    if (typeof message !== "string" && (message.id || message.ids?.length))
      continue;
    const text = typeof message === "string" ? message : message.text;
    const key = text.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return pending.filter((message) => {
    if (typeof message !== "string" && message.id) {
      return !echoedIds.has(message.id);
    }
    const key = (typeof message === "string" ? message : message.text).trim();
    const left = counts.get(key) ?? 0;
    if (left > 0) {
      counts.set(key, left - 1); // This send is consumed by its echo.
      return false;
    }
    return true;
  });
}
