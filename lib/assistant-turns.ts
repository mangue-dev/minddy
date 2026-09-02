import type { AssistantMessage } from "./assistant-types";
import { assistantMessageReasoning } from "./assistant-reasoning";

/**
 * Breaking the Numo feed into TURN, on parity with the code agent feed
 * (components/agent/agent-event-feed.tsx): everything Numo did BEFORE his
 * response (intermediate narration, tool calls) folds into an accordion
 * “Worked since X” / “Worked for X”, and only the final response
 * remains visible below. The user tracks the work in progress, then reads the
 * response — instead of receiving the entire turn of a block.
 *
 * One TURN = a user message, then everything Numo produces up to its
 * response. User messages always remain visible and separate turns — with one
 * exception: the ANSWER to an ask_user question continues the SAME round
 * (Numo merely paused mid-work), so asking a question never spawns a second
 * accordion.
 */

export type AssistantTurn = {
  kind: "turn";
  /**
 * Stable key throughout the life of the round (derived from the user message that
 * opens it) → the SAME accordion instance persists from work to response,
 * hence the automatic closing animation at the end of the round. Prefixed: the
 * message which opens it is rendered in BROTHER block, with its own id for key.
 */
  key: string;
  /** Unfolded to fold: the intermediate messages of the round. */
  work: AssistantMessage[];
  /** Response which ends the round, delivered UNDER the accordion (`null` = not there yet). */
  summary: AssistantMessage | null;
  /** ISO — start of the round (the user's submission, not the 1st step produced). */
  startedAt: string;
  /** ISO, or `null` as long as the trick is working (live clock). */
  endedAt: string | null;
  active: boolean;
};

export type AssistantBlock =
  | { kind: "message"; message: AssistantMessage }
  | AssistantTurn;

/** Messages that the thread does not return: neither work nor response. */
function isHidden(m: AssistantMessage): boolean {
  return m.role === "tool" || m.role === "system";
}

/**
 * Assistant message that ends a round by handing back to the user and WAITING
 * for their gesture: a seed suggestion (`propose_backlog`, MIN-173) waits for
 * the create action. What is answered does not fold into the unfolded: it
 * remains on the screen, under the accordion.
 *
 * `ask_user` is deliberately NOT here: a question is a pause inside the work,
 * not its end. The user's answer keeps riding the same round (see
 * `answersAskUser`), so the whole exchange shares one accordion.
 */
const HANDS_BACK = new Set(["propose_backlog"]);

/**
 * Does this user message ANSWER an `ask_user` question Numo just asked?
 * Mirrors the shell's absorption rule (assistant-shell.tsx): a user message
 * directly following an assistant message that carries an `ask_user` call IS
 * its answer — the server loop resumes on it, and the shell hides its bubble
 * behind the ask_user line.
 */
function answersAskUser(prev: AssistantMessage | null): boolean {
  return (
    prev?.role === "assistant" &&
    (prev.tool_calls ?? []).some((tc) => tc.function.name === "ask_user")
  );
}

function closesTurn(m: AssistantMessage): boolean {
  if (m.role !== "assistant") return false;
  if (m.content?.trim()) return true;
  return (m.tool_calls ?? []).some((tc) => HANDS_BACK.has(tc.function.name));
}

/**
 * Ids of messages which carry a "Copy" button: the RESPONSE of the round - the one
 * which remains alone under the accordion once folded into "Worked for Everything that is FOLDED in the unfolding has none: it is
 * intermediate work, not a takeaway answer.
 *
 * An ACTIVE turn carries NONE, not even under its tail: between two rounds (the
 * while the tools are turning) the last text received is found temporarily
 * in response position, while it is only the narration of the moment. The
 * button flashed from message to message while Numo was working, then landed on the real answer. It therefore only appears once the round is over.
 */
export function copyableMessageIds(blocks: AssistantBlock[]): Set<string> {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.kind === "message") {
      const m = block.message;
      if (m.role === "assistant" && m.content) ids.add(m.id);
    } else if (!block.active && block.summary?.content) {
      ids.add(block.summary.id);
    }
  }
  return ids;
}

export function buildAssistantBlocks(
  messages: AssistantMessage[],
  options: {
    /** Numo is working → the last lap is ACTIVE (accordion open, live timer). */
    active?: boolean;
    /**
 * The IN FLIGHT round has already produced something (text being written or
 * tool call gone). The last message received is then no longer the queue of the
 * turn: its text becomes the narration again and returns to the sequence, otherwise
 * it would remain displayed UNDER a work more recent than it.
 */
    pendingWork?: boolean;
  } = {},
): AssistantBlock[] {
  const { active = false, pendingWork = false } = options;
  const blocks: AssistantBlock[] = [];
  let work: AssistantMessage[] = [];
  // User message who opened the current round: carry their key and now
  // where the timer starts (sending — this is where the waiting begins).
  let opener: AssistantMessage | null = null;

  const flush = (isActive: boolean) => {
    const last = work[work.length - 1];
    const summary =
      last && closesTurn(last) && !(isActive && pendingWork) ? last : null;
    const folded = summary ? work.slice(0, -1) : work;

    // Nothing to fold (direct response without work, or empty turn) → messages such
    // what: an empty accordion would learn nothing. The ACTIVE tour keeps
    // on the other hand, its block, which houses the timer for the work in progress.
    if (
      !isActive &&
      folded.length === 0 &&
      !assistantMessageReasoning(summary)
    ) {
      for (const m of work) blocks.push({ kind: "message", message: m });
      work = [];
      return;
    }

    const startedAt =
      opener?.created_at || folded[0]?.created_at || last?.created_at || "";
    blocks.push({
      kind: "turn",
      key: `turn-${opener?.id ?? folded[0]?.id ?? last?.id ?? blocks.length}`,
      work: folded,
      summary,
      startedAt,
      endedAt: isActive ? null : (summary ?? last)?.created_at || startedAt,
      active: isActive,
    });
    work = [];
  };

  // Last non-hidden message read — tells a fresh user message apart from an
  // ask_user answer (same rule the shell uses to hide answer bubbles).
  let prevVisible: AssistantMessage | null = null;

  for (const m of messages) {
    if (isHidden(m)) continue;
    if (m.role === "user") {
      if (answersAskUser(prevVisible)) {
        // An answer to an ask_user question does NOT close the round: Numo
        // merely paused mid-work. The message rides inside the ongoing turn
        // (the shell maps it onto the ask_user line instead of showing a
        // bubble), which keeps the turn's key, timer and accordion.
        prevVisible = m;
        continue;
      }
      // A fresh user message closes the previous round (finished, or
      // interrupted without response — its work is then displayed as is) and
      // opens the next one.
      flush(false);
      blocks.push({ kind: "message", message: m });
      opener = m;
      prevVisible = m;
      continue;
    }
    work.push(m);
    prevVisible = m;
  }
  flush(active);

  return blocks;
}
