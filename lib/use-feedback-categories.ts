"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TeamFeedbackDetail, TeamFeedbackListItem } from "@/lib/server/feedback/team-queries";

/** Debounce category writes while keeping every filtered list authoritative. */
export function useFeedbackCategories(projectId: string, postId: string,
  save: (ids: string[]) => Promise<unknown>, onError: (error: unknown) => void) {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<string[] | null>(null);
  const flush = useCallback(async (ids: string[]) => {
    try { await save(ids); }
    catch (error) { onError(error); }
    finally {
      // A category filter can gain or lose a request after the write settles.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["feedback", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId, postId] }),
      ]);
    }
  }, [save, onError, queryClient, projectId, postId]);

  const change = useCallback((ids: string[]) => {
    queryClient.setQueryData<{ post: TeamFeedbackDetail }>(["feedback-detail", projectId, postId],
      (old) => old ? { ...old, post: { ...old.post, category_ids: ids } } : old);
    queryClient.setQueriesData<{ posts: TeamFeedbackListItem[]; board_enabled: boolean }>({ queryKey: ["feedback", projectId] },
      (old) => old ? { ...old, posts: old.posts.map((post) => post.id === postId ? { ...post, category_ids: ids } : post) } : old);
    latest.current = ids;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const finalIds = latest.current;
      latest.current = null;
      if (finalIds) void flush(finalIds);
    }, 300);
  }, [projectId, postId, queryClient, flush]);

  useEffect(() => () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    const ids = latest.current;
    latest.current = null;
    if (ids) void flush(ids);
  }, [flush]);
  return change;
}
