/**
 * Reconciliation of OPTIMIST user bubbles of the agent's conversation.
 *
 * A message sent to a session does not return immediately: it lands in
 * `agent_run_messages`, and does not become an event `user_message` (therefore a bubble) that
 * when the LOOP drains it — including waking up the sandbox, i.e. several
 * seconds. In the meantime, we display the bubble locally.
 *
 * The problem is knowing WHEN to remove it, without making it disappear too soon
 * (the user would think his message is lost) nor leaving it in duplicate once the echo
 * has arrived. Hence a MULTI-SET subtraction rather than a simple “does this text
 * already exist? »: two “continues” sent in a row must remain TWO
 * bubbles, and only remove one when the first echo arrives.
 *
 * Pure logic (without React): isolated here to be testable in node/vitest, like
 * prune.ts / caching.ts.
 */

/**
 * Pending messages which do NOT yet have their server echo - therefore those which
 * must still be displayed yourself.
 *
 * RETURNS THE INPUT ELEMENTS, not their texts: a waiting message also carries
 * its MENTIONS, and can find them afterwards by text equality
 * reassigned pills from the first "ok" to the second (the one that cited a
 * ticket). The text doesn't identify anything — that's the whole point of the
 * subtraction below.
 *
 * @param pending messages sent since the session was opened, in order.
 * The list is never purged in case of success: it's precisely this
 * which makes the subtraction work (n sent − m echoed = to display).
 * @param echoed texts of the `user` messages already present in the thread (echoes
 * server AND launch prompt).
 */
export function unechoedMessages<T extends string | { text: string }>(
  pending: readonly T[],
  echoed: readonly string[],
): T[] {
  const counts = new Map<string, number>();
  for (const text of echoed) {
    const key = text.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return pending.filter((message) => {
    const key = (typeof message === "string" ? message : message.text).trim();
    const left = counts.get(key) ?? 0;
    if (left > 0) {
      counts.set(key, left - 1); // this sending is consumed by its echo
      return false;
    }
    return true;
  });
}
