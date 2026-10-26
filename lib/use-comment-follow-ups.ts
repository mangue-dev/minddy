"use client";

import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CommentFollowUp } from "@/lib/comment-follow-up";

type CommentFollowUps = Record<string, CommentFollowUp>;

/**
 * The query key, per project. Exported because it is a contract with the
 * realtime invalidation (lib/realtime-keys.ts): a comment event on one of the
 * project's tickets refreshes it.
 */
export const commentFollowUpsQueryKey = (projectId: string) => ["comment-follow-ups", projectId] as const;

/** A failed request throws: react-query keeps the previous counts and retries. */
async function fetchCommentFollowUps(projectId: string): Promise<CommentFollowUps> {
  const res = await fetch(`/api/projects/${projectId}/comment-follow-ups`);
  if (!res.ok) throw new Error(`comment-follow-ups ${res.status}`);
  const data = (await res.json()) as { followUps?: CommentFollowUps };
  return data.followUps ?? {};
}

/**
 * New comments on a board card's ticket since its MCP agent last commented
 * (MIN-801), or null. Every card of a project shares ONE request; the
 * `select` keeps a card from re-rendering when another ticket's count moves.
 */
export function useCommentFollowUp(projectId: string, issueId: string, enabled = true): CommentFollowUp | null {
  const select = useCallback((followUps: CommentFollowUps) => followUps[issueId] ?? null, [issueId]);
  const { data } = useQuery({
    queryKey: commentFollowUpsQueryKey(projectId),
    queryFn: () => fetchCommentFollowUps(projectId),
    enabled,
    select,
  });
  return data ?? null;
}
