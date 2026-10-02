"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "mangue-ui";
import { setPrCommentReactionApi, setPrReviewCommentReactionApi, type PrEndpoint } from "./agent-api";
import { groupReactionsByComment, type ReviewCommentReaction, type ReviewReactionContent } from "./pr-review-reactions";
import { commentReactionsKey, setPrReactionOptimistically, type ReactionSurface } from "./optimistic/pr-reaction-writes";

/** Shared optimistic reactions for PR conversations, bodies, and inline comments. */
export function useCommentReactions(
  endpoint: PrEndpoint,
  onChanged: () => unknown,
  reactions: ReviewCommentReaction[],
  canReact: boolean,
  surface: ReactionSurface = "review",
) {
  const queryClient = useQueryClient();
  const pendingRef = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const byComment = useMemo(() => groupReactionsByComment(reactions), [reactions]);

  const toggle = useCallback(
    async (commentId: number, content: ReviewReactionContent, on: boolean) => {
      const id = `${endpoint}:${surface}:${commentId}:${content}`;
      if (!canReact || pendingRef.current.has(id)) return;
      pendingRef.current.add(id);
      setPendingIds(new Set(pendingRef.current));
      try {
        const post = surface === "review" ? setPrReviewCommentReactionApi : setPrCommentReactionApi;
        await setPrReactionOptimistically(queryClient, commentReactionsKey(endpoint, surface), { commentId, content, on },
          () => post(endpoint, { commentId, content, on }));
        // Refresh errors must not roll back a write the forge already accepted.
        await onChanged();
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        pendingRef.current.delete(id);
        setPendingIds(new Set(pendingRef.current));
      }
    },
    [endpoint, onChanged, canReact, queryClient, surface],
  );

  return {
    byComment, canReact, toggle,
    isPending: (commentId: number, content: ReviewReactionContent) => pendingIds.has(`${endpoint}:${surface}:${commentId}:${content}`),
  };
}

export type CommentReactions = ReturnType<typeof useCommentReactions>;
