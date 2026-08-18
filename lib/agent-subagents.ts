import type { AgentRunEvent } from "./agent-api";

/** A sub-agent (MIN-112) of the current round, as shown in the events thread. */
export interface TurnSubagent {
  /** Readable id that the parent is handling (`sub-1`). */
  id: string;
  mode: "explore" | "implement" | null;
  /** `created_at` of his first event: the start of his time. */
  startedAt: string;
  /** `created_at` de l'event qui l'a close, ou `null` tant qu'elle tourne. */
  endedAt: string | null;
}

/** Ce qui referme un tour, ou en ouvre un autre — hors events de sous-agent. */
function opensNewTurn(type: AgentRunEvent["type"]): boolean {
  return (
    type === "summary" ||
    type === "question" ||
    type === "quota_exhausted" ||
    type === "user_message"
  );
}

/**
 * The sub-agents of the CURRENT TOUR, from the oldest to the most recent, with
 * those who have already submitted their report.
 *
 * The turn, and not the session: it is the unit to which the thread already tells everything
 * the rest (one accordion of work per turn). The girls from a past round did not
 * nothing more to say — their report has arrived, the parent has responded — and list them
 * would make the map grow with each delegation of the conversation.
 *
 * A girl is FINISHED as soon as she has handed in her summary, failed, or the parent has
 * announced the delivery of its report (`status` / `phase: subagent_report`) — this
 * last case is the only signal of a CUT girl, which emits neither one nor
 * the other. Same rules as the aggregation of the thread (`buildFeed`), which draws the
 * folded blocks.
 *
 * Why it's special: while a girl is working, the PARENT is stuck and
 * emits nothing. The wire no longer moves at all, and the only thing that says that
 * the session is alive is buried in a folded line, somewhere more
 * high. The card above the dial brings it up before the eyes.
 */
export function turnSubagents(events: AgentRunEvent[]): TurnSubagent[] {
  const collected = new Map<string, TurnSubagent>();

  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const p = e.payload ?? {};
    const id = typeof p.subagent_id === "string" ? p.subagent_id : "";

    if (id) {
      let block = collected.get(id);
      if (!block) {
        block = {
          id,
          mode:
            p.subagent_mode === "implement"
              ? "implement"
              : p.subagent_mode === "explore"
                ? "explore"
                : null,
          startedAt: e.created_at,
          endedAt: null,
        };
        collected.set(id, block);
      }
      if (e.type === "summary" || e.type === "error") block.endedAt ??= e.created_at;
      continue;
    }

    // The parent announces that a report has been given to him: this is the only moment of
    // end of a cut girl, which emits neither summary nor error.
    if (e.type === "status" && p.phase === "subagent_report" && typeof p.id === "string") {
      const block = collected.get(p.id);
      if (block) block.endedAt ??= e.created_at;
      continue;
    }

    // The round closes (final answer, question, budget exhausted) or a message
    // of the user opens another: the above belongs to the round before.
    if (opensNewTurn(e.type)) collected.clear();
  }

  return [...collected.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
