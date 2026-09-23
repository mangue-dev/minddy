import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CommentLiveTable } from "@/lib/comment-live-topic";
import { commentStore } from "@/lib/server/comment-store";

export { numoCommentTopic } from "@/lib/comment-live-topic";

// Persist throttled snapshots through encryption; Realtime sends only invalidations.
// SQL realtime.send stores its payload, so private topics cannot carry plaintext.
const LIVE_FLUSH_MS = 900;

/** The response being written, seen from the server. */
export interface CommentDisplay {
  /** Persist a throttled snapshot of the current answer. */
  stream(text: string): void;
  /** Persist the active tool so a newly opened tab can display it. */
  tool(name: string): void;
  /** End of response: the full text, then the frozen state. */
  finish(body: string): Promise<void>;
  /** Persist an empty body and the failure status. */
  fail(): Promise<void>;
}

export function commentDisplay(
  service: SupabaseClient,
  commentId: string,
  table: CommentLiveTable = "comments"
): CommentDisplay {
  let currentTool: string | null = null;
  let lastFlushAt = 0;
  let lastFlushLen = -1;

  // Serialize snapshots so a late partial write cannot truncate the final answer.
  let writes: Promise<void> = Promise.resolve();
  const write = (fields: Record<string, unknown>): Promise<void> => {
    writes = writes.catch(() => {}).then(async () => {
      const { error } = await commentStore(service, table).update(fields).eq("id", commentId);
      if (error) throw new Error("Unable to persist assistant comment");
    });
    return writes;
  };


  return {
    stream(text) {
      // Clear the previous tool once when text resumes.
      if (currentTool !== null) {
        currentTool = null;
        void write({ assistant_tool: null }).catch(() => {});
      }
      const now = Date.now();
      if (text.length === lastFlushLen || now - lastFlushAt < LIVE_FLUSH_MS) return;
      lastFlushAt = now;
      lastFlushLen = text.length;
      void write({ body: text }).catch(() => {});
    },

    tool(name) {
      currentTool = name;
      // The next round starts with an empty text: without that, its first snapshot
      // could fall on the same length as the last one from the previous round
      // and get filtered.
      lastFlushLen = -1;
      void write({ body: "", assistant_tool: name }).catch(() => {});
    },

    async finish(body) {
      currentTool = null;
      await write({
        body,
        assistant_status: "done",
        assistant_tool: null,
      });
    },

    async fail() {
      currentTool = null;
      await write({
        body: "",
        assistant_status: "error",
        assistant_tool: null,
      });
    },
  };
}
