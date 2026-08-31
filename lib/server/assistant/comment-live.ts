import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Displaying an @Numo response as it is written (migration
 * 20260909090000_numo_comment_live_stream).
 *
 * Two channels, and the distribution between the two is the whole point:
 *
 * LIVE — the text of the round, broadcast on the private topic
 * `numo-comment:{id}` at the cadence of `LIVE_FLUSH_MS`. Ephemeral: nothing is
 * written in base, nothing is refetched, the open thread repainted and that's it.
 * THE BASE — the only transitions that count: the current tool, the end, a
 * failure. Replayable, therefore readable by the tab which arrives along the way
 * or which has missed a message.
 *
 * Before, everything went through the base: an UPDATE every 900 ms, a complete refetch
 * of the thread behind each one. The text arrived in blocks and the end of the
 * message only appeared on final writing.
 *
 * We type the Realtime HTTP endpoint rather than opening a websocket, for the
 * same reason as the code agent (lib/server/agent/live.ts): the loop runs
 * in an after() which can be cut at any time, a stateless POST lends itself to this
 * better than a connection to maintain. The service key authorizes broadcast
 * on a private topic.
 *
 * Direct is best-effort from end to end: a failed broadcast must never
 * cause a response to fail — the thread polls as long as it is 'working'.
 */

/** Live cadence, aligned with that of the code agent (agent-loop.ts). */
const LIVE_FLUSH_MS = 250;

export function numoCommentTopic(commentId: string): string {
  return `numo-comment:${commentId}`;
}

/** Live payload: the COMPLETE state of the round, never a delta — un
 * lost message is therefore made up for in the next one, without a gap in the text. */
export interface NumoCommentLive {
  /** Answer as written so far. */
  text: string;
  /** Current tool, if there is one: it takes precedence over the text on the screen. */
  tool: string | null;
  /** Transmission timestamp (ms). The client throws what arrives out of order.
 * A counter would not be suitable: two POSTs left 250 ms apart can
 * very well arrive in the other direction, and an older text would erase the
 * end of the one already displayed. */
  at: number;
}

async function broadcast(commentId: string, payload: NumoCommentLive): Promise<void> {
  const url = process.env.MINDDY_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic: numoCommentTopic(commentId),
            event: "stream",
            payload,
            private: true,
          },
        ],
      }),
    });
  } catch {
    // The thread polls as long as the response is 'working': at worst, a delay.
  }
}

/** The response being written, seen from the server. */
export interface CommentDisplay {
  /** Text of the round as written so far — broadcast, throttled, never in base. */
  stream(text: string): void;
  /** A tool starts: in base (the arriving tab must see it) and live. */
  tool(name: string): void;
  /** End of response: the full text, then the frozen state. */
  finish(body: string): Promise<void>;
  /** Failure: empty body + 'error' status, the thread renders its line located. */
  fail(): Promise<void>;
}

export function commentDisplay(
  service: SupabaseClient,
  commentId: string,
  table: "comments" | "page_comments" = "comments"
): CommentDisplay {
  let currentTool: string | null = null;
  let lastFlushAt = 0;
  let lastFlushLen = -1;

  // The writings follow one another in single file. They left so far in
  // fire-and-forget: nothing guaranteed that the last one requested was the
  // last applied, and a partial UPDATE doubling the final UPDATE left the
  // comment truncated for good, in 'done' status.
  let writes: Promise<void> = Promise.resolve();
  const write = (fields: Record<string, unknown>): Promise<void> => {
    writes = writes.then(async () => {
      const { error } = await service
        .from(table)
        .update(fields)
        .eq("id", commentId);
      if (error) console.error("[numo-comment] update failed:", error.message);
    });
    return writes;
  };

  const push = (text: string): void => {
    void broadcast(commentId, { text, tool: currentTool, at: Date.now() });
  };

  return {
    stream(text) {
      // The model writes: the previous tool is finished. A single writing
      // toggle — not one per text fragment.
      if (currentTool !== null) {
        currentTool = null;
        void write({ assistant_tool: null });
      }
      const now = Date.now();
      if (text.length === lastFlushLen || now - lastFlushAt < LIVE_FLUSH_MS) return;
      lastFlushAt = now;
      lastFlushLen = text.length;
      push(text);
    },

    tool(name) {
      currentTool = name;
      // The next round starts with an empty text: without that, its first broadcast
      // could fall on the same length as the last one from the previous round
      // and get filtered.
      lastFlushLen = -1;
      push("");
      void write({ assistant_tool: name });
    },

    async finish(body) {
      currentTool = null;
      // The complete text goes LIVE first: the screen is up to date all the time
      // following. Without this flush, the last fragments — retained by the throttle —
      // only happened with the refetch triggered by the writing below, a
      // a good second later, and the end of the message fell straight away.
      push(body);
      await write({
        body,
        assistant_status: "done",
        assistant_tool: null,
      });
    },

    async fail() {
      currentTool = null;
      // Blank broadcast: the wire releases the direct and falls back onto the line
      // base, that the writing which follows passes into 'error'.
      push("");
      await write({
        body: "",
        assistant_status: "error",
        assistant_tool: null,
      });
    },
  };
}
