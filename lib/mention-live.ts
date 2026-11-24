"use client";

import type { QueryClient } from "@tanstack/react-query";
import { isIssueStatus } from "@/lib/issue-constants";
import { isObjectiveStatus } from "@/lib/objective-validation";
import { refreshResolvedMention } from "@/lib/mention-resolution";
import { hasLivePageSession } from "@/lib/page-collaboration-signals";
import type { BroadcastChange } from "@/lib/realtime-keys";

/**
 * Mentions follow their target live. A pill named and colored by the server
 * (lib/mention-resolution.ts), and its hover card, kept the state they were
 * read with: on Home, the issue Numo had just moved still showed its old
 * status beside Numo's answer. Each change broadcast for an issue, objective
 * or page now refreshes the pills and cards that show it, our own writes
 * included, since only the lists were patched by them.
 */

const MENTION_TABLES = { issues: "issue", objectives: "objective", pages: "page" } as const;

type MentionTable = keyof typeof MENTION_TABLES;

const isMentionTable = (table: string): table is MentionTable => Object.hasOwn(MENTION_TABLES, table);

/** Refresh what the mentions on screen show of the target of `change`. */
export function refreshMentionsOfChange(queryClient: QueryClient, change: BroadcastChange): void {
  if (!isMentionTable(change.table)) return;
  const row = change.record ?? change.old_record;
  const id = row?.id;
  if (typeof id !== "string") return;
  const type = MENTION_TABLES[change.table];
  // A page being written here sends a change per typing batch; its pills
  // elsewhere catch up at their next read rather than at every keystroke.
  if (
    type === "page" &&
    change.operation === "UPDATE" &&
    hasLivePageSession(id) &&
    (change.record?.deleted_at ?? null) === (change.old_record?.deleted_at ?? null)
  ) return;
  const status = change.record?.status;
  refreshResolvedMention(type, id, {
    ...(type === "issue" && isIssueStatus(status) ? { issueStatus: status } : {}),
    ...(type === "objective" && isObjectiveStatus(status) ? { status } : {}),
  });
  // Hover cards (lib/use-mention-preview.ts): ["mention-preview", shape, type, id, project].
  void queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === "mention-preview" && queryKey[2] === type && queryKey[3] === id,
  });
}
