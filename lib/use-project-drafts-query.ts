"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import {
  deleteProjectDraftApi,
  fetchProjectDraftsApi,
  saveProjectDraftApi,
} from "./project-drafts-api";
import type { ProjectDraft, ProjectDraftInput } from "./project-draft";

const DRAFTS_KEY = ["project-drafts"] as const;

export interface UseProjectDraftsResult {
  /** My drafts, newest to oldest (sidebar order). */
  drafts: ProjectDraft[];
  saveDraft: (draft: ProjectDraftInput) => Promise<ProjectDraft>;
  deleteDraft: (id: string) => Promise<void>;
}

/**
 * Project creation drafts (mounted once via `ProjectsProvider`).
 *
 * No real-time bridge: a draft is strictly personal and is only written
 * by the tab where the wizard runs — the invalidation which follows each write
 * is enough. Another tab will see it on its next edit.
 */
export function useProjectDrafts(): UseProjectDraftsResult {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: DRAFTS_KEY,
    queryFn: fetchProjectDraftsApi,
    enabled: !!user?.id,
  });

  const saveDraft = useCallback(
    async (draft: ProjectDraftInput) => {
      const saved = await saveProjectDraftApi(draft);
      await queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
      return saved;
    },
    [queryClient]
  );

  const deleteDraft = useCallback(
    async (id: string) => {
      await deleteProjectDraftApi(id);
      await queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
    [queryClient]
  );

  return { drafts: data ?? [], saveDraft, deleteDraft };
}
