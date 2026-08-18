import type { FeedItem, MessageItem } from "@/components/agent/agent-event-feed";

/**
 * DIVIDING THE AGENT'S THREAD INTO BLOCKS, apart from rendering: each TURN closed by
 * a `summary` becomes a `turn` block (foldable unrolled + final summary visible
 * below), the rest (user messages, tour in progress or paused without summary) remains
 * in items `loose` displayed as is.
 *
 * Here rather than in the component because it's half the thread that has
 * RULES — and none practiced while living in a `.tsx` (the rest
 * only looks at `lib/**`). The `FeedItem` type remains in the component which constructed it: the import is a TYPE import, deleted during compilation.
 */

/**
 * A TURN: accordion of the unfolding.
 * • ACTIVE (agent at work) → open by default, live chrono “Worked since `key` derives from the 1st work item (stable between active and completed state of the same
 * turn) → the SAME instance persists, hence the auto close animation.
 */
export type Block =
  | {
      type: "turn";
      key: string;
      work: FeedItem[];
      /** What ENDS the round and remains visible under the folded unfolding: the response
 * of the model, or the exhausted budget card (the round ends there too). */
      summary: TurnCloser | null;
      /** Block(s) “changed files” of the tour — rendered UNDER the summary, excluding accordion. */
      files: FeedItem[];
      startedAt: string;
      endedAt: string | null;
      active: boolean;
      /** The round stopped WITHOUT concluding (user stop) → a line
 * says so under the sequence. Absent when an error, just below, says
 * already why it stopped. */
      interrupted?: boolean;
    }
  | { type: "loose"; item: FeedItem };

/** Stable key of an item (event id) — serves as a turn key via its 1st job. */
function itemKey(it: FeedItem): string {
  return it.kind === "message" ? it.message.id : it.id;
}

/** Items which close a round: the final answer, or the stop on exhausted budget. */
export type TurnCloser = MessageItem | Extract<FeedItem, { kind: "quota" }>;

function closesTurn(it: FeedItem): it is TurnCloser {
  return it.kind === "quota" || (it.kind === "message" && !!it.isSummary);
}

/**
 * Items which CONCLUDE the round which has just ended — they arrive AFTER the summary,
 * therefore after the round has closed, and are stored UNDER it.
 *
 * ⚠ **This list must be kept up to date, and forgetting it is not obvious type.**
 * An end-of-turn event that is not there becomes WORK: it reopens a turn to
 * on its own, and as nothing ever concludes it, this ghost turn is displayed
 * “Interrupted turn” under the one that has just succeeded. This happened with
 * `current_repo_overlap` (MIN-358): the fault was only seen in current deposit
 * mode, that is to say only on a local run, and it caused a successful turn to be passed for a cut turn.
 */
function concludesTurn(it: FeedItem): boolean {
  return (
    it.kind === "files" ||
    // What the commit took away from the human work: a conclusion ON the
    // tour, just like its list of files.
    (it.kind === "note" && it.variant === "currentRepoOverlap")
  );
}

/**
 * Items that a STOPPED turn keeps UNDER its folded unfolding, never inside: what
 * concludes the turn, and what explains its stopping (harness error). These are the
 * only things we want to read without having to unfold.
 */
function staysBelowTurn(it: FeedItem): boolean {
  return concludesTurn(it) || (it.kind === "note" && it.variant === "error");
}

export function buildBlocks(items: FeedItem[], active: boolean): Block[] {
  const blocks: Block[] = [];
  let work: FeedItem[] = [];
  const flush = () => {
    for (const it of work) blocks.push({ type: "loose", item: it });
    work = [];
  };

  // Last pushed round: receives the “files changed” block which follows it (the event
  // arrives AFTER the summary which has already closed the round).
  const lastTurn = (): Extract<Block, { type: "turn" }> | null => {
    const b = blocks[blocks.length - 1];
    return b && b.type === "turn" ? b : null;
  };

  for (const it of items) {
    // What CONCLUDES a round (files changed, overlap with the work of
    // the human): attached to the turn he closes, given under his response. Without tower
    // immediately before (loose summary, or active turn) → free item.
    if (concludesTurn(it)) {
      // Never list the CURRENT round under the PREVIOUS round: live
      // precedes the events (it does not pass through the base), so `work` can be
      // still empty when the first edition arrives — and the block would have been put away
      // under the answer from before.
      const live = it.kind === "files" && it.live;
      const turn = work.length === 0 && !live ? lastTurn() : null;
      if (turn) turn.files.push(it);
      else work.push(it);
      continue;
    }
    // A user message separates the turns: it remains visible, and closes all work in
    // course not summarized (tour paused) → displayed unfolded.
    if (it.kind === "message" && it.message.role === "user") {
      flush();
      blocks.push({ type: "loose", item: it });
      continue;
    }
    // Closing of the round (final response, or exhausted budget): the work is folded, this
    // which closes remains visible below.
    if (closesTurn(it)) {
      if (work.length > 0) {
        blocks.push({
          type: "turn",
          key: itemKey(work[0]),
          work,
          summary: it,
          files: [],
          startedAt: work[0].createdAt || it.createdAt,
          endedAt: (it.kind === "message" ? it.endedAt : null) || it.createdAt,
          active: false,
        });
        work = [];
      } else {
        // No work to fold → we show the summary as is.
        blocks.push({ type: "loose", item: it });
      }
      continue;
    }
    work.push(it);
  }
  // What's left is NOT work — a live file list, an error —
  // and therefore does not open a turn on its own. Without this test, the living list which
  // survives the summary for a second or two (the direct doesn't let go until `files_changed`
  // end of turn) made a SECOND accordion under the answer, with its own
  // chrono: the round was duplicated on the screen, as if a new one had just opened.
  if (work.length > 0 && work.every(staysBelowTurn)) {
    flush();
  } else if (active && work.length > 0) {
    // Remaining work without final answer. The agent is WORKING → ACTIVE turn (accordion
    // ouvert, chrono live).
    // Answer being written: it takes the place of the summary, under
    // the accordion, exactly where the final message will land.
    const tail = work[work.length - 1];
    const liveAnswer = tail.kind === "message" && tail.isLiveAnswer ? tail : null;
    blocks.push({
      type: "turn",
      key: itemKey(work[0]),
      work: liveAnswer ? work.slice(0, -1) : work,
      summary: liveAnswer,
      files: [],
      startedAt: work[0].createdAt,
      endedAt: null,
      active: true,
    });
    work = [];
  } else if (work.length > 0) {
    // AT REST with a round that never concluded: he was stopped — “stop”
    // of the user, most often. It's a trick like any other, and it keeps
    // therefore his accordion, folded back to “Worked for X”. It was pouring
    // so far unfolded in the thread, including the timer: clicking “stop” deleted
    // the only line that said how long the agent had been working, and
    // spread out its entire unfolding instead.
    const endedAt = work[work.length - 1].createdAt || null;
    const below: FeedItem[] = [];
    while (work.length > 0 && staysBelowTurn(work[work.length - 1])) {
      below.unshift(work.pop()!);
    }
    if (work.length > 0) {
      blocks.push({
        type: "turn",
        key: itemKey(work[0]),
        work,
        summary: null,
        files: below,
        startedAt: work[0].createdAt,
        endedAt,
        active: false,
        // An error already SAYS why the tour stops there; “interrupted”
        // under it would only repeat it, less well.
        interrupted: !below.some((it) => it.kind === "note" && it.variant === "error"),
      });
      work = [];
    } else {
      // Nothing to fold (the trick is just a boot error) → as is.
      work = below;
    }
  }
  flush();
  return blocks;
}
