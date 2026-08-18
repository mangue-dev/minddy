/**
 * THE END OF TURN COMMIT MESSAGE — the first line of what the agent responded to, cleaned and bounded, with a fallback when it says nothing.
 *
 * PUR module, taken out of [vm/turn.ts](vm/turn.ts) by MIN-286. Two engines
 * now commit: the home loop and the opencode supervisor. Leaving
 * in one forced the other to import it — therefore dragging the whole loop into
 * its graph, while it is doomed to disappear in batch 3.
 */

/** The commit message for a round, derived from the agent's response. */
export function commitMessageFromReply(reply: string, identifier: string): string {
  const firstLine = reply.split("\n").find((l) => l.trim())?.trim() ?? "";
  const cleaned = firstLine.replace(/[#*_`>]+/g, "").trim();
  if (cleaned.length >= 8) return cleaned.length <= 72 ? cleaned : `${cleaned.slice(0, 69)}…`;
  return `wip(${identifier}): agent update`;
}
