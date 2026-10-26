"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { prEndpoint, setPrReviewThreadResolvedApi } from "@/lib/agent-api";
import { prReviewCommentsQueryOptions } from "@/lib/pr-activity-query";
import { parseMirroredRemoteId, parseThreadKey } from "@/lib/pr-comment-mirror";
import { groupReviewThreads, type ReviewThreadState } from "@/lib/pr-review-threads";
import type { Comment } from "@/lib/types";

/**
 * A ticket comment thread mirrored from a pull request (MIN-802), seen from
 * the forge: which forge and PR it belongs to, and — for a code thread — its
 * LIVE resolution and outdated state.
 *
 * Those two states are never stored: a thread becomes outdated when someone
 * pushes, without any comment event. They are read from the forge with the
 * PR view's own query (`prReviewCommentsQueryOptions`), so both surfaces share
 * one cache and one live channel. A viewer without access to the repository
 * gets no state, hence no badge and no Resolve action, rather than a guess.
 */
export function useForgeThread(root: Pick<Comment, "github">) {
  const origin = root.github ?? null;
  const remote = origin?.remote_comment_id ? parseMirroredRemoteId(origin.remote_comment_id) : null;
  const prId = origin?.pull_request_id ?? null;
  const provider = origin?.provider ?? remote?.provider ?? "github";
  const isCode = remote?.kind === "code";
  const endpoint = prId ? prEndpoint(prId) : null;
  const query = useQuery({
    ...prReviewCommentsQueryOptions(endpoint),
    enabled: !!endpoint && isCode,
  });

  const thread = useMemo(() => {
    const key = parseThreadKey(origin?.thread_key);
    if (!query.data || !key) return null;
    return groupReviewThreads(query.data.comments, query.data.threads).find((candidate) =>
      "rootCommentId" in key
        ? candidate.id === key.rootCommentId
        : candidate.resolution?.threadId === key.discussionId) ?? null;
  }, [query.data, origin?.thread_key]);

  const state: ReviewThreadState | null = thread?.resolution ?? null;
  return {
    /** The comment answers on a forge, through this pull request. */
    prId,
    provider,
    isCode,
    endpoint,
    state,
    resolved: state?.resolved ?? false,
    outdated: thread ? (state?.outdated ?? thread.root.line == null) : false,
  };
}

export type ForgeThread = ReturnType<typeof useForgeThread>;

/**
 * Resolve / Reopen a mirrored code thread on the forge, like the PR view does:
 * under the person's own git account, optimistic in the shared cache, rolled
 * back with the forge's message when it refuses.
 */
export function ForgeThreadResolveButton({ thread }: { thread: ForgeThread }) {
  const t = useTranslations("PullRequests");
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const { endpoint, state } = thread;

  const toggle = useCallback(async () => {
    if (!endpoint || !state || pending) return;
    const queryKey = ["pr-review-comments", endpoint] as const;
    const apply = (resolved: boolean) =>
      queryClient.setQueryData<{ threads: ReviewThreadState[] } & Record<string, unknown>>(queryKey,
        (current) => current && {
          ...current,
          threads: current.threads.map((candidate) =>
            candidate.threadId === state.threadId ? { ...candidate, resolved } : candidate),
        });
    const next = !state.resolved;
    setPending(true);
    apply(next);
    try {
      await setPrReviewThreadResolvedApi(endpoint, { threadId: state.threadId, resolved: next });
      await queryClient.invalidateQueries({ queryKey });
    } catch (err) {
      apply(!next);
      toast.error((err as Error).message);
    } finally {
      setPending(false);
    }
  }, [endpoint, state, pending, queryClient]);

  if (!state) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-full"
      disabled={pending}
      onClick={() => void toggle()}
      data-testid="forge-thread-resolve"
    >
      {pending && <Spinner />}
      {state.resolved ? t("unresolveThread") : t("resolveThread")}
    </Button>
  );
}
