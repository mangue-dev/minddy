"use client";

import type { QueryClient } from "@tanstack/react-query";
import { setCommentReactionState, type ReviewCommentReaction, type ReviewReactionContent } from "../pr-review-reactions";

export type ReactionSurface = "review" | "conversation";
type ReactionKey = readonly ["pr-review-comments" | "pr-comments", string];
interface ReactionPayload { reactions: ReviewCommentReaction[] }
interface ReactionWrite {
  commentId: number;
  content: ReviewReactionContent;
  on: boolean;
  settledAt: number | null;
}
const writes = new WeakMap<QueryClient, Map<string, Set<ReactionWrite>>>();

export function commentReactionsKey(endpoint: string, surface: ReactionSurface): ReactionKey {
  return surface === "review"
    ? ["pr-review-comments", endpoint]
    : ["pr-comments", endpoint.replace(/^\/api\/pull-requests\//, "")];
}

function pendingWrites(client: QueryClient, key: ReactionKey): Set<ReactionWrite> {
  let queries = writes.get(client);
  if (!queries) { queries = new Map(); writes.set(client, queries); }
  const hash = JSON.stringify(key);
  let pending = queries.get(hash);
  if (!pending) { pending = new Set(); queries.set(hash, pending); }
  for (const write of pending) {
    if (write.settledAt !== null && write.settledAt <= Date.now() - 30_000) pending.delete(write);
  }
  return pending;
}

/** Keep pending viewer state on reads that left before the forge confirmed it. */
export function applyPendingPrReactions<T extends ReactionPayload>(client: QueryClient, key: ReactionKey, data: T, startedAt: number): T {
  let reactions = data.reactions;
  for (const write of pendingWrites(client, key)) {
    if (write.settledAt !== null && write.settledAt <= startedAt) continue;
    reactions = setCommentReactionState(reactions, write.commentId, write.content, write.on);
  }
  return reactions === data.reactions ? data : { ...data, reactions };
}

/** Patch shared comment data synchronously; roll back only this viewer's contribution. */
export async function setPrReactionOptimistically(
  client: QueryClient,
  key: ReactionKey,
  input: { commentId: number; content: ReviewReactionContent; on: boolean },
  save: () => Promise<{ on: boolean }>,
): Promise<void> {
  void client.cancelQueries({ queryKey: key, exact: true });
  const pending = pendingWrites(client, key);
  const before = client.getQueryData<ReactionPayload>(key)?.reactions.find((r) => r.commentId === input.commentId && r.content === input.content);
  const write = { ...input, settledAt: null } as ReactionWrite;
  pending.add(write);
  const apply = (on: boolean) => client.setQueryData<ReactionPayload>(key, (old) =>
    old ? { ...old, reactions: setCommentReactionState(old.reactions, input.commentId, input.content, on) } : old,
  );
  apply(input.on);
  try {
    const result = await save();
    write.on = result.on;
    write.settledAt = Date.now();
    apply(result.on);
  } catch (error) {
    pending.delete(write);
    client.setQueryData<ReactionPayload>(key, (old) => {
      if (!old) return old;
      const restored = setCommentReactionState(old.reactions, input.commentId, input.content, !!before?.mine);
      return { ...old, reactions: restored.map((r) =>
        r.commentId === input.commentId && r.content === input.content ? { ...before, ...r } : r,
      ) };
    });
    throw error;
  }
}
